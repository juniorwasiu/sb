// ─────────────────────────────────────────────────────────────────────────────
// supabase.js — SUPABASE-ONLY storage for match results & predictions history
// ─────────────────────────────────────────────────────────────────────────────
// ✅ All data (match results + predictions history) is stored in Supabase ONLY.
//    No local JSON files are used for storage.
//    Supabase is REQUIRED — the server throws clearly if credentials are missing.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
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

module.exports = {
    supabaseClient,
    getMatchesFromDb,
    saveMatchesToDb,
    getPredictionsHistoryFromDb,
    savePredictionToDb,
    resolvePredictionOutcomes,
    autoResolvePendingPredictions,
    checkAndUpdatePendingPredictions,
    wipeDbData
};
