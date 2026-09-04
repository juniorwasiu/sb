/**
 * match_lifecycle_engine.js
 * Correlates upcoming fixtures (and their pre-match DOM odds) with verified match results.
 * Produces complete match records for the `match_played` table in Supabase.
 */

const {
    getUpcomingMatchesFromDb,
    updateUpcomingMatchStatus,
    savePlayedMatchesToDb,
    getMatchesFromDb
} = require('../database/supabase');

// ── Team acronym to league mapping for intelligent league inference ──────────
const TEAM_LEAGUES = {
    // England
    ARS: 'England', CHE: 'England', LIV: 'England', MCI: 'England', MUN: 'England', TOT: 'England',
    NEW: 'England', AST: 'England', BHA: 'England', BRE: 'England', CRY: 'England', EVE: 'England',
    FUL: 'England', NFO: 'England', WOL: 'England', BOU: 'England', WHU: 'England', IPS: 'England',
    LEI: 'England', SOU: 'England', COV: 'England', HUL: 'England', LEE: 'England', SUN: 'England',
    // Spain
    RMA: 'Spain', BAR: 'Spain', ATM: 'Spain', SEV: 'Spain', VIL: 'Spain', RSO: 'Spain',
    BET: 'Spain', ATH: 'Spain', VAL: 'Spain', CEL: 'Spain', GIR: 'Spain', OSA: 'Spain',
    MAL: 'Spain', GET: 'Spain', ALV: 'Spain', RAY: 'Spain', ESP: 'Spain', VLD: 'Spain',
    LEG: 'Spain', LPA: 'Spain', VCF: 'Spain', BIL: 'Spain', RBB: 'Spain', ELC: 'Spain',
    // Italy
    INT: 'Italy', ACM: 'Italy', JUV: 'Italy', NAP: 'Italy', ROM: 'Italy', LAZ: 'Italy',
    ATA: 'Italy', FIO: 'Italy', TOR: 'Italy', BOL: 'Italy', BFC: 'Italy', MON: 'Italy',
    GEN: 'Italy', LEC: 'Italy', UDI: 'Italy', CAG: 'Italy', VER: 'Italy', EMP: 'Italy',
    PAR: 'Italy', COM: 'Italy', VEN: 'Italy', FRO: 'Italy', SAS: 'Italy',
    // Germany
    BAY: 'Germany', BVB: 'Germany', RBL: 'Germany', LEV: 'Germany', STU: 'Germany', FRA: 'Germany',
    WOB: 'Germany', HOF: 'Germany', BMG: 'Germany', AUG: 'Germany', BRE: 'Germany', MAI: 'Germany',
    BOC: 'Germany', HEI: 'Germany', BER: 'Germany', STP: 'Germany', KIE: 'Germany', BMU: 'Germany',
    SVW: 'Germany', TSG: 'Germany', FCA: 'Germany', PAD: 'Germany', KOE: 'Germany', SCH: 'Germany',
    // France
    PSG: 'France', MAR: 'France', MON: 'France', LYO: 'France', LIL: 'France', REN: 'France',
    NIC: 'France', LEN: 'France', STR: 'France', TOU: 'France', REI: 'France', NAN: 'France'
};

// ── Normalize team name for fuzzy matching (e.g. "ARS" vs "Arsenal") ──────────
function normalizeTeam(name = '') {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

// ── Normalize league (e.g. "England League" vs "England - Virtual") ───────────
function normalizeLeague(league = '', home = '', away = '') {
    const l = (league || '').toLowerCase();
    if (l.includes('england')) return 'England';
    if (l.includes('spain'))   return 'Spain';
    if (l.includes('italy'))   return 'Italy';
    if (l.includes('germany')) return 'Germany';
    if (l.includes('france'))  return 'France';

    const h = (home || '').toUpperCase().trim();
    const a = (away || '').toUpperCase().trim();
    if (TEAM_LEAGUES[h] || TEAM_LEAGUES[a]) {
        return TEAM_LEAGUES[h] || TEAM_LEAGUES[a];
    }

    return 'vFootball';
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
 */
async function associateMatches(finishedResults = null) {
    try {
        console.log('[Lifecycle Engine] 🔄 Running match association cycle...');

        // 1. Fetch upcoming & in-play matches that haven't been resolved into match_played yet
        const upcomingList = await getUpcomingMatchesFromDb({ status: 'ALL_UNRESOLVED', limit: 300 });
        if (!upcomingList || upcomingList.length === 0) {
            console.log('[Lifecycle Engine] ℹ️ No pending upcoming/in-play matches to associate.');
            return { matched: 0 };
        }

        // 2. Fetch recent finished results
        const results = finishedResults || await getMatchesFromDb(300);
        if (!results || results.length === 0) {
            console.log('[Lifecycle Engine] ℹ️ No finished results available to match against.');
            return { matched: 0 };
        }

        const playedBatch = [];
        let matchedCount = 0;

        for (const upcoming of upcomingList) {
            const upgLeague = normalizeLeague(upcoming.league, upcoming.home_team, upcoming.away_team);

            // Find matching finished result
            const matchResult = results.find(res => {
                const resHome = res.homeTeam || res.home_team;
                const resAway = res.awayTeam || res.away_team;
                const resLeague = normalizeLeague(res.league, resHome, resAway);

                if (upgLeague !== 'vFootball' && resLeague !== 'vFootball' && upgLeague !== resLeague) {
                    return false;
                }

                const homeMatches = teamsMatch(upcoming.home_team, resHome);
                const awayMatches = teamsMatch(upcoming.away_team, resAway);

                return homeMatches && awayMatches;
            });

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

                // Update upcoming match status to PLAYED
                await updateUpcomingMatchStatus(upcoming.id, 'PLAYED');
                matchedCount++;
            }
        }

        if (playedBatch.length > 0) {
            await savePlayedMatchesToDb(playedBatch);
            console.log(`[Lifecycle Engine] ✅ Successfully associated ${playedBatch.length} matches into match_played!`);
        } else {
            console.log('[Lifecycle Engine] ⏳ No new upcoming matches matched with finished results yet.');
        }

        return { matched: matchedCount };
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
