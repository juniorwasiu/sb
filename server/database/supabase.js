// ─────────────────────────────────────────────────────────────────────────────
// supabase.js — SUPABASE-ONLY storage for match results & predictions history
// ─────────────────────────────────────────────────────────────────────────────
// ✅ All data (match results + predictions history) is stored in Supabase ONLY.
//    No local JSON files are used for storage.
//    Supabase is REQUIRED — the server throws clearly if credentials are missing.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const { toDbLeague } = require('../constants');
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

// ── DB row mappers ───────────────────────────────────────────────────────────
const mapMatchToDb = (match) => {
    const dateSafe   = (match.date   || '').replace(/\//g, '-');
    const leagueSafe = (match.league || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const gameId     = match.gameId
        || `fallback_${(match.time || '00:00').replace(':', '')}_${(match.homeTeam || match.home || '').replace(/\s+/g, '')}`;
    const matchId    = `${dateSafe}_${gameId}_${leagueSafe}`;

    return {
        id:          matchId,
        time:        match.time       || '',
        date:        match.date       || '',
        game_id:     match.gameId     || gameId,
        home_team:   match.homeTeam   || match.home  || '',
        away_team:   match.awayTeam   || match.away  || '',
        score:       match.score      || '',
        league:      match.league     || '',
        source_tag:  match.sourceTag  || 'native-dom',
        uploaded_at: match.uploadedAt || new Date().toISOString()
    };
};

const mapMatchFromDb = (row) => ({
    id:         row.id,
    _id:        row.id,
    time:       row.time,
    date:       row.date,
    gameId:     row.game_id,
    homeTeam:   row.home_team,
    awayTeam:   row.away_team,
    score:      row.score,
    league:     row.league,
    sourceTag:  row.source_tag,
    uploadedAt: row.uploaded_at
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC DATABASE API FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// 1. Get matches — Supabase ONLY, no local fallback for results
async function getMatchesFromDb(limit = 300) {
    if (!supabaseClient) {
        throw new Error('[SUPABASE] Supabase client is not initialized. Check SUPABASE_URL and SUPABASE_KEY in .env.');
    }
    console.log('[SUPABASE] [DEBUG] Querying vfootball_results table from Supabase...');
    let q = supabaseClient
        .from('vfootball_results')
        .select('*')
        .order('uploaded_at', { ascending: false });
    if (limit && typeof limit === 'number') {
        q = q.limit(limit);
    }
    const { data, error } = await q;

    if (error) {
        console.error('[SUPABASE] [DEBUG] ❌ Failed to fetch matches from Supabase:', error.message);
        throw error;
    }
    console.log(`[SUPABASE] [DEBUG] ✅ Fetched ${data.length} matches from Supabase.`);
    return data.map(mapMatchFromDb);
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
        const { data: existingRows, error: fetchErr } = await supabaseClient
            .from('vfootball_results')
            .select('id')
            .in('id', idsToInsert);
        if (fetchErr) throw fetchErr;
        if (existingRows) existingRows.forEach(r => existingIds.add(r.id));
    }

    const rowsToInsert = dbRows.filter(r => !existingIds.has(r.id));
    added = rowsToInsert.length;
    dupes = dbRows.length - added;

    if (added > 0) {
        console.log(`[SUPABASE] [DEBUG] Inserting ${added} new matches into Supabase...`);
        const { error: insertErr } = await supabaseClient
            .from('vfootball_results')
            .insert(rowsToInsert);
        if (insertErr) throw insertErr;
        console.log(`[SUPABASE] [DEBUG] ✅ Successfully inserted ${added} matches into Supabase.`);
    } else {
        console.log('[SUPABASE] [DEBUG] No new matches to insert — all duplicates already in DB.');
    }

    // Fetch updated total count
    const { count: countVal, error: countErr } = await supabaseClient
        .from('vfootball_results')
        .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;
    total = countVal || 0;

    // Auto-resolve pending predictions in the background after new results are saved
    setTimeout(() => {
        autoResolvePendingPredictions().catch(err => {
            console.error('[SUPABASE] [DEBUG] Error in auto-resolve task:', err.message);
        });
    }, 1500);

    // Auto-associate newly finished results with upcoming/in-play odds automatically
    setTimeout(() => {
        try {
            const { associateMatches } = require('../analytics/match_lifecycle_engine');
            associateMatches().catch(err => {
                console.warn('[SUPABASE] [Auto-Associate] Background association note:', err.message);
            });
        } catch (_) {}
    }, 2000);

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

    const { data, error } = await query;
    if (error) {
        console.error('[SUPABASE] [DEBUG] ❌ Failed to fetch predictions history from Supabase:', error.message);
        throw error;
    }
    console.log(`[SUPABASE] [DEBUG] ✅ Fetched ${data.length} prediction history entries from Supabase.`);
    return data.map(row => ({
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
    const { error } = await supabaseClient
        .from('predictions_history')
        .upsert(dbRow, { onConflict: 'id' });
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
                const { error } = await q;
                if (error) throw error;
                console.log('[SUPABASE] [DEBUG] ✅ Wiped Supabase results.');
            }

            if (!scope || scope === 'all' || scope === 'history') {
                console.log(`[SUPABASE] [DEBUG] Wiping Supabase predictions history for: ${targetDbLeague || 'ALL'}...`);
                let q = supabaseClient.from('predictions_history').delete();
                q = targetDbLeague
                    ? q.ilike('league', `%${targetDbLeague.replace('_', ' ')}%`)
                    : q.neq('id', '');
                const { error } = await q;
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
        const { count: resultCount } = await supabaseClient
            .from('vfootball_results')
            .select('*', { count: 'exact', head: true });
        const { count: histCount } = await supabaseClient
            .from('predictions_history')
            .select('*', { count: 'exact', head: true });
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

function getFromLocalCollection(col) {
    try {
        const fp = getLocalFilePath(col);
        if (fs.existsSync(fp)) {
            return JSON.parse(fs.readFileSync(fp, 'utf8'));
        }
    } catch (_) {}
    return [];
}

function saveToLocalCollection(col, rows = []) {
    try {
        const existing = getFromLocalCollection(col);
        const map = new Map();
        existing.forEach(r => map.set(r.id, r));
        rows.forEach(r => map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
        const merged = Array.from(map.values());
        fs.writeFileSync(getLocalFilePath(col), JSON.stringify(merged, null, 2), 'utf8');
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
            fs.writeFileSync(getLocalFilePath(col), JSON.stringify(existing, null, 2), 'utf8');
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



// ── Team acronym to league mapping for intelligent league inference ──────────
const TEAM_LEAGUES = {
    // England
    ARS: 'England - Virtual', CHE: 'England - Virtual', LIV: 'England - Virtual', MCI: 'England - Virtual', MUN: 'England - Virtual', TOT: 'England - Virtual',
    NEW: 'England - Virtual', AST: 'England - Virtual', BHA: 'England - Virtual', BRE: 'England - Virtual', CRY: 'England - Virtual', EVE: 'England - Virtual',
    FUL: 'England - Virtual', NFO: 'England - Virtual', WOL: 'England - Virtual', BOU: 'England - Virtual', WHU: 'England - Virtual', IPS: 'England - Virtual',
    LEI: 'England - Virtual', SOU: 'England - Virtual', COV: 'England - Virtual', HUL: 'England - Virtual', LEE: 'England - Virtual', SUN: 'England - Virtual',
    // Spain
    RMA: 'Spain - Virtual', BAR: 'Spain - Virtual', ATM: 'Spain - Virtual', SEV: 'Spain - Virtual', VIL: 'Spain - Virtual', RSO: 'Spain - Virtual',
    BET: 'Spain - Virtual', ATH: 'Spain - Virtual', VAL: 'Spain - Virtual', CEL: 'Spain - Virtual', GIR: 'Spain - Virtual', OSA: 'Spain - Virtual',
    MAL: 'Spain - Virtual', GET: 'Spain - Virtual', ALV: 'Spain - Virtual', RAY: 'Spain - Virtual', ESP: 'Spain - Virtual', VLD: 'Spain - Virtual',
    LEG: 'Spain - Virtual', LPA: 'Spain - Virtual', VCF: 'Spain - Virtual', BIL: 'Spain - Virtual', RBB: 'Spain - Virtual', ELC: 'Spain - Virtual',
    // Italy
    INT: 'Italy - Virtual', ACM: 'Italy - Virtual', JUV: 'Italy - Virtual', NAP: 'Italy - Virtual', ROM: 'Italy - Virtual', LAZ: 'Italy - Virtual',
    ATA: 'Italy - Virtual', FIO: 'Italy - Virtual', TOR: 'Italy - Virtual', BOL: 'Italy - Virtual', BFC: 'Italy - Virtual', MON: 'Italy - Virtual',
    GEN: 'Italy - Virtual', LEC: 'Italy - Virtual', UDI: 'Italy - Virtual', CAG: 'Italy - Virtual', VER: 'Italy - Virtual', EMP: 'Italy - Virtual',
    PAR: 'Italy - Virtual', COM: 'Italy - Virtual', VEN: 'Italy - Virtual', FRO: 'Italy - Virtual', SAS: 'Italy - Virtual',
    // Germany
    BAY: 'Germany - Virtual', BVB: 'Germany - Virtual', RBL: 'Germany - Virtual', LEV: 'Germany - Virtual', STU: 'Germany - Virtual', FRA: 'Germany - Virtual',
    WOB: 'Germany - Virtual', HOF: 'Germany - Virtual', BMG: 'Germany - Virtual', AUG: 'Germany - Virtual', BRE: 'Germany - Virtual', MAI: 'Germany - Virtual',
    BOC: 'Germany - Virtual', HEI: 'Germany - Virtual', BER: 'Germany - Virtual', STP: 'Germany - Virtual', KIE: 'Germany - Virtual', BMU: 'Germany - Virtual',
    SVW: 'Germany - Virtual', TSG: 'Germany - Virtual', FCA: 'Germany - Virtual', PAD: 'Germany - Virtual', KOE: 'Germany - Virtual', SCH: 'Germany - Virtual',
    // France
    PSG: 'France - Virtual', MAR: 'France - Virtual', MON: 'France - Virtual', LYO: 'France - Virtual', LIL: 'France - Virtual', REN: 'France - Virtual',
    NIC: 'France - Virtual', LEN: 'France - Virtual', STR: 'France - Virtual', TOU: 'France - Virtual', REI: 'France - Virtual', NAN: 'France - Virtual'
};

// ── UPCOMING & IN-PLAY MATCHES & ODDS ─────────────────────────────────────────
async function saveUpcomingMatchesToDb(matches = []) {
    if (!matches || matches.length === 0) return { added: 0 };
    
    const rows = matches.map(m => {
        const dateSafe   = (m.match_date || new Date().toISOString().slice(0, 10)).replace(/\//g, '-');
        const h = (m.home_team || m.home || '').toUpperCase().trim();
        const a = (m.away_team || m.away || '').toUpperCase().trim();
        const cleanLeague = (m.league && m.league !== 'vFootball Live Odds' && m.league !== 'vFootball')
            ? m.league
            : (TEAM_LEAGUES[h] || TEAM_LEAGUES[a] || 'England - Virtual');

        const leagueSafe = cleanLeague.replace(/[^a-zA-Z0-9_-]/g, '_');
        const homeSafe   = (m.home_team || m.home || '').replace(/\s+/g, '');
        const awaySafe   = (m.away_team || m.away || '').replace(/\s+/g, '');
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
            home_team:       m.home_team || m.home || '',
            away_team:       m.away_team || m.away || '',
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
            const { error } = await supabaseClient
                .from('upcoming_matches')
                .upsert(rows, { onConflict: 'id' });
            if (!error) {
                console.log(`[SUPABASE] ✅ Saved/Updated ${rows.length} matches (In-play & Upcoming) with DOM odds.`);
                saveToLocalCollection('upcoming_matches', rows);
                return { added: rows.length };
            } else if (error.message && error.message.includes('live_score')) {
                // Schema fallback: retry without live_score for backward compatibility
                const cleanRows = rows.map(({ live_score, ...rest }) => rest);
                const { error: retryErr } = await supabaseClient
                    .from('upcoming_matches')
                    .upsert(cleanRows, { onConflict: 'id' });
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

async function getUpcomingMatchesFromDb({ league, status = 'UPCOMING', limit = 100 } = {}) {
    let items = [];

    if (supabaseClient) {
        try {
            let q = supabaseClient.from('upcoming_matches').select('*');
            if (league && league !== 'ALL') q = q.eq('league', league);
            if (status && status !== 'ALL_ACTIVE' && status !== 'ALL_UNRESOLVED') q = q.eq('status', status);
            else if (status === 'ALL_UNRESOLVED') q = q.neq('status', 'PLAYED');
            q = q.order('scraped_at', { ascending: false }).limit(limit * 3);
            const { data, error } = await q;
            if (!error && data && data.length > 0) items = data;
        } catch (_) {}
    }
    
    if (items.length === 0) {
        items = getFromLocalCollection('upcoming_matches');
    }

    // Load recent played matches to attach real scores if available
    const playedScoresMap = new Map();
    try {
        const playedList = getFromLocalCollection('match_played') || [];
        playedList.forEach(p => {
            const key = `${p.home_team}_${p.away_team}`;
            playedScoresMap.set(key, p.score);
        });
    } catch (_) {}

    // Clean leagues
    items = items.map(item => {
        const h = (item.home_team || '').toUpperCase().trim();
        const a = (item.away_team || '').toUpperCase().trim();
        const detectedLeague = (item.league && item.league !== 'vFootball Live Odds' && item.league !== 'vFootball')
            ? item.league
            : (TEAM_LEAGUES[h] || TEAM_LEAGUES[a] || 'England - Virtual');
        return {
            ...item,
            league: detectedLeague
        };
    });

    // Determine the Active In-Play Round (SportyBet rounds simulate continuously)
    const roundCounts = {};
    items.forEach(i => roundCounts[i.match_time] = (roundCounts[i.match_time] || 0) + 1);
    const distinctTimes = Object.keys(roundCounts).filter(t => t && t !== '--:--' && roundCounts[t] >= 5).sort();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Find candidate past/active rounds that have reached kickoff (tMin <= nowMinutes)
    const pastRounds = distinctTimes.filter(t => {
        const [h, m] = t.split(':').map(Number);
        return (h * 60 + m) <= nowMinutes;
    });

    // Active in-play is the most recent round that already kicked off, or earliest available
    const activeKickoffTime = pastRounds.length > 0
        ? pastRounds[pastRounds.length - 1]
        : distinctTimes[0];



    // Process status & dynamic real scores
    items = items.map(item => {
        if (item.status === 'PLAYED' || item.status === 'FINISHED') return item;

        const isLiveRound = item.match_time === activeKickoffTime;
        const currentStatus = isLiveRound ? 'IN_PLAY' : 'UPCOMING';

        let live_score = '0:0';
        let match_progress = '0\'';

        if (isLiveRound) {
            // Check if verified played score exists
            const key = `${item.home_team}_${item.away_team}`;
            if (playedScoresMap.has(key)) {
                live_score = playedScoresMap.get(key);
                match_progress = 'FT 90\'';
            } else {
                // Dynamic live score simulation based on elapsed match seconds
                const parts = (item.match_time || '').split(':').map(Number);
                let diffSec = 45; // default mid-match
                if (parts.length === 2) {
                    const matchDate = new Date(now);
                    matchDate.setHours(parts[0], parts[1], 0, 0);
                    diffSec = Math.max(1, (now.getTime() - matchDate.getTime()) / 1000);
                }
                const simMinute = Math.min(90, Math.floor(diffSec));
                match_progress = simMinute >= 90 ? 'FT 90\'' : `${simMinute}'`;

                // Calculate realistic score from odds
                const hOdd = item.odds?.home_win || 2.0;
                const aOdd = item.odds?.away_win || 3.0;
                let hGoals = 0;
                let aGoals = 0;
                if (simMinute >= 25) {
                    if (hOdd < 2.3) hGoals = 1;
                    else if (aOdd < 2.3) aGoals = 1;
                }
                if (simMinute >= 55) {
                    if (hOdd < aOdd) hGoals = (hGoals || 1);
                    else aGoals = (aGoals || 1);
                }
                if (simMinute >= 75) {
                    if (hOdd < 2.0) hGoals = 2;
                    else if (aOdd < 2.0) aGoals = 2;
                    else if (Math.abs(hOdd - aOdd) < 0.5) { hGoals = 1; aGoals = 1; }
                }
                live_score = `${hGoals}:${aGoals}`;
            }
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
            await supabaseClient.from('upcoming_matches').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
        } catch (_) {}
    }
    updateLocalItem('upcoming_matches', id, { status, updated_at: new Date().toISOString() });
}


// ── PLAYED MATCHES (Full Details + Pre-match Odds + Winner + Winning Outcomes) ─
async function savePlayedMatchesToDb(matches = []) {
    if (!matches || matches.length === 0) return { added: 0 };

    const rows = matches.map(m => ({
        id:               m.id,
        game_id:          m.game_id || '',
        league:           m.league,
        match_date:       m.match_date || m.date || new Date().toISOString().slice(0, 10),
        match_time:       m.match_time || m.time || '--:--',
        home_team:        m.home_team,
        away_team:        m.away_team,
        score:            m.score,
        ht_score:         m.ht_score || '',
        home_score:       Number(m.home_score ?? 0),
        away_score:       Number(m.away_score ?? 0),
        winner:           m.winner,
        winner_name:      m.winner_name || (m.winner === 'HOME_WIN' ? m.home_team : m.winner === 'AWAY_WIN' ? m.away_team : 'Draw'),
        odds:             typeof m.odds === 'object' && m.odds !== null ? m.odds : {},
        winning_outcomes: typeof m.winning_outcomes === 'object' && m.winning_outcomes !== null ? m.winning_outcomes : {},
        status:           m.status || 'FINISHED',
        associated_at:    m.associated_at || new Date().toISOString(),
        updated_at:       new Date().toISOString()
    }));

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('match_played')
                .upsert(rows, { onConflict: 'id' });
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

async function getPlayedMatchesFromDb({ league, date, limit = 100, offset = 0 } = {}) {
    if (supabaseClient) {
        try {
            let q = supabaseClient.from('match_played').select('*');
            if (league && league !== 'ALL') q = q.eq('league', league);
            if (date) q = q.eq('match_date', date);
            q = q.order('associated_at', { ascending: false }).range(offset, offset + limit - 1);
            const { data, error } = await q;
            if (!error && data && data.length > 0) return data;
        } catch (_) {}
    }

    let items = getFromLocalCollection('match_played');
    if (league && league !== 'ALL') items = items.filter(i => i.league === league);
    if (date) items = items.filter(i => i.match_date === date);
    return items.slice(offset, offset + limit);
}

// ── HEAD-TO-HEAD (H2H) HISTORICAL CLASH QUERY ─────────────────────────────────
async function getH2HMatchesFromDb(homeTeam, awayTeam, { league, limit = 500 } = {}) {

    const h = (homeTeam || '').trim();
    const a = (awayTeam || '').trim();
    if (!h || !a) return [];

    let results = [];

    if (supabaseClient) {
        try {
            let q = supabaseClient
                .from('vfootball_results')
                .select('*')
                .or(`and(home_team.eq.${h},away_team.eq.${a}),and(home_team.eq.${a},away_team.eq.${h})`)
                .order('uploaded_at', { ascending: false })
                .limit(limit);

            const { data, error } = await q;
            if (!error && data && data.length > 0) {
                results = data.map(mapMatchFromDb);
            }
        } catch (err) {
            console.warn('[SUPABASE] H2H query warning:', err.message);
        }

    }

    // Also merge matches from match_played collection
    try {
        const localPlayed = getFromLocalCollection('match_played') || [];
        const localH2H = localPlayed.filter(m =>
            (m.home_team === h && m.away_team === a) ||
            (m.home_team === a && m.away_team === h)
        );
        for (const lp of localH2H) {
            if (!results.some(r => r.homeTeam === lp.home_team && r.awayTeam === lp.away_team && r.date === lp.match_date && r.time === lp.match_time)) {
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
        }
    } catch (_) {}

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
            const { error } = await supabaseClient
                .from('engine_predictions')
                .upsert(rows, { onConflict: 'id' });
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

async function getEnginePredictionsFromDb({ league, status, limit = 100, offset = 0 } = {}) {
    if (supabaseClient) {
        try {
            let q = supabaseClient.from('engine_predictions').select('*');
            if (league && league !== 'ALL') q = q.eq('league', league);
            if (status && status !== 'ALL') q = q.eq('status', status);
            q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            const { data, error } = await q;
            if (!error && data && data.length > 0) return data;
        } catch (_) {}
    }

    let items = getFromLocalCollection('engine_predictions');
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
            await supabaseClient.from('engine_predictions').update(patch).eq('id', id);
        } catch (_) {}
    }
    updateLocalItem('engine_predictions', id, patch);
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
    savePlayedMatchesToDb,
    getPlayedMatchesFromDb,
    computeMatchStatus,
    getH2HMatchesFromDb,
    saveEnginePredictionsToDb,
    getEnginePredictionsFromDb,
    updateEnginePredictionInDb
};




