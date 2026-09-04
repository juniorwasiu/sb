const { Result, HistoryLog } = require('./db_init');
const EventEmitter = require('events');
const dbEvents = new EventEmitter();

// ── GLOBAL_CACHE reference — imported lazily ──────────
function invalidateReaderCache() {
    try {
        const reader = require('./db_reader');
        if (reader.GLOBAL_CACHE) {
            reader.GLOBAL_CACHE.resultsTimestamp = 0;
            console.log('[DB Uploader] ♻️ Reader in-memory cache invalidated.');
        }
    } catch (_) {
        // Non-fatal — cache will expire on its own TTL
    }
}

// ── Data Quality Helpers ──────────────────────────────────────────────────────

function normalizeScore(score) {
    if (!score || typeof score !== 'string') return null;
    const cleaned = score.replace(/\s/g, '').replace('-', ':');
    return /^\d+:\d+$/.test(cleaned) ? cleaned : null;
}

function isValidDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return false;
    const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;
    const [, d, m, y] = match.map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ── Main Upload Function ──────────────────────────────────────────────────────

async function uploadMatchesToDatabase(matches, onProgress = () => {}) {
    console.log(`[DB Uploader] 🚀 Starting upload of ${matches.length} records...`);
    onProgress(`🔗 Connected to MongoDB. Preparing batch upload of ${matches.length} records...`);

    let uploaded = 0;
    let skipped = 0;
    
    // We use Mongoose bulkWrite to do updates efficiently
    const bulkOps = [];

    for (const match of matches) {
        if (!match.league) {
            console.warn('[DB Uploader] ⚠️ Skipping match — missing league field:', JSON.stringify(match).slice(0, 120));
            skipped++;
            continue;
        }

        if (!isValidDDMMYYYY(match.date)) {
            console.warn(`[DB Uploader] ⚠️ Skipping match — invalid date "${match.date}" (gameId: ${match.gameId})`);
            skipped++;
            continue;
        }

        if (!match.gameId) {
            const home = (match.homeTeam || match.home || 'unknown').replace(/\s+/g, '');
            const time = (match.time || '00:00').replace(':', '');
            match.gameId = `fallback_${time}_${home}`;
        }

        const normalizedScore = normalizeScore(match.score);

        // Format: "2026-04-15_36579_England___Virtual"
        const dateSafe = match.date.replace(/\//g, '-');
        const leagueSafe = match.league.replace(/[^a-zA-Z0-9_-]/g, '_');
        const docId = `${dateSafe}_${match.gameId}_${leagueSafe}`;

        const payload = {
            ...match,
            score: normalizedScore,
            sourceTag: match.sourceTag || 'upload',
        };

        // upsert via bulkWrite
        bulkOps.push({
            updateOne: {
                filter: { _id: docId },
                update: { $set: payload },
                upsert: true
            }
        });
        
        uploaded++;
    }

    if (bulkOps.length > 0) {
        try {
            await Result.bulkWrite(bulkOps, { ordered: false });
            onProgress(`📤 Committed ${uploaded} records to MongoDB.`);
            console.log(`[DB Uploader] ✅ Committed ${uploaded} records.`);
            dbEvents.emit('db-updated');
        } catch (err) {
            console.error(`[DB Uploader] ❌ Bulk write failed:`, err);
            // In case of bulk write errors, some might have succeeded.
            // We'll just continue.
        }
    }

    console.log(`[DB Uploader] 🔥 Upload complete — ${uploaded} processed | ${skipped} skipped.`);
    invalidateReaderCache();

    return { uploaded, skipped };
}

// ── Smart Incremental Sync ────────────────────────────────────────────────────────────────────────────────

/**
 * Compares incoming matches against what's already in MongoDB.
 * Only writes records that are NEW (not in DB) or CHANGED (score updated).
 * Returns { inserted, updated, unchanged, skipped } for clear logging.
 *
 * @param {Array}    matches     - Freshly scraped match objects
 * @param {Function} onProgress  - Optional progress callback
 */
async function syncMatchesToDatabase(matches, onProgress = () => {}) {
    console.log(`[DB Sync] 🔄 Smart sync starting for ${matches.length} incoming records...`);

    let inserted  = 0;
    let updated   = 0;
    let unchanged = 0;
    let skipped   = 0;
    const bulkOps = [];

    for (const match of matches) {
        // ── Validation ────────────────────────────────────────────────────────────────────
        if (!match.league || !isValidDDMMYYYY(match.date)) {
            console.warn(`[DB Sync] ⚠️  Skip — missing league or invalid date:`, JSON.stringify(match).slice(0, 100));
            skipped++;
            continue;
        }

        // Ensure gameId fallback
        if (!match.gameId) {
            const home = (match.homeTeam || match.home || 'unknown').replace(/\s+/g, '');
            const time = (match.time || '00:00').replace(':', '');
            match.gameId = `fallback_${time}_${home}`;
        }

        const normalizedScore = normalizeScore(match.score);
        const dateSafe   = match.date.replace(/\//g, '-');
        const leagueSafe = match.league.replace(/[^a-zA-Z0-9_-]/g, '_');
        const docId      = `${dateSafe}_${match.gameId}_${leagueSafe}`;

        // ── Fetch existing doc to diff against ─────────────────────────────────────────
        const existing = await Result.findById(docId).lean();

        if (!existing) {
            // Brand new record — always insert
            console.log(`[DB Sync] ➕ NEW   ${docId} score=${normalizedScore}`);
            inserted++;
        } else if (existing.score !== normalizedScore) {
            // Score changed (e.g. match completed during ongoing day)
            console.log(`[DB Sync] ✏️  UPDATED ${docId}: ${existing.score} → ${normalizedScore}`);
            updated++;
        } else {
            // Nothing changed — skip to avoid pointless write
            unchanged++;
            continue;
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: docId },
                update: {
                    $set: {
                        ...match,
                        score:     normalizedScore,
                        sourceTag: match.sourceTag || 'auto-sync',
                        updatedAt: new Date(),
                    }
                },
                upsert: true,
            }
        });
    }

    // ── Commit to MongoDB ────────────────────────────────────────────────────────────────────
    if (bulkOps.length > 0) {
        try {
            const result = await Result.bulkWrite(bulkOps, { ordered: false });
            console.log(`[DB Sync] ✅ BulkWrite done — upsertedCount=${result.upsertedCount}, modifiedCount=${result.modifiedCount}`);
            onProgress(`📄 ${inserted} new | ✏️ ${updated} updated | ⏸️ ${unchanged} unchanged | ❌ ${skipped} skipped`);
            dbEvents.emit('db-updated');
        } catch (err) {
            console.error(`[DB Sync] ❌ BulkWrite error:`, err.message);
            onProgress(`❌ Sync write error: ${err.message}`);
        }
    } else {
        console.log(`[DB Sync] ⏸️  Everything up-to-date. ${unchanged} unchanged, ${skipped} skipped.`);
        onProgress(`⏸️ Nothing changed — ${unchanged} records already current.`);
    }

    if (bulkOps.length > 0) invalidateReaderCache();

    return { inserted, updated, unchanged, skipped };
}

// ── History Log Helpers ───────────────────────────────────────────────────────

async function getDatabaseHistoryLog(logKey) {
    console.log(`[DB Uploader] 📖 Reading history log: ${logKey}`);
    const doc = await HistoryLog.findById(logKey).lean();
    if (!doc) {
        console.log(`[DB Uploader] ℹ️ No history log found for key: ${logKey}`);
        return null;
    }
    return doc;
}

async function setDatabaseHistoryLog(logKey, record) {
    console.log(`[DB Uploader] 📝 Saving history log: ${logKey}`, JSON.stringify(record).slice(0, 120));
    // merge update
    await HistoryLog.findByIdAndUpdate(
        logKey, 
        { $set: { ...record, updatedAt: new Date() } }, 
        { upsert: true }
    );
}

module.exports = {
    uploadMatchesToDatabase,
    // export with original names for backwards compatibility during migration, 
    // or we can replace all imports if needed. I'll export them both ways just in case
    uploadMatchesToFirebase: uploadMatchesToDatabase,
    syncMatchesToDatabase,
    getDatabaseHistoryLog,
    getFirebaseHistoryLog: getDatabaseHistoryLog,
    setDatabaseHistoryLog,
    setFirebaseHistoryLog: setDatabaseHistoryLog,
    normalizeScore,
    isValidDDMMYYYY,
    invalidateReaderCache,
    dbEvents
};
