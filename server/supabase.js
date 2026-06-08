const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { toDbLeague } = require('./constants');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabaseClient = null;

if (supabaseUrl && supabaseKey) {
    try {
        console.log('[SUPABASE] [DEBUG] Initializing Supabase client...');
        const ws = require('ws');
        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false
            },
            realtime: {
                transport: ws
            }
        });
        console.log('[SUPABASE] [DEBUG] Supabase client initialized successfully.');
    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Failed to initialize Supabase client:', err.message);
    }
} else {
    console.warn('[SUPABASE] [DEBUG] ⚠️ SUPABASE_URL and/or SUPABASE_KEY are not defined in .env. Using local JSON files as database.');
}

const LOCAL_DB_PATH = path.join(__dirname, 'local_results.json');
const PREDICTIONS_HISTORY_PATH = path.join(__dirname, 'local_predictions_history.json');

// Mappings between JS camelCase and DB snake_case
const mapMatchToDb = (match) => {
    const dateSafe = (match.date || '').replace(/\//g, '-');
    const leagueSafe = (match.league || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const gameId = match.gameId || `fallback_${(match.time || '00:00').replace(':', '')}_${(match.homeTeam || match.home || '').replace(/\s+/g, '')}`;
    const matchId = `${dateSafe}_${gameId}_${leagueSafe}`;

    return {
        id: matchId,
        time: match.time || '',
        date: match.date || '',
        game_id: match.gameId || gameId,
        home_team: match.homeTeam || match.home || '',
        away_team: match.awayTeam || match.away || '',
        score: match.score || '',
        league: match.league || '',
        source_tag: match.sourceTag || 'native-dom',
        uploaded_at: match.uploadedAt || new Date().toISOString()
    };
};

const mapMatchFromDb = (row) => ({
    id: row.id,
    _id: row.id,
    time: row.time,
    date: row.date,
    gameId: row.game_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    score: row.score,
    league: row.league,
    sourceTag: row.source_tag,
    uploadedAt: row.uploaded_at
});

// Helper: read local results
function getMatchesFromLocal() {
    if (fs.existsSync(LOCAL_DB_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
        } catch (e) {
            console.error('[SUPABASE] [DEBUG] Failed to read local_results.json:', e.message);
            return [];
        }
    }
    return [];
}

// Helper: read local history
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

// Helper: save matches locally
function saveToLocalJson(newMatches) {
    let current = getMatchesFromLocal();
    let added = 0;
    let dupes = 0;

    newMatches.forEach(match => {
        const mapped = mapMatchToDb(match);
        const matchId = mapped.id;

        const isDupe = current.some(m => {
            const mMapped = mapMatchToDb(m);
            return mMapped.id === matchId || (m.gameId === match.gameId && m.league === match.league && m.date === match.date);
        });

        if (!isDupe) {
            current.push({
                ...match,
                _id: matchId,
                uploadedAt: new Date().toISOString()
            });
            added++;
        } else {
            dupes++;
        }
    });

    if (added > 0) {
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(current, null, 2), 'utf8');
        console.log(`[SUPABASE] [DEBUG] Saved ${added} new matches to local backup file.`);
    }
    return { added, dupes, total: current.length };
}

// Helper: save predictions history locally
function savePredictionsToLocalJson(roundData) {
    let history = getPredictionsHistoryFromLocal();
    const existingIndex = history.findIndex(h => h.id === roundData.id);

    if (existingIndex !== -1) {
        history[existingIndex] = roundData;
    } else {
        history.push(roundData);
    }

    if (history.length > 100) {
        history.shift();
    }

    fs.writeFileSync(PREDICTIONS_HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// --- PUBLIC DATABASE API FUNCTIONS ---

// 1. Get matches
async function getMatchesFromDb() {
    if (supabaseClient) {
        try {
            console.log('[SUPABASE] [DEBUG] Querying vfootball_results table from Supabase...');
            const { data, error } = await supabaseClient
                .from('vfootball_results')
                .select('*');
            if (error) throw error;
            console.log(`[SUPABASE] [DEBUG] Successfully fetched ${data.length} matches from Supabase.`);
            return data.map(mapMatchFromDb);
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Supabase query failed. Falling back to local JSON results:', err.message);
        }
    }
    return getMatchesFromLocal();
}

// 2. Save matches
async function saveMatchesToDb(newMatches) {
    console.log(`[SUPABASE] [DEBUG] saveMatchesToDb: processing ${newMatches.length} matches...`);
    
    if (!supabaseClient) {
        const errMsg = 'Supabase client is not initialized! Scraping requires active Supabase configuration.';
        console.error(`[SUPABASE] [DEBUG] ❌ ${errMsg}`);
        throw new Error(errMsg);
    }

    let added = 0;
    let dupes = 0;
    let total = 0;

    try {
        console.log(`[SUPABASE] [DEBUG] Mapping and deduplicating ${newMatches.length} incoming matches...`);
        const dbRows = [];
        const seenIds = new Set();
        for (const match of newMatches) {
            const row = mapMatchToDb(match);
            if (row.id && !seenIds.has(row.id)) {
                seenIds.add(row.id);
                dbRows.push(row);
            }
        }

        const idsToInsert = dbRows.map(r => r.id);
        console.log(`[SUPABASE] [DEBUG] Checking ID existence for ${idsToInsert.length} matches in Supabase...`);
        
        let existingIds = new Set();
        if (idsToInsert.length > 0) {
            const { data: existingRows, error: fetchErr } = await supabaseClient
                .from('vfootball_results')
                .select('id')
                .in('id', idsToInsert);
            
            if (fetchErr) throw fetchErr;
            if (existingRows) {
                existingRows.forEach(row => existingIds.add(row.id));
            }
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
            console.log(`[SUPABASE] [DEBUG] Successfully inserted ${added} matches into Supabase.`);
        } else {
            console.log('[SUPABASE] [DEBUG] No new matches to insert. All matches are duplicate.');
        }

        // Query total count of results from Supabase
        const { count: countVal, error: countErr } = await supabaseClient
            .from('vfootball_results')
            .select('*', { count: 'exact', head: true });
        if (countErr) throw countErr;
        total = countVal || 0;

    } catch (err) {
        console.error('[SUPABASE] [DEBUG] ❌ Failed to save matches to Supabase:', err.message);
        throw err;
    }

    // Auto-resolve pending predictions after new results are saved
    setTimeout(() => {
        autoResolvePendingPredictions().catch(err => {
            console.error('[SUPABASE] [DEBUG] Error in auto-resolve task:', err.message);
        });
    }, 1500);

    return { added, dupes, total };
}

// 3. Get predictions history
async function getPredictionsHistoryFromDb() {
    if (supabaseClient) {
        try {
            console.log('[SUPABASE] [DEBUG] Querying predictions_history table from Supabase...');
            const { data, error } = await supabaseClient
                .from('predictions_history')
                .select('*')
                .order('captured_at', { ascending: false });
            if (error) throw error;
            console.log(`[SUPABASE] [DEBUG] Successfully fetched ${data.length} prediction history entries from Supabase.`);
            return data.map(row => ({
                id: row.id,
                date: row.date,
                time: row.time,
                league: row.league,
                capturedAt: row.captured_at,
                predictions: row.predictions
            }));
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Supabase query failed. Falling back to local JSON history:', err.message);
        }
    }
    return getPredictionsHistoryFromLocal();
}

// 4. Save prediction
async function savePredictionToDb(roundData) {
    // Write local backup first
    savePredictionsToLocalJson(roundData);

    if (supabaseClient) {
        try {
            console.log(`[SUPABASE] [DEBUG] Upserting prediction round ${roundData.id} to Supabase...`);
            const dbRow = {
                id: roundData.id,
                date: roundData.date,
                time: roundData.time,
                league: roundData.league,
                captured_at: roundData.capturedAt || new Date().toISOString(),
                predictions: roundData.predictions
            };

            const { error } = await supabaseClient
                .from('predictions_history')
                .upsert(dbRow, { onConflict: 'id' });
            if (error) throw error;
            console.log(`[SUPABASE] [DEBUG] Successfully upserted prediction round ${roundData.id} to Supabase.`);
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Failed to upsert prediction round to Supabase:', err.message);
        }
    }
}

// 5. Wipe DB data
async function wipeDbData(league, scope) {
    const targetDbLeague = league && league !== 'all' ? toDbLeague(league) : null;
    let wipedResults = 0;
    let wipedHistory = 0;

    // A. Wipe local files first
    if (!scope || scope === 'all' || scope === 'results') {
        if (fs.existsSync(LOCAL_DB_PATH)) {
            const allMatches = getMatchesFromLocal();
            if (targetDbLeague) {
                const filteredMatches = allMatches.filter(m => toDbLeague(m.league) !== targetDbLeague);
                wipedResults = allMatches.length - filteredMatches.length;
                fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(filteredMatches, null, 2), 'utf8');
            } else {
                wipedResults = allMatches.length;
                fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify([], null, 2), 'utf8');
            }
        }
    }

    if (!scope || scope === 'all' || scope === 'history') {
        if (fs.existsSync(PREDICTIONS_HISTORY_PATH)) {
            const history = getPredictionsHistoryFromLocal();
            if (targetDbLeague) {
                const filteredHistory = history.filter(h => toDbLeague(h.league) !== targetDbLeague);
                wipedHistory = history.length - filteredHistory.length;
                fs.writeFileSync(PREDICTIONS_HISTORY_PATH, JSON.stringify(filteredHistory, null, 2), 'utf8');
            } else {
                wipedHistory = history.length;
                fs.writeFileSync(PREDICTIONS_HISTORY_PATH, JSON.stringify([], null, 2), 'utf8');
            }
        }
    }

    // B. Wipe Supabase data
    if (supabaseClient) {
        try {
            if (!scope || scope === 'all' || scope === 'results') {
                console.log(`[SUPABASE] [DEBUG] Wiping Supabase results for league: ${targetDbLeague || 'all'}...`);
                let query = supabaseClient.from('vfootball_results').delete();
                if (targetDbLeague) {
                    // Filter in DB - since we store full league names, we can check if it contains/equals
                    // Or we can delete matching targetDbLeague using ilike or eq.
                    // For safety, let's filter league names that map to our targetDbLeague.
                    // Since PostgreSQL has text columns, we can fetch matching rows or delete directly.
                    // Let's delete by matching league containing targetDbLeague.
                    query = query.ilike('league', `%${targetDbLeague.replace('_', ' ')}%`);
                } else {
                    query = query.neq('id', ''); // Delete all
                }
                const { error } = await query;
                if (error) throw error;
                console.log('[SUPABASE] [DEBUG] Successfully wiped Supabase results.');
            }

            if (!scope || scope === 'all' || scope === 'history') {
                console.log(`[SUPABASE] [DEBUG] Wiping Supabase predictions history for league: ${targetDbLeague || 'all'}...`);
                let query = supabaseClient.from('predictions_history').delete();
                if (targetDbLeague) {
                    query = query.ilike('league', `%${targetDbLeague.replace('_', ' ')}%`);
                } else {
                    query = query.neq('id', ''); // Delete all
                }
                const { error } = await query;
                if (error) throw error;
                console.log('[SUPABASE] [DEBUG] Successfully wiped Supabase predictions history.');
            }
        } catch (err) {
            console.error('[SUPABASE] [DEBUG] Error wiping data from Supabase:', err.message);
        }
    }

    return { wipedResults, wipedHistory };
}

// 6. Startup check: Seed Supabase if tables are empty
async function seedSupabaseFromLocal() {
    if (!supabaseClient) return;

    try {
        console.log('[SUPABASE] [DEBUG] Checking if Supabase database requires seeding from local files...');

        // Check matches table
        const { count: matchCount, error: matchErr } = await supabaseClient
            .from('vfootball_results')
            .select('*', { count: 'exact', head: true });
        
        if (matchErr) throw matchErr;

        if (matchCount === 0) {
            const localMatches = getMatchesFromLocal();
            if (localMatches.length > 0) {
                console.log(`[SUPABASE] [DEBUG] Supabase results table is empty. Seeding ${localMatches.length} matches from local file...`);
                // Batch in chunks of 500 to avoid Supabase request size limits
                const chunkSize = 500;
                for (let i = 0; i < localMatches.length; i += chunkSize) {
                    const chunk = localMatches.slice(i, i + chunkSize).map(mapMatchToDb);
                    const { error } = await supabaseClient.from('vfootball_results').insert(chunk);
                    if (error) throw error;
                }
                console.log(`[SUPABASE] [DEBUG] Successfully seeded ${localMatches.length} matches to Supabase.`);
            }
        } else {
            console.log(`[SUPABASE] [DEBUG] Supabase results table already has ${matchCount} matches. No seeding needed.`);
        }

        // Check predictions history table
        const { count: historyCount, error: historyErr } = await supabaseClient
            .from('predictions_history')
            .select('*', { count: 'exact', head: true });
        
        if (historyErr) throw historyErr;

        if (historyCount === 0) {
            const localHistory = getPredictionsHistoryFromLocal();
            if (localHistory.length > 0) {
                console.log(`[SUPABASE] [DEBUG] Supabase predictions_history table is empty. Seeding ${localHistory.length} records from local file...`);
                const dbRows = localHistory.map(row => ({
                    id: row.id,
                    date: row.date,
                    time: row.time,
                    league: row.league,
                    captured_at: row.capturedAt || new Date().toISOString(),
                    predictions: row.predictions
                }));
                const { error } = await supabaseClient.from('predictions_history').insert(dbRows);
                if (error) throw error;
                console.log(`[SUPABASE] [DEBUG] Successfully seeded ${localHistory.length} prediction rounds to Supabase.`);
            }
        } else {
            console.log(`[SUPABASE] [DEBUG] Supabase predictions_history table already has ${historyCount} records. No seeding needed.`);
        }

    } catch (err) {
        console.error('[SUPABASE] [DEBUG] Error during startup seeding:', err.message);
    }
}

// Automatically trigger seeding on boot
setTimeout(() => {
    seedSupabaseFromLocal();
}, 3000);

const abbreviateTeamBackend = (name) => {
  if (!name) return '???';
  const clean = name.trim();
  const lower = clean.toLowerCase();
  const teamMap = {
    'arsenal': 'ARS', 'aston villa': 'AVL', 'chelsea': 'CHE', 'everton': 'EVE',
    'liverpool': 'LIV', 'manchester city': 'MCI', 'man city': 'MCI', 'manchester united': 'MUN',
    'man united': 'MUN', 'newcastle': 'NEW', 'tottenham': 'TOT', 'spurs': 'TOT',
    'west ham': 'WHU', 'leicester': 'LEI', 'wolves': 'WOL', 'wolverhampton': 'WOL',
    'southampton': 'SOU', 'bournemouth': 'BOU', 'crystal palace': 'CRY', 'brighton': 'BHA',
    'brentford': 'BRE', 'fulham': 'FUL', 'nottingham': 'NOT', 'nottingham forest': 'NOT',
    'sheffield utd': 'SHU', 'sheffield united': 'SHU', 'leeds': 'LEE', 'burnley': 'BUR',
    'watford': 'WAT', 'norwich': 'NOR', 'luton': 'LUT', 'luton town': 'LUT', 'sunderland': 'SUN'
  };
  if (teamMap[lower]) return teamMap[lower];
  const words = clean.split(/\s+/);
  if (words.length > 1) {
    const abbrev = words.map(w => w[0]).join('').toUpperCase();
    if (abbrev.length >= 2 && abbrev.length <= 4) return abbrev;
  }
  return clean.substring(0, 3).toUpperCase();
};

function resolvePredictionOutcomes(predictions, date, finishedMatches = []) {
    if (!finishedMatches || finishedMatches.length === 0) {
        return predictions;
    }
    
    return predictions.map(pred => {
        const homeAbbr = abbreviateTeamBackend(pred.homeTeam || pred.match.split(' vs ')[0]);
        const awayAbbr = abbreviateTeamBackend(pred.awayTeam || pred.match.split(' vs ')[1]);
        
        const actual = finishedMatches.find(m => {
            const dateMatch = m.date === date;
            const mHomeAbbr = abbreviateTeamBackend(m.homeTeam || m.home);
            const mAwayAbbr = abbreviateTeamBackend(m.awayTeam || m.away);
            return dateMatch && mHomeAbbr === homeAbbr && mAwayAbbr === awayAbbr;
        });
        
        if (actual && actual.score && /^\d+[-:]\d+$/.test(actual.score.trim())) {
            const score = actual.score.replace('-', ':').trim();
            const [hg, ag] = score.split(':').map(Number);
            let actualOutcome = 'D';
            if (hg > ag) actualOutcome = 'H';
            else if (hg < ag) actualOutcome = 'A';
            
            const isGG = hg > 0 && ag > 0;
            const actualBtts = isGG ? 'GG' : 'NG';
            
            const goals = hg + ag;
            const actualOver15 = goals >= 2 ? 'Over' : 'Under';
            const actualOver25 = goals >= 3 ? 'Over' : 'Under';
            
            return {
                ...pred,
                actualScore: score,
                actualOutcome,
                actualBtts,
                actualOver15,
                actualOver25,
                outcomeCorrect: pred.predictedOutcome === actualOutcome,
                bttsCorrect: pred.predictedBtts === actualBtts,
                over15Correct: pred.predictedOver15 === actualOver15,
                over25Correct: pred.predictedOver25 === actualOver25,
                resolved: true
            };
        }
        
        return {
            ...pred,
            resolved: false
        };
    });
}

async function autoResolvePendingPredictions() {
    console.log('[SUPABASE] [DEBUG] 🔍 Checking for pending predictions in database to resolve...');
    try {
        const history = await getPredictionsHistoryFromDb();
        const pendingRounds = history.filter(round => 
            round.predictions && round.predictions.some(pred => !pred.resolved)
        );
        
        if (pendingRounds.length === 0) {
            console.log('[SUPABASE] [DEBUG] No pending predictions require resolution.');
            return;
        }
        
        const finishedMatches = await getMatchesFromDb();
        let updatedCount = 0;
        
        for (const round of pendingRounds) {
            const originalResolvedCount = round.predictions.filter(p => p.resolved).length;
            const updatedPreds = resolvePredictionOutcomes(round.predictions, round.date, finishedMatches);
            const newResolvedCount = updatedPreds.filter(p => p.resolved).length;
            
            if (newResolvedCount > originalResolvedCount) {
                round.predictions = updatedPreds;
                await savePredictionToDb(round);
                updatedCount++;
                console.log(`[SUPABASE] [DEBUG] ✅ Resolved and updated prediction round: ${round.id} (+${newResolvedCount - originalResolvedCount} matches resolved)`);
            }
        }
        console.log(`[SUPABASE] [DEBUG] Auto-resolution check complete. Updated ${updatedCount} rounds.`);
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
