/**
 * engine_prediction_pipeline.js
 * 
 * Automated pipeline for multi-engine Head-to-Head (H2H) predictions:
 * 1. Background auto-generation for upcoming & in-play fixtures.
 * 2. Instant on-demand execution when user clicks a match card.
 * 3. Persistence to Supabase and resilient local store.
 * 4. Automatic evaluation of prediction accuracy against verified scores.
 * 5. Low-sample (< 5 H2H clashes) detection and tagging.
 */

const {
    getUpcomingMatchesFromDb,
    getPlayedMatchesFromDb,
    getMatchesFromDb,
    getH2HMatchesFromDb,
    saveEnginePredictionsToDb,
    getEnginePredictionsFromDb,
    updateEnginePredictionInDb,
    bulkUpdateEnginePredictionsInDb
} = require('../database/supabase');

const { analyzeH2H } = require('./multi_engine_analyzer');
const { teamsMatch, normalizeTeam, normalizeLeague } = require('./match_lifecycle_engine');


/**
 * Pure evaluation function comparing an engine prediction against an actual finished match.
 */
function evaluatePrediction(pred, actualMatch) {
    const rawScore = (actualMatch.score || '').replace('-', ':').trim();
    const parts = rawScore.split(':').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
        return null;
    }

    const [homeScore, awayScore] = parts;
    const totalGoals = homeScore + awayScore;
    const consensus = pred.consensus || {};
    const primaryBet = consensus.primaryBet || '';
    const primaryBetLabel = consensus.primaryBetLabel || '';
    const projectedScore = (consensus.projectedScore || '').replace('-', ':').trim();
    const topScorelines = consensus.topScorelines || [];
    const straightWin = consensus.straightWin || {};
    const doubleChance = consensus.doubleChance || {};

    let primaryWon = false;
    let winningOdd = null;
    const odds = pred.odds || actualMatch.odds || {};

    // 1. Primary Pick Evaluation
    if (primaryBet === 'HOME_WIN' || primaryBet === '1' || primaryBetLabel.includes('Home Win') || primaryBetLabel.includes(`${pred.home_team} to Win`)) {
        primaryWon = homeScore > awayScore;
        winningOdd = odds.home_win || null;
    } else if (primaryBet === 'AWAY_WIN' || primaryBet === '2' || primaryBetLabel.includes('Away Win') || primaryBetLabel.includes(`${pred.away_team} to Win`)) {
        primaryWon = awayScore > homeScore;
        winningOdd = odds.away_win || null;
    } else if (primaryBet === 'DRAW' || primaryBet === 'X' || primaryBetLabel.toLowerCase().includes('draw')) {
        primaryWon = homeScore === awayScore;
        winningOdd = odds.draw || null;
    } else if (primaryBet === 'OVER_15' || primaryBetLabel.includes('Over 1.5')) {
        primaryWon = totalGoals >= 2;
        winningOdd = odds.over_1_5 || null;
    } else if (primaryBet === 'OVER_25' || primaryBetLabel.includes('Over 2.5')) {
        primaryWon = totalGoals >= 3;
        winningOdd = odds.over_2_5 || null;
    } else if (primaryBet === 'GG' || primaryBetLabel.includes('Both Teams to Score')) {
        primaryWon = homeScore > 0 && awayScore > 0;
        winningOdd = odds.gg || null;
    } else if (primaryBet === 'NG') {
        primaryWon = homeScore === 0 || awayScore === 0;
        winningOdd = odds.ng || null;
    } else if (primaryBet === '1X' || primaryBetLabel.includes('1X')) {
        primaryWon = homeScore >= awayScore;
        winningOdd = odds.dc_1x || null;
    } else if (primaryBet === 'X2' || primaryBetLabel.includes('X2')) {
        primaryWon = awayScore >= homeScore;
        winningOdd = odds.dc_x2 || null;
    } else if (primaryBet === '12' || primaryBetLabel.includes('12')) {
        primaryWon = homeScore !== awayScore;
        winningOdd = odds.dc_12 || null;
    } else {
        // Fallback: evaluate based on primary label or projected outcome
        if (primaryBetLabel.includes(pred.home_team)) primaryWon = homeScore > awayScore;
        else if (primaryBetLabel.includes(pred.away_team)) primaryWon = awayScore > homeScore;
        else primaryWon = totalGoals >= 2;
    }

    // 2. Straight Win (1X2) Specific Evaluation
    const straightWinPick = (straightWin.pick || (primaryBet === 'HOME_WIN' ? '1' : primaryBet === 'AWAY_WIN' ? '2' : '')).trim();
    let straightWinWon = false;
    let straightWinOdd = straightWin.odd || (straightWinPick === '1' ? odds.home_win : straightWinPick === '2' ? odds.away_win : odds.draw);

    if (straightWinPick === '1') {
        straightWinWon = homeScore > awayScore;
    } else if (straightWinPick === '2') {
        straightWinWon = awayScore > homeScore;
    } else if (straightWinPick === 'X') {
        straightWinWon = homeScore === awayScore;
    }

    // 3. Double Chance Evaluation
    const dcPick = doubleChance.pick || '';
    let doubleChanceWon = false;
    if (dcPick === '1X') doubleChanceWon = homeScore >= awayScore;
    else if (dcPick === 'X2') doubleChanceWon = awayScore >= homeScore;
    else if (dcPick === '12') doubleChanceWon = homeScore !== awayScore;

    // 4. Exact Score & Top 3 Scorelines Evaluation
    const exactScoreHit = projectedScore === rawScore;
    const top3ScoreHit = exactScoreHit || topScorelines.some(s => (s.score || '').replace('-', ':').trim() === rawScore);
    const projParts = projectedScore.split(':').map(Number);
    const scoreDiffHit = projParts.length === 2 && (projParts[0] - projParts[1]) === (homeScore - awayScore);

    // 5. Markets Evaluation
    const winner1x2 = homeScore > awayScore ? '1' : awayScore > homeScore ? '2' : 'X';
    const isOver15 = totalGoals >= 2;
    const isOver25 = totalGoals >= 3;
    const isGg = homeScore > 0 && awayScore > 0;

    return {
        status: 'EVALUATED',
        evaluatedAt: new Date().toISOString(),
        finalScore: rawScore,
        htScore: actualMatch.ht_score || actualMatch.htScore || '',
        actualWinner: homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW',
        actualWinner1x2: winner1x2,
        primaryWon,
        primaryVerdict: primaryWon ? 'WON' : 'LOST',
        winningOdd,
        straightWinWon,
        straightWinPick,
        straightWinTeam: straightWin.team || (straightWinPick === '1' ? pred.home_team : straightWinPick === '2' ? pred.away_team : 'Draw'),
        straightWinOdd,
        doubleChanceWon,
        projectedScore,
        exactScoreHit,
        top3ScoreHit,
        scoreDiffHit,
        outcomesWon: {
            winner1x2,
            straightWin: straightWinWon,
            doubleChance: doubleChanceWon,
            over15: isOver15,
            over25: isOver25,
            gg: isGg
        }
    };
}

let isAutoPredictRunning = false;
let isAutoEvalRunning = false;

/**
 * Automatically runs the multi-engine analysis for active upcoming/in-play matches.
 * Idempotent: Does not re-predict if a pending or evaluated prediction already exists.
 */
async function autoRunEnginePredictions() {
    if (isAutoPredictRunning) {
        return { generated: 0, message: 'Prediction cycle already in progress' };
    }
    isAutoPredictRunning = true;
    try {
        // 1. Get active matches
        const activeMatches = await getUpcomingMatchesFromDb({ status: 'ALL_ACTIVE', limit: 120 });
        if (!activeMatches || activeMatches.length === 0) {
            return { generated: 0, message: 'No active matches found' };
        }

        // 2. Get existing predictions to prevent duplicate runs
        const existingPreds = await getEnginePredictionsFromDb({ limit: 400 });
        const existingKeys = new Set(
            existingPreds.map(p => `${p.match_date}_${(p.home_team || '').trim()}_vs_${(p.away_team || '').trim()}_${(p.match_time || '').trim()}`)
        );

        // Filter to only matches needing prediction, capped at 20 per cycle for fast response
        const candidateMatches = activeMatches.filter(m => {
            const h = (m.home_team || m.home || '').trim();
            const a = (m.away_team || m.away || '').trim();
            const t = (m.match_time || m.time || '--:--').trim();
            const d = (m.match_date || m.date || new Date().toISOString().slice(0, 10)).trim();
            if (!h || !a) return false;
            return !existingKeys.has(`${d}_${h}_vs_${a}_${t}`);
        }).slice(0, 20);

        if (candidateMatches.length === 0) {
            return { generated: 0, message: 'All active matches already predicted.' };
        }

        // 3. Pre-fetch recent league matches for league-context-aware scoreline analysis
        const playedResults = await getMatchesFromDb(200).catch(() => []);
        const leagueMatchesMap = new Map();
        for (const pr of (playedResults || [])) {
            const l = normalizeLeague(pr.league, pr.home_team, pr.away_team);
            if (!leagueMatchesMap.has(l)) leagueMatchesMap.set(l, []);
            leagueMatchesMap.get(l).push(pr);
        }

        const newPredictions = [];
        const chunkSize = 3;

        for (let i = 0; i < candidateMatches.length; i += chunkSize) {
            const chunk = candidateMatches.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(chunk.map(async (m) => {
                const h = (m.home_team || m.home || '').trim();
                const a = (m.away_team || m.away || '').trim();
                const t = (m.match_time || m.time || '--:--').trim();
                const d = (m.match_date || m.date || new Date().toISOString().slice(0, 10)).trim();
                const matchKey = `${d}_${h}_vs_${a}_${t}`;

                try {
                    const normLeague = normalizeLeague(m.league, h, a);
                    const h2hMatches = await getH2HMatchesFromDb(h, a, { league: m.league, limit: 500 });
                    const sampleCount = h2hMatches ? h2hMatches.length : 0;
                    const isLowSample = sampleCount < 5;

                    const leagueContext = {
                        matches: leagueMatchesMap.get(normLeague) || []
                    };

                    const analysis = analyzeH2H(h2hMatches, {
                        homeTeam: h,
                        awayTeam: a,
                        league: m.league || 'England - Virtual',
                        odds: m.odds || {},
                        matchTime: t
                    }, leagueContext);

                    return {
                        id: `engpred_${m.id || matchKey}`,
                        match_id: m.id || matchKey,
                        game_id: m.game_id || m.code || '',
                        league: m.league || 'England - Virtual',
                        match_date: d,
                        match_time: t,
                        home_team: h,
                        away_team: a,
                        odds: m.odds || {},
                        h2h_sample_count: sampleCount,
                        is_low_sample: isLowSample,
                        consensus: analysis.consensus || {},
                        engines: analysis.engines || [],
                        evaluation: { status: 'PENDING' },
                        status: 'PENDING',
                        created_at: new Date().toISOString()
                    };
                } catch (e) {
                    console.warn(`[Engine Pipeline] Note on analyzing ${h} vs ${a}:`, e.message);
                    return null;
                }
            }));

            for (const res of chunkResults) {
                if (res) newPredictions.push(res);
            }
        }

        if (newPredictions.length > 0) {
            await saveEnginePredictionsToDb(newPredictions);
            console.log(`[Engine Pipeline] 🚀 Auto-generated & saved ${newPredictions.length} multi-engine predictions.`);
        }

        return { generated: newPredictions.length };
    } catch (err) {
        console.error('[Engine Pipeline] ❌ Error in autoRunEnginePredictions:', err.message);
        return { generated: 0, error: err.message };
    } finally {
        isAutoPredictRunning = false;
    }
}

/**
 * Automatically evaluates all pending predictions against verified finished match results.
 * High-speed O(1) Hash-Map indexing for zero latency and minimal RAM overhead.
 */
async function autoEvaluateEnginePredictions() {
    if (isAutoEvalRunning) {
        return { evaluated: 0, message: 'Evaluation cycle already in progress' };
    }
    isAutoEvalRunning = true;
    try {
        // 1. Fetch pending predictions (up to 500)
        const pendingPreds = await getEnginePredictionsFromDb({ status: 'PENDING', limit: 500 });
        if (!pendingPreds || pendingPreds.length === 0) {
            return { evaluated: 0 };
        }

        // 2. Fetch played and recent finished results in parallel
        const [playedResults, rawResults] = await Promise.all([
            getPlayedMatchesFromDb({ limit: 300 }).catch(() => []),
            getMatchesFromDb(200).catch(() => [])
        ]);

        // 3. Build fast O(1) Hash Map for finished match results
        const resultMap = new Map();
        const addResultToMap = (res) => {
            const h = (res.home_team || res.homeTeam || res.home || '').trim();
            const a = (res.away_team || res.awayTeam || res.away || '').trim();
            const s = (res.score || '').replace('-', ':').trim();
            if (!h || !a || !/^\d+:\d+$/.test(s)) return;

            const l = normalizeLeague(res.league, h, a);
            const normH = normalizeTeam(h);
            const normA = normalizeTeam(a);

            const key1 = `${l}_${normH}_vs_${normA}`;
            const key2 = `ANY_${normH}_vs_${normA}`;
            const dateKey = `${res.match_date || res.date || ''}_${key1}`;

            if (!resultMap.has(dateKey)) resultMap.set(dateKey, res);
            if (!resultMap.has(key1)) resultMap.set(key1, res);
            if (!resultMap.has(key2)) resultMap.set(key2, res);
        };

        (playedResults || []).forEach(addResultToMap);
        (rawResults || []).forEach(addResultToMap);

        const updatesBatch = [];

        // 4. Evaluate each pending prediction in O(1) lookup time
        for (const pred of pendingPreds) {
            const predHome = (pred.home_team || '').trim();
            const predAway = (pred.away_team || '').trim();
            if (!predHome || !predAway) continue;

            const predLeague = normalizeLeague(pred.league, predHome, predAway);
            const normH = normalizeTeam(predHome);
            const normA = normalizeTeam(predAway);

            const dateKey = `${pred.match_date || ''}_${predLeague}_${normH}_vs_${normA}`;
            const leagueKey = `${predLeague}_${normH}_vs_${normA}`;
            const anyKey = `ANY_${normH}_vs_${normA}`;

            const matchResult = resultMap.get(dateKey) || resultMap.get(leagueKey) || resultMap.get(anyKey);

            if (matchResult) {
                const evaluation = evaluatePrediction(pred, matchResult);
                if (evaluation) {
                    updatesBatch.push({
                        id: pred.id,
                        evaluation,
                        status: 'EVALUATED'
                    });
                }
            }
        }

        // 5. Batch update all evaluated predictions in bulk chunks
        if (updatesBatch.length > 0) {
            await bulkUpdateEnginePredictionsInDb(updatesBatch);
            console.log(`[Engine Pipeline] ⚡ High-speed auto-evaluated ${updatesBatch.length} prediction outcomes in batch!`);
        }

        return { evaluated: updatesBatch.length };
    } catch (err) {
        console.error('[Engine Pipeline] ❌ Error in autoEvaluateEnginePredictions:', err.message);
        return { evaluated: 0, error: err.message };
    } finally {
        isAutoEvalRunning = false;
    }
}



module.exports = {
    evaluatePrediction,
    autoRunEnginePredictions,
    autoEvaluateEnginePredictions
};
