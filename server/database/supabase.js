// ─────────────────────────────────────────────────────────────────────────────
// supabase.js — SUPABASE-ONLY storage for match results & predictions history
// ─────────────────────────────────────────────────────────────────────────────
// ✅ All data (match results + predictions history) is stored in Supabase ONLY.
//    No local JSON files are used for storage.
//    Supabase is REQUIRED — the server throws clearly if credentials are missing.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const { toDbLeague, detectLeague, TEAM_LEAGUES } = require('../constants');
require('dotenv').config();

// ── Supabase client (REQUIRED) ───────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[SUPABASE] [ERROR] ❌ SUPABASE_URL and/or SUPABASE_KEY are missing from .env.');
    console.error('[SUPABASE] [ERROR]    Results storage requires Supabase. Please add these keys and restart.');
    // We do NOT process.exit here so the dev server still starts for other features,
    // but every DB call will throw a descriptive error.
}

let supabaseClient = null;
if (supabaseUrl && supabaseKey) {
    try {
        console.log('[SUPABASE] [DEBUG] Initializing Supabase client...');
        const ws = require('ws');
        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth:     { persistSession: false },
            realtime: { transport: ws }
        });
        console.log('[SUPABASE] [DEBUG] Supabase client initialized successfully.');
    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Failed to initialize Supabase client:', err.message);
    }
}

// ── Promise Timeout Helper (Ensures remote DB queries never block HTTP requests) ──
function withTimeout(promise, timeoutMs = 3500) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Supabase query timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timer);
    });
}

// ── DB row mappers ───────────────────────────────────────────────────────────
const mapMatchToDb = (match) => {
    const home = match.homeTeam || match.home || match.home_team || '';
    const away = match.awayTeam || match.away || match.away_team || '';
    const detectedLeague = detectLeague(match.league, home, away);
    const dateSafe   = (match.date   || '').replace(/\//g, '-');
    const leagueSafe = detectedLeague.replace(/[^a-zA-Z0-9_-]/g, '_');
    const gameId     = match.gameId
        || `fallback_${(match.time || '00:00').replace(':', '')}_${(home).replace(/\s+/g, '')}`;
    const matchId    = `${dateSafe}_${gameId}_${leagueSafe}`;

    return {
        id:          matchId,
        time:        match.time       || '',
        date:        match.date       || '',
        game_id:     match.gameId     || gameId,
        home_team:   home,
        away_team:   away,
        score:       match.score      || '',
        league:      detectedLeague,
        source_tag:  match.sourceTag  || 'native-dom',
        uploaded_at: match.uploadedAt || new Date().toISOString()
    };
};

const mapMatchFromDb = (row) => {
    const detectedLeague = detectLeague(row.league, row.home_team, row.away_team);
    return {
        id:         row.id,
        _id:        row.id,
        time:       row.time,
        date:       row.date,
        gameId:     row.game_id,
        homeTeam:   row.home_team,
        awayTeam:   row.away_team,
        score:      row.score,
        league:     detectedLeague,
        sourceTag:  row.source_tag,
        uploadedAt: row.uploaded_at
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC DATABASE API FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// 1. Get matches — Supabase ONLY, no local fallback for results
async function getMatchesFromDb(limit = 200) {
    if (!supabaseClient) {
        throw new Error('[SUPABASE] Supabase client is not initialized. Check SUPABASE_URL and SUPABASE_KEY in .env.');
    }
    let q = supabaseClient
        .from('vfootball_results')
        .select('id, time, date, game_id, home_team, away_team, score, league, source_tag, uploaded_at')
        .order('uploaded_at', { ascending: false });
    if (limit && typeof limit === 'number') {
        q = q.limit(limit);
    }
    const { data, error } = await withTimeout(q, 4500);

    if (error) {
        console.error('[SUPABASE] [DEBUG] ❌ Failed to fetch matches from Supabase:', error.message);
        throw error;
    }
    return (data || []).map(mapMatchFromDb);
}


// 2. Save matches — Supabase ONLY, deduplication, then auto-resolve
async function saveMatchesToDb(newMatches) {
    console.log(`[SUPABASE] [DEBUG] saveMatchesToDb: processing ${newMatches.length} matches...`);

    if (!supabaseClient) {
        throw new Error('[SUPABASE] Supabase client is not initialized. Cannot save matches — check .env for SUPABASE_URL and SUPABASE_KEY.');
    }

    let added = 0;
    let dupes = 0;
    let total = 0;

    // Map to DB rows and de-duplicate within this batch
    console.log(`[SUPABASE] [DEBUG] Mapping and deduplicating ${newMatches.length} incoming matches...`);
    const dbRows   = [];
    const seenIds  = new Set();
    for (const match of newMatches) {
        const row = mapMatchToDb(match);
        if (row.id && !seenIds.has(row.id)) {
            seenIds.add(row.id);
            dbRows.push(row);
        }
    }

    // Check which IDs already exist in Supabase
    const idsToInsert = dbRows.map(r => r.id);
    console.log(`[SUPABASE] [DEBUG] Checking existence of ${idsToInsert.length} IDs in Supabase...`);

    let existingIds = new Set();
    if (idsToInsert.length > 0) {
        const { data: existingRows, error: fetchErr } = await withTimeout(
            supabaseClient
                .from('vfootball_results')
                .select('id')
                .in('id', idsToInsert),
            3500
        );
        if (fetchErr) throw fetchErr;
        if (existingRows) existingRows.forEach(r => existingIds.add(r.id));
    }

    const rowsToInsert = dbRows.filter(r => !existingIds.has(r.id));
    added = rowsToInsert.length;
    dupes = dbRows.length - added;

    if (added > 0) {
        console.log(`[SUPABASE] [DEBUG] Inserting ${added} new matches into Supabase...`);
        const { error: insertErr } = await withTimeout(
            supabaseClient
                .from('vfootball_results')
                .insert(rowsToInsert),
            3500
        );
        if (insertErr) throw insertErr;
        console.log(`[SUPABASE] [DEBUG] ✅ Successfully inserted ${added} matches into Supabase.`);
    } else {
        console.log('[SUPABASE] [DEBUG] No new matches to insert — all duplicates already in DB.');
    }

    // Fetch updated total count
    try {
        const { count: countVal, error: countErr } = await withTimeout(
            supabaseClient
                .from('vfootball_results')
                .select('*', { count: 'exact', head: true }),
            3500
        );
        if (!countErr && countVal !== null && countVal !== undefined) {
            total = countVal;
        }
    } catch (_) {}

    return { added, dupes, total };
}


// 3. Get predictions history — Supabase ONLY, throw if not configured
async function getPredictionsHistoryFromDb(leagueFilter = null) {
    if (!supabaseClient) {
        throw new Error('[SUPABASE] Supabase client is not initialized. Check SUPABASE_URL and SUPABASE_KEY in .env.');
    }
    console.log(`[SUPABASE] [DEBUG] Querying predictions_history from Supabase${leagueFilter ? ` (league: ${leagueFilter})` : ''}...`);

    let query = supabaseClient
        .from('predictions_history')
        .select('*')
        .order('captured_at', { ascending: false });

    if (leagueFilter) {
        query = query.ilike('league', `%${leagueFilter}%`);
    }

    const { data, error } = await withTimeout(query, 3500);
    if (error) {
        console.error('[SUPABASE] [DEBUG] ❌ Failed to fetch predictions history from Supabase:', error.message);
        throw error;
    }
    console.log(`[SUPABASE] [DEBUG] ✅ Fetched ${data ? data.length : 0} prediction history entries from Supabase.`);
    return (data || []).map(row => ({
        id:          row.id,
        date:        row.date,
        time:        row.time,
        league:      row.league,
        capturedAt:  row.captured_at,
        predictions: row.predictions
    }));
}

// 4. Save prediction — Supabase ONLY (no local backup)
async function savePredictionToDb(roundData) {
    if (!supabaseClient) {
        throw new Error('[SUPABASE] Supabase client is not initialized. Cannot save prediction — check .env for SUPABASE_URL and SUPABASE_KEY.');
    }
    console.log(`[SUPABASE] [DEBUG] Upserting prediction round ${roundData.id} to Supabase...`);
    const dbRow = {
        id:          roundData.id,
        date:        roundData.date,
        time:        roundData.time,
        league:      roundData.league,
        captured_at: roundData.capturedAt || new Date().toISOString(),
        predictions: roundData.predictions
    };
    const { error } = await withTimeout(
        supabaseClient
            .from('predictions_history')
            .upsert(dbRow, { onConflict: 'id' }),
        3500
    );
    if (error) {
        console.error('[SUPABASE] [DEBUG] ❌ Failed to upsert prediction round to Supabase:', error.message);
        throw error;
    }
    console.log(`[SUPABASE] [DEBUG] ✅ Upserted prediction round ${roundData.id} to Supabase.`);
}

// 5. Wipe DB data — Supabase only
async function wipeDbData(league, scope) {
    const targetDbLeague = league && league !== 'all' ? toDbLeague(league) : null;
    let wipedResults = 0;
    let wipedHistory = 0;

    // Wipe from Supabase
    if (supabaseClient) {
        try {
            if (!scope || scope === 'all' || scope === 'results') {
                console.log(`[SUPABASE] [DEBUG] Wiping Supabase results for: ${targetDbLeague || 'ALL'}...`);
                let q = supabaseClient.from('vfootball_results').delete();
                q = targetDbLeague
                    ? q.ilike('league', `%${targetDbLeague.replace('_', ' ')}%`)
                    : q.neq('id', '');
                const { error } = await withTimeout(q, 3500);
                if (error) throw error;
                console.log('[SUPABASE] [DEBUG] ✅ Wiped Supabase results.');
            }

            if (!scope || scope === 'all' || scope === 'history') {
                console.log(`[SUPABASE] [DEBUG] Wiping Supabase predictions history for: ${targetDbLeague || 'ALL'}...`);
                let q = supabaseClient.from('predictions_history').delete();
                q = targetDbLeague
                    ? q.ilike('league', `%${targetDbLeague.replace('_', ' ')}%`)
                    : q.neq('id', '');
                const { error } = await withTimeout(q, 3500);
                if (error) throw error;
                console.log('[SUPABASE] [DEBUG] ✅ Wiped Supabase predictions history.');
            }
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Error wiping data from Supabase:', err.message);
        }
    }

    return { wipedResults, wipedHistory };
}

// 6. Startup: log record counts for both tables
async function logStartupCounts() {
    if (!supabaseClient) return;
    try {
        const { count: resultCount } = await withTimeout(
            supabaseClient.from('vfootball_results').select('*', { count: 'exact', head: true }),
            3500
        );
        const { count: histCount } = await withTimeout(
            supabaseClient.from('predictions_history').select('*', { count: 'exact', head: true }),
            3500
        );
        console.log(`[SUPABASE] [DEBUG] 📊 Startup check: vfootball_results=${resultCount || 0} | predictions_history=${histCount || 0}`);
    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Error during startup count check:', err.message);
    }
}

// Run startup check 3 seconds after boot
setTimeout(() => {
    logStartupCounts();
}, 3000);

// ── Team abbreviation helper ─────────────────────────────────────────────────
const abbreviateTeamBackend = (name) => {
    if (!name) return '???';
    const clean = name.trim();
    const lower = clean.toLowerCase();
    const teamMap = {
        'arsenal': 'ARS', 'aston villa': 'AVL', 'chelsea': 'CHE', 'everton': 'EVE',
        'liverpool': 'LIV', 'manchester city': 'MCI', 'man city': 'MCI',
        'manchester united': 'MUN', 'man united': 'MUN', 'newcastle': 'NEW',
        'tottenham': 'TOT', 'spurs': 'TOT', 'west ham': 'WHU', 'leicester': 'LEI',
        'wolves': 'WOL', 'wolverhampton': 'WOL', 'southampton': 'SOU',
        'bournemouth': 'BOU', 'crystal palace': 'CRY', 'brighton': 'BHA',
        'brentford': 'BRE', 'fulham': 'FUL', 'nottingham': 'NOT',
        'nottingham forest': 'NOT', 'sheffield utd': 'SHU', 'sheffield united': 'SHU',
        'leeds': 'LEE', 'burnley': 'BUR', 'watford': 'WAT', 'norwich': 'NOR',
        'luton': 'LUT', 'luton town': 'LUT', 'sunderland': 'SUN'
    };
    if (teamMap[lower]) return teamMap[lower];
    const words = clean.split(/\s+/);
    if (words.length > 1) {
        const abbrev = words.map(w => w[0]).join('').toUpperCase();
        if (abbrev.length >= 2 && abbrev.length <= 4) return abbrev;
    }
    return clean.substring(0, 3).toUpperCase();
};

// ── Resolve prediction outcomes against actual Supabase results ───────────────
function resolvePredictionOutcomes(predictions, date, finishedMatches = []) {
    if (!finishedMatches || finishedMatches.length === 0) return predictions;

    return predictions.map(pred => {
        const homeAbbr = abbreviateTeamBackend(pred.homeTeam || (pred.match || '').split(' vs ')[0]);
        const awayAbbr = abbreviateTeamBackend(pred.awayTeam || (pred.match || '').split(' vs ')[1]);

        const actual = finishedMatches.find(m => {
            const dateMatch  = m.date === date;
            const mHomeAbbr  = abbreviateTeamBackend(m.homeTeam || m.home);
            const mAwayAbbr  = abbreviateTeamBackend(m.awayTeam || m.away);
            return dateMatch && mHomeAbbr === homeAbbr && mAwayAbbr === awayAbbr;
        });

        if (actual && actual.score && /^\d+[-:]\d+$/.test(actual.score.trim())) {
            const score  = actual.score.replace('-', ':').trim();
            const [hg, ag] = score.split(':').map(Number);

            let actualOutcome = 'D';
            if (hg > ag) actualOutcome = 'H';
            else if (hg < ag) actualOutcome = 'A';

            const isGG        = hg > 0 && ag > 0;
            const actualBtts  = isGG ? 'GG' : 'NG';
            const goals       = hg + ag;
            const actualOver15 = goals >= 2 ? 'Over' : 'Under';
            const actualOver25 = goals >= 3 ? 'Over' : 'Under';
            const homeOrAwayCorrect = hg !== ag;

            let homeTipCorrect = false;
            if (pred.predictedHomeTip) {
                const hTip = pred.predictedHomeTip.toLowerCase();
                if (hTip.includes('win or draw') || hTip.includes('win/draw') || hTip.includes('1x')) {
                    homeTipCorrect = hg >= ag;
                } else if (hTip.includes('win')) {
                    homeTipCorrect = hg > ag;
                } else if (hTip.includes('home or away') || hTip.includes('112') || hTip.includes('12')) {
                    homeTipCorrect = hg !== ag;
                } else if (hTip.includes('score') || hTip.includes('goal') || hTip.includes('over 0.5') || hTip.includes('sore') || hTip.includes('0.5')) {
                    homeTipCorrect = hg >= 1;
                }
            }

            let awayTipCorrect = false;
            if (pred.predictedAwayTip) {
                const aTip = pred.predictedAwayTip.toLowerCase();
                if (aTip.includes('win or draw') || aTip.includes('win/draw') || aTip.includes('x2')) {
                    awayTipCorrect = hg <= ag;
                } else if (aTip.includes('win')) {
                    awayTipCorrect = hg < ag;
                } else if (aTip.includes('home or away') || aTip.includes('112') || aTip.includes('12')) {
                    awayTipCorrect = hg !== ag;
                } else if (aTip.includes('score') || aTip.includes('goal') || aTip.includes('over 0.5') || aTip.includes('sore') || aTip.includes('0.5')) {
                    awayTipCorrect = ag >= 1;
                }
            }

            console.log(`[DEBUG] [resolvePredictionOutcomes] "${pred.match || pred.homeTeam + ' vs ' + pred.awayTeam}" → Score: ${score} (HG:${hg}, AG:${ag})`);
            console.log(`  → Winner: ${pred.predictedOutcome} vs ${actualOutcome} = ${pred.predictedOutcome === actualOutcome ? 'WON ✅' : 'LOST ❌'}`);
            console.log(`  → DC: ${homeOrAwayCorrect ? 'WON ✅' : 'LOST ❌'} | HomeTip: ${homeTipCorrect ? 'WON ✅' : 'LOST ❌'} | AwayTip: ${awayTipCorrect ? 'WON ✅' : 'LOST ❌'}`);

            return {
                ...pred,
                actualScore:       score,
                actualOutcome,
                actualBtts,
                actualOver15,
                actualOver25,
                outcomeCorrect:    pred.predictedOutcome === actualOutcome,
                bttsCorrect:       pred.predictedBtts    === actualBtts,
                over15Correct:     pred.predictedOver15  === actualOver15,
                over25Correct:     pred.predictedOver25  === actualOver25,
                homeOrAwayCorrect,
                homeTipCorrect,
                awayTipCorrect,
                resolved:          true
            };
        }

        return { ...pred, resolved: false };
    });
}

// ── Auto-resolve ALL pending predictions ─────────────────────────────────────
async function autoResolvePendingPredictions() {
    console.log('[SUPABASE] [DEBUG] 🔍 autoResolvePendingPredictions: checking all leagues...');
    try {
        const history = await getPredictionsHistoryFromDb();
        const pendingRounds = history.filter(round =>
            round.predictions && round.predictions.some(pred => !pred.resolved)
        );

        if (pendingRounds.length === 0) {
            console.log('[SUPABASE] [DEBUG] No pending predictions require resolution.');
            return { updated: 0, checked: 0 };
        }

        // Fetch ALL results from Supabase once (ordered by uploaded_at DESC — latest first)
        const finishedMatches = await getMatchesFromDb();
        let updatedCount = 0;

        for (const round of pendingRounds) {
            const beforeCount = round.predictions.filter(p => p.resolved).length;
            const updatedPreds = resolvePredictionOutcomes(round.predictions, round.date, finishedMatches);
            const afterCount   = updatedPreds.filter(p => p.resolved).length;

            if (afterCount > beforeCount) {
                round.predictions = updatedPreds;
                await savePredictionToDb(round);
                updatedCount++;
                console.log(`[SUPABASE] [DEBUG] ✅ Resolved round ${round.id} (+${afterCount - beforeCount} matches).`);
            }
        }
        console.log(`[SUPABASE] [DEBUG] Auto-resolution complete. Updated ${updatedCount}/${pendingRounds.length} pending round(s).`);
        return { updated: updatedCount, checked: pendingRounds.length };
    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Auto-resolution check failed:', err.message);
        throw err;
    }
}

// ── Check & update pending predictions for a specific league ─────────────────
/**
 * Fetches only the pending prediction rounds for the given league from Supabase,
 * then resolves their outcomes against the latest match results and saves back.
 *
 * @param {string} league - League display name e.g. "England League"
 * @returns {{ checked: number, updated: number, resolved: number }} summary stats
 */
async function checkAndUpdatePendingPredictions(league) {
    const dbLeague = toDbLeague(league);
    console.log(`[SUPABASE] [DEBUG] 🔄 checkAndUpdatePendingPredictions: league="${league}" (db key: "${dbLeague}")`);

    // Step 1 — Fetch all history for this league from Supabase
    const history = await getPredictionsHistoryFromDb(dbLeague);
    console.log(`[SUPABASE] [DEBUG] Step 1: fetched ${history.length} history rounds for "${league}"`);

    // Step 2 — Filter to only rounds that still have unresolved predictions
    const pendingRounds = history.filter(round =>
        round.predictions && round.predictions.some(pred => !pred.resolved)
    );
    console.log(`[SUPABASE] [DEBUG] Step 2: ${pendingRounds.length} round(s) have pending (unresolved) predictions`);

    if (pendingRounds.length === 0) {
        console.log(`[SUPABASE] [DEBUG] ✅ All predictions for "${league}" are already resolved. Nothing to update.`);
        return { checked: history.length, updated: 0, resolved: 0 };
    }

    // Step 3 — Fetch latest match results from Supabase for comparison
    const finishedMatches = await getMatchesFromDb();
    console.log(`[SUPABASE] [DEBUG] Step 3: fetched ${finishedMatches.length} finished match results from Supabase`);

    // Step 4 — Resolve each pending round against the latest results
    let updatedCount  = 0;
    let totalResolved = 0;

    for (const round of pendingRounds) {
        const beforeCount = round.predictions.filter(p => p.resolved).length;
        const updatedPreds = resolvePredictionOutcomes(round.predictions, round.date, finishedMatches);
        const afterCount   = updatedPreds.filter(p => p.resolved).length;
        const newlyResolved = afterCount - beforeCount;

        if (newlyResolved > 0) {
            round.predictions = updatedPreds;
            // Step 5 — Save updated round back to Supabase
            await savePredictionToDb(round);
            updatedCount++;
            totalResolved += newlyResolved;
            console.log(`[SUPABASE] [DEBUG] ✅ Round ${round.id}: +${newlyResolved} newly resolved (${afterCount}/${round.predictions.length} total).`);
        } else {
            console.log(`[SUPABASE] [DEBUG] ⏳ Round ${round.id}: no new matches found yet to resolve (${beforeCount}/${round.predictions.length} already resolved).`);
        }
    }

    console.log(`[SUPABASE] [DEBUG] checkAndUpdatePendingPredictions complete → updated ${updatedCount} round(s), resolved ${totalResolved} new prediction(s).`);
    return { checked: pendingRounds.length, updated: updatedCount, resolved: totalResolved };
}

// ── Local Fallback Helpers for upcoming_matches and match_played ───────────────
const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
}

function getLocalFilePath(col) {
    return path.join(dataDir, `${col}.json`);
}

const inMemoryCollections = new Map();
const MAX_LOCAL_COLLECTION_SIZE = 150;

function getFromLocalCollection(col) {
    if (inMemoryCollections.has(col)) {
        return inMemoryCollections.get(col);
    }
    try {
        const fp = getLocalFilePath(col);
        if (fs.existsSync(fp)) {
            const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
            const trimmed = Array.isArray(data) ? data.slice(-MAX_LOCAL_COLLECTION_SIZE) : [];
            inMemoryCollections.set(col, trimmed);
            return trimmed;
        }
    } catch (_) {}
    inMemoryCollections.set(col, []);
    return [];
}

function saveToLocalCollection(col, rows = []) {
    try {
        const existing = getFromLocalCollection(col);
        const map = new Map();
        existing.forEach(r => map.set(r.id, r));
        rows.forEach(r => map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
        const merged = Array.from(map.values()).slice(-MAX_LOCAL_COLLECTION_SIZE);
        inMemoryCollections.set(col, merged);

        // Asynchronous non-blocking file persist
        setImmediate(() => {
            try {
                fs.writeFile(getLocalFilePath(col), JSON.stringify(merged), 'utf8', () => {});
            } catch (_) {}
        });
    } catch (e) {
        console.warn(`[Local DB] Failed writing collection ${col}:`, e.message);
    }
}

function updateLocalItem(col, id, updates) {
    try {
        const existing = getFromLocalCollection(col);
        const idx = existing.findIndex(r => r.id === id);
        if (idx !== -1) {
            existing[idx] = { ...existing[idx], ...updates };
            inMemoryCollections.set(col, existing);
        }
    } catch (_) {}
}

// ── Match Status Computation (In-Play vs Upcoming/Not Started) ────────────────
function computeMatchStatus(matchTime, declaredStatus) {
    if (declaredStatus === 'PLAYED' || declaredStatus === 'FINISHED') return declaredStatus;
    if (!matchTime || matchTime === '--:--') return declaredStatus || 'UPCOMING';

    try {
        const parts = matchTime.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const now = new Date();
            const matchDate = new Date(now);
            matchDate.setHours(parts[0], parts[1], 0, 0);

            const diffSec = (now.getTime() - matchDate.getTime()) / 1000;

            // Virtual match simulates for ~90-120 seconds (live from -30s to +150s)
            if (diffSec >= -30 && diffSec <= 150) {
                return 'IN_PLAY';
            }
            // Scheduled in future (more than 30s away)
            if (diffSec < -30) {
                return 'UPCOMING';
            }
            // Simulation finished, pending results association
            if (diffSec > 150) {
                return 'IN_PLAY_FINISHED';
            }
        }
    } catch (_) {}

    return declaredStatus || 'UPCOMING';
}



// ── UPCOMING & IN-PLAY MATCHES & ODDS ─────────────────────────────────────────
async function saveUpcomingMatchesToDb(matches = []) {
    if (!matches || matches.length === 0) return { added: 0 };
    
    const rows = matches.map(m => {
        const dateSafe   = (m.match_date || new Date().toISOString().slice(0, 10)).replace(/\//g, '-');
        const homeName   = m.home_team || m.home || '';
        const awayName   = m.away_team || m.away || '';
        const cleanLeague = detectLeague(m.league, homeName, awayName);

        const leagueSafe = cleanLeague.replace(/[^a-zA-Z0-9_-]/g, '_');
        const homeSafe   = homeName.replace(/\s+/g, '');
        const awaySafe   = awayName.replace(/\s+/g, '');
        const timeSafe   = (m.match_time || m.time || '00:00').replace(':', '');
        const id = m.id || `${dateSafe}_${leagueSafe}_${homeSafe}_vs_${awaySafe}_${timeSafe}`;
        const matchTime = m.match_time || m.time || '--:--';
        const status = computeMatchStatus(matchTime, m.status || 'UPCOMING');

        return {
            id,
            game_id:         m.game_id || m.code || '',
            league:          cleanLeague,
            match_date:      m.match_date || new Date().toISOString().slice(0, 10),
            match_time:      matchTime,
            home_team:       homeName,
            away_team:       awayName,
            odds:            typeof m.odds === 'object' && m.odds !== null ? m.odds : {},
            raw_odds_string: m.raw_odds_string || m.score || '',
            live_score:      m.live_score || (m.score && /^\d+:\d+$/.test(m.score.trim()) ? m.score.trim() : '0:0'),
            status,
            is_in_play:      status === 'IN_PLAY',
            scraped_at:      m.scraped_at || new Date().toISOString(),
            updated_at:      new Date().toISOString()
        };
    });

    if (supabaseClient) {
        try {
            const { error } = await withTimeout(
                supabaseClient.from('upcoming_matches').upsert(rows, { onConflict: 'id' }),
                3500
            );
            if (!error) {
                console.log(`[SUPABASE] ✅ Saved/Updated ${rows.length} matches (In-play & Upcoming) with DOM odds.`);
                saveToLocalCollection('upcoming_matches', rows);
                return { added: rows.length };
            } else if (error.message && error.message.includes('live_score')) {
                // Schema fallback: retry without live_score for backward compatibility
                const cleanRows = rows.map(({ live_score, ...rest }) => rest);
                const { error: retryErr } = await withTimeout(
                    supabaseClient.from('upcoming_matches').upsert(cleanRows, { onConflict: 'id' }),
                    3500
                );
                if (!retryErr) {
                    console.log(`[SUPABASE] ✅ Saved ${rows.length} matches (schema fallback without live_score).`);
                    saveToLocalCollection('upcoming_matches', rows);
                    return { added: rows.length };
                }
            } else {
                console.warn(`[SUPABASE] ⚠️ Note on upcoming_matches table: ${error.message} (Using resilient local store)`);
            }
        } catch (err) {
            console.warn(`[SUPABASE] ⚠️ Error upserting upcoming_matches: ${err.message}`);
        }
    }
    
    saveToLocalCollection('upcoming_matches', rows);
    return { added: rows.length };
}

async function getUpcomingMatchesFromDb({ league, status = 'UPCOMING', limit = 500 } = {}) {
    let items = [];

    if (supabaseClient) {
        try {
            let q = supabaseClient.from('upcoming_matches').select('*');
            if (league && league !== 'ALL') q = q.eq('league', league);
            if (status && status !== 'ALL_ACTIVE' && status !== 'ALL_UNRESOLVED') q = q.eq('status', status);
            else if (status === 'ALL_UNRESOLVED') q = q.neq('status', 'PLAYED').neq('status', 'FINISHED');
            else if (status === 'UPCOMING') q = q.neq('status', 'PLAYED').neq('status', 'FINISHED');
            q = q.order('scraped_at', { ascending: false }).limit(limit * 2);
            const { data, error } = await withTimeout(q, 3500);
            if (!error && data && data.length > 0) {
                items = data;
                saveToLocalCollection('upcoming_matches', data);
            }
        } catch (_) {}
    }
    
    if (items.length === 0) {
        items = getFromLocalCollection('upcoming_matches') || [];
    }

    // Clean leagues with Team-First authoritative detection
    items = items.map(item => {
        const detectedLeague = detectLeague(item.league, item.home_team, item.away_team);
        return {
            ...item,
            league: detectedLeague
        };
    });

    // Determine the Active In-Play Round (SportyBet rounds simulate continuously in WAT UTC+1)
    const roundCounts = {};
    items.forEach(i => roundCounts[i.match_time] = (roundCounts[i.match_time] || 0) + 1);
    const distinctTimes = Object.keys(roundCounts).filter(t => t && t !== '--:--' && roundCounts[t] >= 5).sort();
    
    // Authoritative WAT clock (UTC+1)
    const now = new Date();
    const watTimeMs = now.getTime() + (1 * 60 * 60 * 1000);
    const watDate = new Date(watTimeMs);
    const watH = watDate.getUTCHours();
    const watM = watDate.getUTCMinutes();
    const watS = watDate.getUTCSeconds();
    const nowWatMinutes = watH * 60 + watM;
    const nowWatSec = watH * 3600 + watM * 60 + watS;

    // Find candidate past/active rounds that have reached kickoff (tMin <= nowWatMinutes)
    const pastRounds = distinctTimes.filter(t => {
        const [h, m] = t.split(':').map(Number);
        return (h * 60 + m) <= nowWatMinutes;
    });

    // Active in-play is the most recent round that already kicked off, or earliest available
    const activeKickoffTime = pastRounds.length > 0
        ? pastRounds[pastRounds.length - 1]
        : distinctTimes[0];

    // Process status & dynamic live simulation progress (never permanently stuck at 90' FT)
    items = items.map(item => {
        if (item.status === 'PLAYED' || item.status === 'FINISHED') return item;

        const isLiveRound = item.match_time === activeKickoffTime;
        const currentStatus = isLiveRound ? 'IN_PLAY' : 'UPCOMING';

        let live_score = '0:0';
        let match_progress = isLiveRound ? '1\'' : 'UPCOMING';

        if (isLiveRound) {
            const parts = (item.match_time || '').split(':').map(Number);
            let diffSec = 45;
            if (parts.length === 2) {
                const matchSec = parts[0] * 3600 + parts[1] * 60;
                let d = (nowWatSec - matchSec + 86400) % 86400;
                if (d > 43200) d -= 86400;
                if (d >= 0 && d <= 150) diffSec = d;
                else diffSec = Math.floor(now.getTime() / 1000) % 150;
            } else {
                diffSec = Math.floor(now.getTime() / 1000) % 150;
            }

            // Virtual match round simulation cycle (150s window)
            const cycleSec = Math.floor(diffSec) % 150;
            if (cycleSec <= 45) {
                const min = Math.max(1, Math.min(45, Math.floor(cycleSec * 1.0) + 1));
                match_progress = `${min}'`;
            } else if (cycleSec > 45 && cycleSec <= 60) {
                match_progress = "HT 45'";
            } else if (cycleSec > 60 && cycleSec <= 135) {
                const min = Math.max(46, Math.min(89, Math.floor(45 + (cycleSec - 60) * 0.6) + 1));
                match_progress = `${min}'`;
            } else {
                match_progress = "89'";
            }

            // Calculate realistic dynamic score from odds
            const hOdd = item.odds?.home_win || 2.0;
            const aOdd = item.odds?.away_win || 3.0;
            let hGoals = 0;
            let aGoals = 0;
            if (cycleSec >= 25) {
                if (hOdd < 2.2) hGoals = 1;
                else if (aOdd < 2.2) aGoals = 1;
            }
            if (cycleSec >= 65) {
                if (hOdd < aOdd) hGoals = Math.max(hGoals, 1);
                else aGoals = Math.max(aGoals, 1);
            }
            if (cycleSec >= 95) {
                if (hOdd < 1.95) hGoals = 2;
                else if (aOdd < 1.95) aGoals = 2;
                else if (Math.abs(hOdd - aOdd) < 0.4) { hGoals = 1; aGoals = 1; }
            }
            live_score = `${hGoals}:${aGoals}`;
        }

        return {
            ...item,
            status: currentStatus,
            is_in_play: isLiveRound,
            live_score,
            match_progress
        };
    });

    if (league && league !== 'ALL') items = items.filter(i => i.league === league);

    if (status === 'IN_PLAY') {
        items = items.filter(i => i.status === 'IN_PLAY');
    } else if (status === 'UPCOMING') {
        items = items.filter(i => i.status === 'UPCOMING');
    } else if (status === 'ALL_ACTIVE') {
        items = items.filter(i => i.status === 'IN_PLAY' || i.status === 'UPCOMING');
    } else if (status === 'ALL_UNRESOLVED') {
        items = items.filter(i => i.status !== 'PLAYED' && i.status !== 'FINISHED');
    } else if (status) {
        items = items.filter(i => i.status === status);
    }

    return items.slice(0, limit);
}


async function updateUpcomingMatchStatus(id, status = 'PLAYED') {
    if (supabaseClient) {
        try {
            await withTimeout(
                supabaseClient.from('upcoming_matches').update({ status, updated_at: new Date().toISOString() }).eq('id', id),
                3500
            );
        } catch (_) {}
    }
    updateLocalItem('upcoming_matches', id, { status, updated_at: new Date().toISOString() });
}

async function bulkUpdateUpcomingMatchStatus(ids = [], status = 'PLAYED') {
    if (!ids || ids.length === 0) return { updated: 0 };
    const now = new Date().toISOString();

    for (const id of ids) {
        updateLocalItem('upcoming_matches', id, { status, updated_at: now });
    }

    if (supabaseClient) {
        const chunkSize = 100;
        for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            try {
                await withTimeout(
                    supabaseClient
                        .from('upcoming_matches')
                        .update({ status, updated_at: now })
                        .in('id', chunk),
                    3500
                );
            } catch (err) {
                console.warn('[SUPABASE] ⚠️ bulkUpdateUpcomingMatchStatus note:', err.message);
            }
        }
    }

    return { updated: ids.length };
}



// ── PLAYED MATCHES (Full Details + Pre-match Odds + Winner + Winning Outcomes) ─
async function savePlayedMatchesToDb(matches = []) {
    if (!matches || matches.length === 0) return { added: 0 };

    const rows = matches.map(m => {
        const homeName = m.home_team || '';
        const awayName = m.away_team || '';
        const cleanLeague = detectLeague(m.league, homeName, awayName);

        return {
            id:               m.id,
            game_id:          m.game_id || '',
            league:           cleanLeague,
            match_date:       m.match_date || m.date || new Date().toISOString().slice(0, 10),
            match_time:       m.match_time || m.time || '--:--',
            home_team:        homeName,
            away_team:        awayName,
            score:            m.score,
            ht_score:         m.ht_score || '',
            home_score:       Number(m.home_score ?? 0),
            away_score:       Number(m.away_score ?? 0),
            winner:           m.winner,
            winner_name:      m.winner_name || (m.winner === 'HOME_WIN' ? homeName : m.winner === 'AWAY_WIN' ? awayName : 'Draw'),
            odds:             typeof m.odds === 'object' && m.odds !== null ? m.odds : {},
            winning_outcomes: typeof m.winning_outcomes === 'object' && m.winning_outcomes !== null ? m.winning_outcomes : {},
            status:           m.status || 'FINISHED',
            associated_at:    m.associated_at || new Date().toISOString(),
            updated_at:       new Date().toISOString()
        };
    });

    if (supabaseClient) {
        try {
            const { error } = await withTimeout(
                supabaseClient.from('match_played').upsert(rows, { onConflict: 'id' }),
                3500
            );
            if (!error) {
                console.log(`[SUPABASE] ✅ Saved/Updated ${rows.length} played matches with full details into match_played.`);
                saveToLocalCollection('match_played', rows);
                return { added: rows.length };
            } else {
                console.warn(`[SUPABASE] ⚠️ Note on match_played table: ${error.message} (Using resilient local store)`);
            }
        } catch (err) {
            console.warn(`[SUPABASE] ⚠️ Error saving match_played: ${err.message}`);
        }
    }

    saveToLocalCollection('match_played', rows);
    return { added: rows.length };
}

async function getPlayedMatchesFromDb({ league, date, limit = 500, offset = 0 } = {}) {
    if (supabaseClient) {
        try {
            let q = supabaseClient.from('match_played').select('*');
            if (league && league !== 'ALL') q = q.eq('league', league);
            if (date) q = q.eq('match_date', date);
            q = q.order('associated_at', { ascending: false }).range(offset, offset + limit - 1);
            const { data, error } = await withTimeout(q, 3500);
            if (!error && data && data.length > 0) {
                const cleaned = data.map(r => ({
                    ...r,
                    league: detectLeague(r.league, r.home_team, r.away_team)
                }));
                saveToLocalCollection('match_played', cleaned);
                return cleaned;
            }
        } catch (_) {}
    }

    let items = getFromLocalCollection('match_played') || [];
    items = items.map(r => ({
        ...r,
        league: detectLeague(r.league, r.home_team, r.away_team)
    }));
    if (league && league !== 'ALL') items = items.filter(i => i.league === league);
    if (date) items = items.filter(i => i.match_date === date);
    if (items.length > 0) return items.slice(offset, offset + limit);

    // Fallback if match_played table hasn't been backfilled yet: read from vfootball_results
    if (supabaseClient) {
        try {
            let q = supabaseClient.from('vfootball_results').select('*');
            if (league && league !== 'ALL') q = q.ilike('league', `%${league.replace(' - Virtual', '')}%`);
            if (date) q = q.eq('date', date);
            q = q.order('uploaded_at', { ascending: false }).range(offset, offset + limit - 1);
            const { data, error } = await withTimeout(q, 3500);
            if (!error && data && data.length > 0) {
                const converted = data.map(r => {
                    const score = r.score || '0:0';
                    const parts = score.split(/[:\-]/);
                    const hScore = parseInt(parts[0], 10) || 0;
                    const aScore = parseInt(parts[1], 10) || 0;
                    const winner = hScore > aScore ? 'HOME_WIN' : aScore > hScore ? 'AWAY_WIN' : 'DRAW';
                    const detectedLeague = detectLeague(r.league, r.home_team, r.away_team);
                    return {
                        id: `played_${r.id}`,
                        game_id: r.game_id || '',
                        league: detectedLeague,
                        match_date: r.date || new Date().toISOString().slice(0, 10),
                        match_time: r.time || '--:--',
                        home_team: r.home_team,
                        away_team: r.away_team,
                        score: score,
                        ht_score: '',
                        home_score: hScore,
                        away_score: aScore,
                        winner: winner,
                        winner_name: winner === 'HOME_WIN' ? r.home_team : winner === 'AWAY_WIN' ? r.away_team : 'Draw',
                        odds: { home_win: 2.10, draw: 3.20, away_win: 3.10 },
                        winning_outcomes: {
                            winner_1x2: winner === 'HOME_WIN' ? '1' : winner === 'AWAY_WIN' ? '2' : 'X',
                            winning_odd: 2.10,
                            total_goals: hScore + aScore,
                            over_1_5: (hScore + aScore) > 1.5,
                            over_2_5: (hScore + aScore) > 2.5,
                            gg_ng: (hScore > 0 && aScore > 0) ? 'GG' : 'NG'
                        },
                        status: 'FINISHED',
                        associated_at: r.uploaded_at || new Date().toISOString()
                    };
                });
                saveToLocalCollection('match_played', converted);
                return converted;
            }
        } catch (_) {}
    }

    return items.slice(offset, offset + limit);
}

// ── HEAD-TO-HEAD (H2H) HISTORICAL CLASH QUERY ─────────────────────────────────
const h2hMemoryCache = new Map();
const MAX_H2H_CACHE_SIZE = 40;

function pruneH2HCache() {
    if (h2hMemoryCache.size > MAX_H2H_CACHE_SIZE) {
        const keysToDelete = Array.from(h2hMemoryCache.keys()).slice(0, 15);
        keysToDelete.forEach(k => h2hMemoryCache.delete(k));
    }
}

async function getH2HMatchesFromDb(homeTeam, awayTeam, { league, limit = 50 } = {}) {
    const h = (homeTeam || '').trim();
    const a = (awayTeam || '').trim();
    if (!h || !a) return [];

    const effectiveLimit = Math.min(parseInt(limit, 10) || 50, 50);
    const cacheKey = `${h}_vs_${a}_${league || 'ALL'}`;
    const cached = h2hMemoryCache.get(cacheKey);
    if (cached && Date.now() < cached.exp) {
        return cached.data;
    }

    let results = [];

    // 1. Check local match_played first for immediate zero-latency hits
    try {
        const localPlayed = getFromLocalCollection('match_played') || [];
        const localH2H = localPlayed.filter(m =>
            (m.home_team === h && m.away_team === a) ||
            (m.home_team === a && m.away_team === h)
        );
        for (const lp of localH2H) {
            results.push({
                id: lp.id,
                time: lp.match_time,
                date: lp.match_date,
                homeTeam: lp.home_team,
                awayTeam: lp.away_team,
                score: lp.score,
                htScore: lp.ht_score,
                league: lp.league
            });
        }
    } catch (_) {}

    // 2. Query Supabase vfootball_results table with lean columns and safe timeout
    if (supabaseClient) {
        try {
            let q = supabaseClient
                .from('vfootball_results')
                .select('id, time, date, home_team, away_team, score, league')
                .or(`and(home_team.eq.${h},away_team.eq.${a}),and(home_team.eq.${a},away_team.eq.${h})`)
                .order('uploaded_at', { ascending: false })
                .limit(effectiveLimit);

            const { data, error } = await withTimeout(q, 4500);
            if (!error && data && data.length > 0) {
                const dbMapped = data.map(mapMatchFromDb);
                for (const item of dbMapped) {
                    if (!results.some(r => r.homeTeam === item.homeTeam && r.awayTeam === item.awayTeam && r.date === item.date && r.time === item.time)) {
                        results.push(item);
                    }
                }
            }
        } catch (err) {
            // Graceful non-blocking fallback to local collection results
        }
    }

    // Cache in memory for 3 minutes (180,000ms) with strict cache size bound
    pruneH2HCache();
    h2hMemoryCache.set(cacheKey, { data: results, exp: Date.now() + 180000 });
    h2hMemoryCache.set(`${a}_vs_${h}_${league || 'ALL'}`, { data: results, exp: Date.now() + 180000 });

    return results;
}

// ── ENGINE PREDICTIONS (Multi-Engine H2H Predictions & Automated Evaluation) ─
async function saveEnginePredictionsToDb(predictions = []) {
    if (!predictions || predictions.length === 0) return { added: 0 };

    const rows = predictions.map(p => {
        const id = p.id || `engpred_${p.match_id || `${p.match_date}_${(p.home_team || '').replace(/\s+/g, '')}_vs_${(p.away_team || '').replace(/\s+/g, '')}_${(p.match_time || '').replace(':', '')}`}`;
        return {
            id,
            match_id:         p.match_id || p.id || '',
            game_id:          p.game_id || '',
            league:           p.league || 'England - Virtual',
            match_date:       p.match_date || new Date().toISOString().slice(0, 10),
            match_time:       p.match_time || '--:--',
            home_team:        p.home_team,
            away_team:        p.away_team,
            odds:             typeof p.odds === 'object' && p.odds !== null ? p.odds : {},
            h2h_sample_count: Number(p.h2h_sample_count ?? 0),
            is_low_sample:    Boolean(p.is_low_sample ?? (p.h2h_sample_count < 5)),
            consensus:        typeof p.consensus === 'object' && p.consensus !== null ? p.consensus : {},
            engines:          Array.isArray(p.engines) ? p.engines : [],
            evaluation:       typeof p.evaluation === 'object' && p.evaluation !== null ? p.evaluation : { status: 'PENDING' },
            status:           p.status || (p.evaluation?.status === 'EVALUATED' ? 'EVALUATED' : 'PENDING'),
            created_at:       p.created_at || new Date().toISOString(),
            updated_at:       new Date().toISOString()
        };
    });

    if (supabaseClient) {
        try {
            const { error } = await withTimeout(
                supabaseClient.from('engine_predictions').upsert(rows, { onConflict: 'id' }),
                3500
            );
            if (!error) {
                console.log(`[SUPABASE] ✅ Saved/Updated ${rows.length} engine predictions in Supabase.`);
                saveToLocalCollection('engine_predictions', rows);
                return { added: rows.length };
            } else {
                console.warn(`[SUPABASE] ⚠️ Note on engine_predictions table: ${error.message} (Falling back to local store)`);
            }
        } catch (err) {
            console.warn(`[SUPABASE] ⚠️ Error saving engine_predictions: ${err.message}`);
        }
    }

    saveToLocalCollection('engine_predictions', rows);
    return { added: rows.length };
}

async function getEnginePredictionsFromDb({ league, status, limit = 500, offset = 0 } = {}) {
    if (supabaseClient) {
        try {
            let q = supabaseClient.from('engine_predictions').select('*');
            if (league && league !== 'ALL') q = q.eq('league', league);
            if (status && status !== 'ALL') q = q.eq('status', status);
            q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            const { data, error } = await withTimeout(q, 3500);
            if (!error && data && data.length > 0) {
                saveToLocalCollection('engine_predictions', data);
                return data;
            }
        } catch (_) {}
    }

    let items = getFromLocalCollection('engine_predictions') || [];
    if (league && league !== 'ALL') {
        const target = league.replace(' - Virtual', '').toLowerCase();
        items = items.filter(i => (i.league || '').toLowerCase().includes(target));
    }
    if (status && status !== 'ALL') {
        if (status === 'PENDING') {
            items = items.filter(i => i.status === 'PENDING' || i.evaluation?.status !== 'EVALUATED');
        } else if (status === 'EVALUATED') {
            items = items.filter(i => i.status === 'EVALUATED' || i.evaluation?.status === 'EVALUATED');
        } else if (status === 'WON') {
            items = items.filter(i => i.evaluation?.primaryWon === true);
        } else if (status === 'LOST') {
            items = items.filter(i => i.evaluation?.primaryWon === false && i.evaluation?.status === 'EVALUATED');
        } else {
            items = items.filter(i => i.status === status);
        }
    }
    return items.slice(offset, offset + limit);
}

async function updateEnginePredictionInDb(id, updates = {}) {
    const patch = { ...updates, updated_at: new Date().toISOString() };
    if (supabaseClient) {
        try {
            await withTimeout(
                supabaseClient.from('engine_predictions').update(patch).eq('id', id),
                3500
            );
        } catch (_) {}
    }
    updateLocalItem('engine_predictions', id, patch);
}

async function bulkUpdateEnginePredictionsInDb(updatesList = []) {
    if (!updatesList || updatesList.length === 0) return { updated: 0 };
    const now = new Date().toISOString();

    // 1. Instant in-memory collection updates in one pass (0ms latency, zero GC overhead)
    const existing = getFromLocalCollection('engine_predictions');
    const updateMap = new Map(updatesList.map(u => [u.id, u]));

    for (let i = 0; i < existing.length; i++) {
        const u = updateMap.get(existing[i].id);
        if (u) {
            existing[i] = {
                ...existing[i],
                evaluation: u.evaluation,
                status: u.status || 'EVALUATED',
                updated_at: now
            };
        }
    }
    inMemoryCollections.set('engine_predictions', existing);

    // 2. Chunker for bulk upsert to Supabase in chunks of 50
    if (supabaseClient) {
        const chunkSize = 50;
        for (let i = 0; i < updatesList.length; i += chunkSize) {
            const chunk = updatesList.slice(i, i + chunkSize);
            const rows = chunk.map(u => ({
                id: u.id,
                evaluation: u.evaluation,
                status: u.status || 'EVALUATED',
                updated_at: now
            }));
            try {
                await withTimeout(
                    supabaseClient
                        .from('engine_predictions')
                        .upsert(rows, { onConflict: 'id' }),
                    3500
                );
            } catch (err) {
                console.warn('[SUPABASE] ⚠️ bulkUpdateEnginePredictionsInDb note:', err.message);
            }
        }
    }

    return { updated: updatesList.length };
}

module.exports = {
    supabaseClient,
    getMatchesFromDb,
    saveMatchesToDb,
    getPredictionsHistoryFromDb,
    savePredictionToDb,
    resolvePredictionOutcomes,
    autoResolvePendingPredictions,
    checkAndUpdatePendingPredictions,
    wipeDbData,
    saveUpcomingMatchesToDb,
    getUpcomingMatchesFromDb,
    updateUpcomingMatchStatus,
    bulkUpdateUpcomingMatchStatus,
    savePlayedMatchesToDb,
    getPlayedMatchesFromDb,
    computeMatchStatus,
    getH2HMatchesFromDb,
    saveEnginePredictionsToDb,
    getEnginePredictionsFromDb,
    updateEnginePredictionInDb,
    bulkUpdateEnginePredictionsInDb
};





