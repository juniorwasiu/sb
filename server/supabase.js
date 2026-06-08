// ─────────────────────────────────────────────────────────────────────────────
// supabase.js — SUPABASE-ONLY storage for match results & predictions history
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  local_results.json is NO LONGER USED. All results go straight to Supabase.
//     Supabase is REQUIRED — the server will throw if SUPABASE_URL / SUPABASE_KEY
//     are missing.
//
// Predictions history still keeps a local JSON backup alongside Supabase so that
// history survives a cold Supabase outage during development.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');
const { toDbLeague } = require('./constants');
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

// ── Predictions history — local backup path (kept, small file) ───────────────
const PREDICTIONS_HISTORY_PATH = path.join(__dirname, 'local_predictions_history.json');

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

// ── Predictions history local helpers (backup only) ──────────────────────────
function getPredictionsHistoryFromLocal() {
    if (fs.existsSync(PREDICTIONS_HISTORY_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(PREDICTIONS_HISTORY_PATH, 'utf8'));
        } catch (e) {
            console.error('[SUPABASE] [DEBUG] Failed to read local_predictions_history.json:', e.message);
            return [];
        }
    }
    return [];
}

function savePredictionsToLocalJson(roundData) {
    let history = getPredictionsHistoryFromLocal();
    const idx = history.findIndex(h => h.id === roundData.id);
    if (idx !== -1) {
        history[idx] = roundData;
    } else {
        history.push(roundData);
    }
    if (history.length > 100) history.shift();
    fs.writeFileSync(PREDICTIONS_HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC DATABASE API FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// 1. Get matches — Supabase ONLY, no local fallback for results
async function getMatchesFromDb() {
    if (!supabaseClient) {
        throw new Error('[SUPABASE] Supabase client is not initialized. Check SUPABASE_URL and SUPABASE_KEY in .env.');
    }
    console.log('[SUPABASE] [DEBUG] Querying vfootball_results table from Supabase...');
    const { data, error } = await supabaseClient
        .from('vfootball_results')
        .select('*')
        .order('uploaded_at', { ascending: false });

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

    return { added, dupes, total };
}

// 3. Get predictions history — prefer Supabase, fall back to local JSON if Supabase fails
async function getPredictionsHistoryFromDb() {
    if (supabaseClient) {
        try {
            console.log('[SUPABASE] [DEBUG] Querying predictions_history table from Supabase...');
            const { data, error } = await supabaseClient
                .from('predictions_history')
                .select('*')
                .order('captured_at', { ascending: false });
            if (error) throw error;
            console.log(`[SUPABASE] [DEBUG] ✅ Fetched ${data.length} prediction history entries from Supabase.`);
            return data.map(row => ({
                id:          row.id,
                date:        row.date,
                time:        row.time,
                league:      row.league,
                capturedAt:  row.captured_at,
                predictions: row.predictions
            }));
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Supabase query failed. Falling back to local JSON history:', err.message);
        }
    }
    return getPredictionsHistoryFromLocal();
}

// 4. Save prediction — write local backup + upsert to Supabase
async function savePredictionToDb(roundData) {
    // Local backup always written first so history survives a Supabase outage
    savePredictionsToLocalJson(roundData);

    if (supabaseClient) {
        try {
            console.log(`[SUPABASE] [DEBUG] Upserting prediction round ${roundData.id} to Supabase...`);
            const dbRow = {
                id:           roundData.id,
                date:         roundData.date,
                time:         roundData.time,
                league:       roundData.league,
                captured_at:  roundData.capturedAt || new Date().toISOString(),
                predictions:  roundData.predictions
            };
            const { error } = await supabaseClient
                .from('predictions_history')
                .upsert(dbRow, { onConflict: 'id' });
            if (error) throw error;
            console.log(`[SUPABASE] [DEBUG] ✅ Upserted prediction round ${roundData.id}.`);
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Failed to upsert prediction round to Supabase:', err.message);
        }
    }
}

// 5. Wipe DB data — Supabase only (no more local_results.json to wipe)
async function wipeDbData(league, scope) {
    const targetDbLeague = league && league !== 'all' ? toDbLeague(league) : null;
    let wipedResults = 0;
    let wipedHistory = 0;

    // Wipe predictions history local backup
    if (!scope || scope === 'all' || scope === 'history') {
        if (fs.existsSync(PREDICTIONS_HISTORY_PATH)) {
            const history = getPredictionsHistoryFromLocal();
            if (targetDbLeague) {
                const filtered = history.filter(h => toDbLeague(h.league) !== targetDbLeague);
                wipedHistory = history.length - filtered.length;
                fs.writeFileSync(PREDICTIONS_HISTORY_PATH, JSON.stringify(filtered, null, 2), 'utf8');
            } else {
                wipedHistory = history.length;
                fs.writeFileSync(PREDICTIONS_HISTORY_PATH, JSON.stringify([], null, 2), 'utf8');
            }
        }
    }

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

// 6. Startup: seed predictions_history from local backup if Supabase table is empty
//    (No longer seeds results from local_results.json — Supabase is authoritative)
async function seedSupabaseFromLocal() {
    if (!supabaseClient) return;
    try {
        console.log('[SUPABASE] [DEBUG] Checking if Supabase predictions_history requires seeding...');
        const { count: historyCount, error: historyErr } = await supabaseClient
            .from('predictions_history')
            .select('*', { count: 'exact', head: true });
        if (historyErr) throw historyErr;

        if (historyCount === 0) {
            const localHistory = getPredictionsHistoryFromLocal();
            if (localHistory.length > 0) {
                console.log(`[SUPABASE] [DEBUG] Predictions table is empty. Seeding ${localHistory.length} records from local backup...`);
                const dbRows = localHistory.map(row => ({
                    id:          row.id,
                    date:        row.date,
                    time:        row.time,
                    league:      row.league,
                    captured_at: row.capturedAt || new Date().toISOString(),
                    predictions: row.predictions
                }));
                const { error } = await supabaseClient.from('predictions_history').insert(dbRows);
                if (error) throw error;
                console.log(`[SUPABASE] [DEBUG] ✅ Successfully seeded ${localHistory.length} prediction rounds to Supabase.`);
            }
        } else {
            console.log(`[SUPABASE] [DEBUG] Supabase predictions_history already has ${historyCount} records. No seeding needed.`);
        }
    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Error during startup seeding:', err.message);
    }
}

// Run seeding check 3 seconds after startup
setTimeout(() => {
    seedSupabaseFromLocal();
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
            if      (pred.predictedHomeTip === 'Home Win')         homeTipCorrect = hg > ag;
            else if (pred.predictedHomeTip === 'Home Win or Draw') homeTipCorrect = hg >= ag;
            else if (pred.predictedHomeTip === 'Home or Away')     homeTipCorrect = hg !== ag;

            let awayTipCorrect = false;
            if      (pred.predictedAwayTip === 'Away Win')         awayTipCorrect = hg < ag;
            else if (pred.predictedAwayTip === 'Away Win or Draw') awayTipCorrect = hg <= ag;
            else if (pred.predictedAwayTip === 'Home or Away')     awayTipCorrect = hg !== ag;

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

// ── Auto-resolve pending predictions ─────────────────────────────────────────
async function autoResolvePendingPredictions() {
    console.log('[SUPABASE] [DEBUG] 🔍 Checking for pending predictions to resolve...');
    try {
        const history = await getPredictionsHistoryFromDb();
        const pendingRounds = history.filter(round =>
            round.predictions && round.predictions.some(pred => !pred.resolved)
        );

        if (pendingRounds.length === 0) {
            console.log('[SUPABASE] [DEBUG] No pending predictions require resolution.');
            return;
        }

        // Fetch ALL results from Supabase (most recent first — already ordered by uploaded_at DESC)
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
        console.log(`[SUPABASE] [DEBUG] Auto-resolution complete. Updated ${updatedCount} round(s).`);
    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Auto-resolution check failed:', err.message);
    }
}

module.exports = {
    supabaseClient,
    getMatchesFromDb,
    saveMatchesToDb,
    getPredictionsHistoryFromDb,
    savePredictionToDb,
    resolvePredictionOutcomes,
    autoResolvePendingPredictions,
    wipeDbData
};
