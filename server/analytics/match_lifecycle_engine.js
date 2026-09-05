/**
 * match_lifecycle_engine.js
 * Correlates upcoming fixtures (and their pre-match DOM odds) with verified match results.
 * Produces complete match records for the `match_played` table in Supabase.
 */

const {
    getUpcomingMatchesFromDb,
    updateUpcomingMatchStatus,
    bulkUpdateUpcomingMatchStatus,
    savePlayedMatchesToDb,
    getMatchesFromDb
} = require('../database/supabase');


const { TEAM_LEAGUES, detectLeague, normalizeTeamKey } = require('../constants');

// ── Normalize team name for fuzzy matching (e.g. "ARS" vs "Arsenal") ──────────
function normalizeTeam(name = '') {
    return normalizeTeamKey(name);
}

// ── Normalize league (e.g. "England", "Spain", "Italy", "Germany", "France") ───
function normalizeLeague(league = '', home = '', away = '') {
    const detected = detectLeague(league, home, away);
    return detected.replace(/\s*-\s*Virtual/i, '').trim();
}

function getTeamTokens(name = '') {
    const raw = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    const words = raw.split(/\s+/).filter(Boolean);
    const tokens = new Set();
    const joined = words.join('');
    if (joined) tokens.add(joined);
    if (joined.length >= 3) tokens.add(joined.slice(0, 3));
    if (words.length > 1) {
        tokens.add(words.map(w => w[0]).join(''));
        if (words[0].length >= 1 && words[1].length >= 2) {
            tokens.add(words[0][0] + words[1].slice(0, 2));
        }
    }
    return tokens;
}

/**
 * Check if two team strings refer to the same team.
 * Accepts exact matches, acronyms, 3-letter prefix matches, or contains.
 */
function teamsMatch(teamA = '', teamB = '') {
    const a = normalizeTeam(teamA);
    const b = normalizeTeam(teamB);
    if (!a || !b) return false;
    if (a === b) return true;

    const tokensA = getTeamTokens(teamA);
    const tokensB = getTeamTokens(teamB);

    for (const t of tokensA) {
        if (tokensB.has(t)) return true;
    }

    if (a.length >= 3 && b.length >= 3) {
        if (a.startsWith(b.slice(0, 3)) || b.startsWith(a.slice(0, 3))) return true;
    }
    return a.includes(b) || b.includes(a);
}

/**
 * Compute winning outcomes and payout calculations from pre-match odds & final score.
 */
function computeOutcomes(scoreStr, odds = {}) {
    let homeScore = 0;
    let awayScore = 0;

    if (scoreStr && typeof scoreStr === 'string') {
        const cleanScore = scoreStr.trim();
        const sep = cleanScore.includes(':') ? ':' : cleanScore.includes('-') ? '-' : null;
        if (sep) {
            const parts = cleanScore.split(sep);
            homeScore = parseInt(parts[0], 10) || 0;
            awayScore = parseInt(parts[1], 10) || 0;
        }
    }

    let winner = 'DRAW';
    let winner1x2 = 'X';
    let winningOdd = odds?.draw || null;

    if (homeScore > awayScore) {
        winner = 'HOME_WIN';
        winner1x2 = '1';
        winningOdd = odds?.home_win || null;
    } else if (awayScore > homeScore) {
        winner = 'AWAY_WIN';
        winner1x2 = '2';
        winningOdd = odds?.away_win || null;
    }

    const totalGoals = homeScore + awayScore;
    const over15 = totalGoals > 1.5;
    const over25 = totalGoals > 2.5;
    const ggNg = (homeScore > 0 && awayScore > 0) ? 'GG' : 'NG';

    return {
        homeScore,
        awayScore,
        winner,
        winner1x2,
        winningOdd,
        totalGoals,
        over15,
        over25,
        ggNg
    };
}

/**
 * Associates active upcoming matches with newly verified results.
 * Populates the `match_played` table and marks upcoming matches as PLAYED.
 * High-speed O(1) Hash-Map indexing for zero latency and minimal RAM overhead.
 */
async function associateMatches(finishedResults = null) {
    try {
        console.log('[Lifecycle Engine] 🔄 Running match association cycle...');

        // 1. Fetch upcoming & in-play matches that haven't been resolved into match_played yet (up to 1000)
        const upcomingList = await getUpcomingMatchesFromDb({ status: 'ALL_UNRESOLVED', limit: 1000 });
        if (!upcomingList || upcomingList.length === 0) {
            console.log('[Lifecycle Engine] ℹ️ No pending upcoming/in-play matches to associate.');
            return { matched: 0 };
        }

        // 2. Fetch recent finished results (up to 1000)
        const results = finishedResults || await getMatchesFromDb(1000);
        if (!results || results.length === 0) {
            console.log('[Lifecycle Engine] ℹ️ No finished results available to match against.');
            return { matched: 0 };
        }

        // 3. Build fast O(1) results map
        const resultMap = new Map();
        for (const res of results) {
            const resHome = (res.homeTeam || res.home_team || res.home || '').trim();
            const resAway = (res.awayTeam || res.away_team || res.away || '').trim();
            const s = (res.score || '').replace('-', ':').trim();
            if (!resHome || !resAway || !/^\d+:\d+$/.test(s)) continue;

            const resLeague = normalizeLeague(res.league, resHome, resAway);
            const normH = normalizeTeam(resHome);
            const normA = normalizeTeam(resAway);

            const key1 = `${resLeague}_${normH}_vs_${normA}`;
            const key2 = `ANY_${normH}_vs_${normA}`;
            const dateKey = `${res.date || res.match_date || ''}_${key1}`;

            if (!resultMap.has(dateKey)) resultMap.set(dateKey, res);
            if (!resultMap.has(key1)) resultMap.set(key1, res);
            if (!resultMap.has(key2)) resultMap.set(key2, res);
        }

        const playedBatch = [];
        const upcomingIdsToMarkPlayed = [];

        for (const upcoming of upcomingList) {
            const h = (upcoming.home_team || '').trim();
            const a = (upcoming.away_team || '').trim();
            if (!h || !a) continue;

            const upgLeague = normalizeLeague(upcoming.league, h, a);
            const normH = normalizeTeam(h);
            const normA = normalizeTeam(a);

            const dateKey = `${upcoming.match_date || ''}_${upgLeague}_${normH}_vs_${normA}`;
            const leagueKey = `${upgLeague}_${normH}_vs_${normA}`;
            const anyKey = `ANY_${normH}_vs_${normA}`;

            const matchResult = resultMap.get(dateKey) || resultMap.get(leagueKey) || resultMap.get(anyKey);

            if (matchResult) {
                const score = (matchResult.score || '0:0').replace('-', ':');
                const outcomes = computeOutcomes(score, upcoming.odds);
                const winnerName = outcomes.winner === 'HOME_WIN'
                    ? upcoming.home_team
                    : outcomes.winner === 'AWAY_WIN'
                        ? upcoming.away_team
                        : 'Draw';

                playedBatch.push({
                    id: `played_${upcoming.id}`,
                    game_id: upcoming.game_id || matchResult.gameId || matchResult.game_id || '',
                    league: upgLeague !== 'vFootball' ? `${upgLeague} - Virtual` : upcoming.league,
                    match_date: matchResult.date || upcoming.match_date,
                    match_time: upcoming.match_time,
                    home_team: upcoming.home_team,
                    away_team: upcoming.away_team,
                    score,
                    ht_score: matchResult.htScore || matchResult.ht_score || '',
                    home_score: outcomes.homeScore,
                    away_score: outcomes.awayScore,
                    winner: outcomes.winner,
                    winner_name: winnerName,
                    odds: upcoming.odds, // EXACT pre-match DOM odds
                    winning_outcomes: {
                        winner_1x2: outcomes.winner1x2,
                        winning_odd: outcomes.winningOdd,
                        total_goals: outcomes.totalGoals,
                        over_1_5: outcomes.over15,
                        over_2_5: outcomes.over25,
                        gg_ng: outcomes.ggNg
                    },
                    status: 'FINISHED',
                    associated_at: new Date().toISOString()
                });

                upcomingIdsToMarkPlayed.push(upcoming.id);
            }
        }

        if (playedBatch.length > 0) {
            await savePlayedMatchesToDb(playedBatch);
            await bulkUpdateUpcomingMatchStatus(upcomingIdsToMarkPlayed, 'PLAYED');
            console.log(`[Lifecycle Engine] ⚡ Successfully associated ${playedBatch.length} matches into match_played in bulk batch!`);
        } else {
            console.log('[Lifecycle Engine] ⏳ No new upcoming matches matched with finished results yet.');
        }

        return { matched: playedBatch.length };
    } catch (err) {
        console.error('[Lifecycle Engine] ❌ Error in match association:', err.message);
        return { matched: 0, error: err.message };
    }
}


module.exports = {
    associateMatches,
    computeOutcomes,
    teamsMatch,
    normalizeTeam,
    normalizeLeague
};
