const { Result, HistoryLog } = require('./db_init');

// ── Global In-Memory Cache ────────────────────────────────────────────────────
const GLOBAL_CACHE = {
    resultsDocs:      null,
    resultsTimestamp: 0,
    TTL_MS:           5 * 60 * 1000, 
};

// ── Date Helpers ──────────────────────────────────────────────────────────────

function todayDDMMYYYY() {
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function parseDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt.getTime()) ? null : dt;
}

// ── Internal Cache Helper ─────────────────────────────────────────────────────

async function getCachedDocs() {
    const now = Date.now();
    const isCacheValid = GLOBAL_CACHE.resultsDocs && (now - GLOBAL_CACHE.resultsTimestamp < GLOBAL_CACHE.TTL_MS);

    if (isCacheValid) {
        console.log(`[DB Reader] 💾 Serving ${GLOBAL_CACHE.resultsDocs.length} docs from in-memory cache (expires in ${Math.round((GLOBAL_CACHE.TTL_MS - (now - GLOBAL_CACHE.resultsTimestamp)) / 1000)}s)`);
        return GLOBAL_CACHE.resultsDocs;
    }

    console.log('[DB Reader] 🔄 Cache miss — fetching fresh data from MongoDB...');
    const docs = await Result.find({}).lean();

    GLOBAL_CACHE.resultsDocs      = docs;
    GLOBAL_CACHE.resultsTimestamp = now;
    console.log(`[DB Reader] ✅ Fetched ${docs.length} docs from MongoDB. Cache updated.`);
    return docs;
}

// ── Grouping Helper ───────────────────────────────────────────────────────────

function groupByDate(docs) {
    const byDate = {};
    docs.forEach(doc => {
        const d = doc.date || 'Unknown';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(doc);
    });

    const sortedDates = Object.keys(byDate).sort((a, b) => {
        const pa = parseDDMMYYYY(a) || new Date(0);
        const pb = parseDDMMYYYY(b) || new Date(0);
        return pb - pa;
    });

    return sortedDates.map(date => {
        const matches = byDate[date].sort((a, b) => {
            const toMins = t => {
                if (!t) return 0;
                const [h, m] = t.split(':');
                return Number(h) * 60 + Number(m);
            };
            return toMins(b.time) - toMins(a.time);
        });

        const byLeague = {};
        matches.forEach(m => {
            const lg = m.league || 'Unknown';
            if (!byLeague[lg]) byLeague[lg] = [];
            byLeague[lg].push(m);
        });

        return { date, totalMatches: matches.length, leagues: byLeague };
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function fetchResultsFromDatabase(opts = {}) {
    const { league, dateFrom, dateTo, page = 1, pageSize = 3 } = opts;

    console.log(`[DB Reader] Fetching results: league=${league || 'ALL'} from=${dateFrom || 'ANY'} to=${dateTo || 'ANY'} page=${page}`);

    const rawData = await getCachedDocs();
    let docs = [...rawData];

    if (league) docs = docs.filter(d => d.league === league);

    const fromDate = parseDDMMYYYY(dateFrom);
    const toDate   = parseDDMMYYYY(dateTo);
    if (fromDate || toDate) {
        docs = docs.filter(d => {
            const matchDate = parseDDMMYYYY(d.date);
            if (!matchDate) return false;
            if (fromDate && matchDate < fromDate) return false;
            if (toDate   && matchDate > toDate)   return false;
            return true;
        });
    }

    const availableLeagues = [...new Set(
        rawData.map(d => d.league).filter(Boolean)
    )].sort();

    const allGrouped  = groupByDate(docs);
    const totalDates  = allGrouped.length;
    const totalPages  = Math.max(1, Math.ceil(totalDates / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const pageSlice   = allGrouped.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return { dates: pageSlice, totalDates, totalPages, page: currentPage, availableLeagues };
}

async function fetchTodayResultsFromDatabase(leagueFilter = '') {
    const today = todayDDMMYYYY();
    const rawData = await getCachedDocs();
    let docs = rawData.filter(d => d.date === today);
    if (leagueFilter) docs = docs.filter(d => d.league === leagueFilter);
    return docs;
}

async function fetchFullDayRawResults(league, targetDate) {
    console.log(`[DB Reader] Fetching full day raw results — league="${league || 'ALL'}", date="${targetDate}"`);
    let query = { date: targetDate };
    if (league) query.league = league;
    
    const docs = await Result.find(query).lean();
    console.log(`[DB Reader] Full day raw results: ${docs.length} docs for date=${targetDate}`);
    return docs;
}

async function fetchTeamHistoryFromDatabase(league, homeTeam, awayTeam, daysBack = 10) {
    console.log(`[DB Reader] Fetching H2H history: ${homeTeam} vs ${awayTeam} in ${league}`);
    const rawDocs = await Result.find({ league }).sort({ date: -1 }).limit(2000).lean();
    
    const targets = [homeTeam.toLowerCase(), awayTeam.toLowerCase()];

    const teamMatches = rawDocs.filter(d => {
        if (!d.homeTeam || !d.awayTeam) return false;
        return targets.includes(d.homeTeam.toLowerCase()) || targets.includes(d.awayTeam.toLowerCase());
    });

    teamMatches.sort((a, b) => {
        const pa = parseDDMMYYYY(a.date) || new Date(0);
        const pb = parseDDMMYYYY(b.date) || new Date(0);
        return pb - pa;
    });

    const result = teamMatches.slice(0, 30);
    console.log(`[DB Reader] H2H result: ${result.length} relevant matches found.`);
    return result;
}

async function fetchAvailableDates(league = null) {
    console.log(`[DB Reader] Fetching available dates for league="${league || 'ALL'}"`);
    let query = {};
    if (league) query.league = league;

    // Use distinct for efficiency
    const uniqueDates = await Result.distinct('date', query);
    
    uniqueDates.sort((a, b) => {
        const pa = parseDDMMYYYY(a) || new Date(0);
        const pb = parseDDMMYYYY(b) || new Date(0);
        return pb - pa;
    });

    console.log(`[DB Reader] Available dates found: ${uniqueDates.length}`);
    return uniqueDates;
}

async function fetchAvailableLeagues() {
    const rawData = await getCachedDocs();
    const uniqueLeagues = [...new Set(rawData.map(d => d.league).filter(Boolean))].sort();
    return uniqueLeagues;
}

async function fetchAllHistoryLogs() {
    console.log('[DB Reader] Fetching all history_logs from MongoDB...');
    const allLogs = await HistoryLog.find({}).lean();
    const logs = {};
    allLogs.forEach(doc => {
        logs[doc._id] = doc;
    });
    console.log(`[DB Reader] History logs fetched: ${Object.keys(logs).length} entries.`);
    return logs;
}

async function computeTeamForm(league, teamName, limit = 10) {
    // Exact same implementation...
    try {
        if (!league || !teamName) return _emptyForm(league, teamName);

        const docs = await getCachedDocs();

        const teamMatches = docs.filter(m =>
            m.league === league &&
            (m.homeTeam === teamName || m.awayTeam === teamName) &&
            m.score && /^\d+[:\-]\d+$/.test(m.score.trim())
        );

        teamMatches.sort((a, b) => {
            const pa = parseDDMMYYYY(a.date) || new Date(0);
            const pb = parseDDMMYYYY(b.date) || new Date(0);
            return pb - pa;
        });

        const recent = teamMatches.slice(0, limit);

        if (recent.length === 0) return _emptyForm(league, teamName);

        const results = recent.map(m => {
            const isHome = m.homeTeam === teamName;
            const parts = m.score.replace('-', ':').split(':').map(s => parseInt(s.trim(), 10));
            const gs = isHome ? parts[0] : parts[1]; 
            const gc = isHome ? parts[1] : parts[0]; 
            const result = gs > gc ? 'W' : gs < gc ? 'L' : 'D';
            return {
                date: m.date,
                opponent: isHome ? m.awayTeam : m.homeTeam,
                venue: isHome ? 'Home' : 'Away',  
                score: m.score,
                result,
                scored: gs,
                conceded: gc
            };
        });

        const formStr = results.map(r => r.result).join('');
        const homeResults = results.filter(r => r.venue === 'Home');
        const awayResults = results.filter(r => r.venue === 'Away');
        const homeForm = homeResults.map(r => r.result).join('') || 'No home games';
        const awayForm = awayResults.map(r => r.result).join('') || 'No away games';

        const homeWins = homeResults.filter(r => r.result === 'W').length;
        const homeDraws = homeResults.filter(r => r.result === 'D').length;
        const homeLosses = homeResults.filter(r => r.result === 'L').length;
        const homeWinPercent = homeResults.length > 0 ? Math.round((homeWins / homeResults.length) * 100) : 0;

        const awayWins = awayResults.filter(r => r.result === 'W').length;
        const awayDraws = awayResults.filter(r => r.result === 'D').length;
        const awayLosses = awayResults.filter(r => r.result === 'L').length;
        const awayWinPercent = awayResults.length > 0 ? Math.round((awayWins / awayResults.length) * 100) : 0;

        const homeGoalsScored = homeResults.length > 0 ? parseFloat((homeResults.reduce((s, r) => s + r.scored, 0) / homeResults.length).toFixed(1)) : 0;
        const awayGoalsScored = awayResults.length > 0 ? parseFloat((awayResults.reduce((s, r) => s + r.scored, 0) / awayResults.length).toFixed(1)) : 0;

        let streakCount = 1;
        const lastResult = results[0]?.result;
        for (let i = 1; i < results.length; i++) {
            if (results[i].result === lastResult) streakCount++;
            else break;
        }
        const streakLabel = lastResult === 'W' ? 'winning' : lastResult === 'L' ? 'losing' : 'drawing';
        const streak = streakCount >= 2 ? `${streakCount}-game ${streakLabel} streak` : `Last game: ${lastResult === 'W' ? 'Win' : lastResult === 'L' ? 'Loss' : 'Draw'}`;

        const totalScored = results.reduce((s, r) => s + (r.scored || 0), 0);
        const totalConceded = results.reduce((s, r) => s + (r.conceded || 0), 0);
        const goalsScored = parseFloat((totalScored / results.length).toFixed(1));
        const goalsConceded = parseFloat((totalConceded / results.length).toFixed(1));
        const wins = results.filter(r => r.result === 'W').length;
        const draws = results.filter(r => r.result === 'D').length;
        const losses = results.filter(r => r.result === 'L').length;
        const drawPercent = Math.round((draws / results.length) * 100);

        const over1_5_count = results.filter(r => (r.scored + r.conceded) > 1.5).length;
        const over2_5_count = results.filter(r => (r.scored + r.conceded) > 2.5).length;
        const btts_count = results.filter(r => r.scored > 0 && r.conceded > 0).length;
        const over1_5_percent = Math.round((over1_5_count / results.length) * 100);
        const over2_5_percent = Math.round((over2_5_count / results.length) * 100);
        const btts_percent = Math.round((btts_count / results.length) * 100);

        return {
            team: teamName, league, recentForm: formStr, streak, lastGames: results,
            goalsScored, goalsConceded, wins, draws, losses, drawPercent,
            homeForm, awayForm, homeWinPercent, awayWinPercent, homeGoalsScored, awayGoalsScored,
            homeRecord: { wins: homeWins, draws: homeDraws, losses: homeLosses, played: homeResults.length, winPercent: homeWinPercent },
            awayRecord: { wins: awayWins, draws: awayDraws, losses: awayLosses, played: awayResults.length, winPercent: awayWinPercent },
            over1_5_percent, over2_5_percent, btts_percent, matchesAnalysed: results.length
        };
    } catch (err) {
        console.error(`[DB Reader] ❌ computeTeamForm error for ${teamName}:`, err.message);
        return _emptyForm(league, teamName, true);
    }
}

function _emptyForm(league, teamName, isError = false) {
    return {
        team: teamName || 'Unknown', league: league || 'Unknown',
        recentForm: isError ? 'Error' : 'N/A', streak: isError ? 'Error' : 'No data', lastGames: [],
        goalsScored: 0, goalsConceded: 0, homeForm: isError ? 'Error' : 'N/A', awayForm: isError ? 'Error' : 'N/A',
        homeWinPercent: 0, awayWinPercent: 0, drawPercent: 0, homeGoalsScored: 0, awayGoalsScored: 0,
        homeRecord: { wins: 0, draws: 0, losses: 0, played: 0, winPercent: 0 },
        awayRecord: { wins: 0, draws: 0, losses: 0, played: 0, winPercent: 0 },
        over1_5_percent: 0, over2_5_percent: 0, btts_percent: 0, matchesAnalysed: 0
    };
}

async function computeH2HForm(league, homeTeam, awayTeam, limit = 10) {
    try {
        if (!league || !homeTeam || !awayTeam) return _emptyH2H(homeTeam, awayTeam);

        // use index for H2H
        const rawDocs = await Result.find({ league }).sort({ date: -1 }).limit(1000).lean();
        const hName = String(homeTeam).toLowerCase();
        const aName = String(awayTeam).toLowerCase();

        const h2hMatches = rawDocs.filter(d => {
            if (!d.homeTeam || !d.awayTeam) return false;
            const docHome = String(d.homeTeam).toLowerCase();
            const docAway = String(d.awayTeam).toLowerCase();
            return (docHome === hName && docAway === aName) ||
                   (docHome === aName && docAway === hName);
        });

        h2hMatches.sort((a, b) => {
            const pa = parseDDMMYYYY(a.date) || new Date(0);
            const pb = parseDDMMYYYY(b.date) || new Date(0);
            return pb - pa;
        });

        const recent = h2hMatches.slice(0, limit);
        if (recent.length === 0) return _emptyH2H(homeTeam, awayTeam, 'No H2H data');

        const results = recent.map(m => {
            const parts = m.score.replace('-', ':').split(':').map(s => parseInt(s.trim(), 10));
            const docHomeGoals = parts[0] || 0;
            const docAwayGoals = parts[1] || 0;
            const docHome = String(m.homeTeam).toLowerCase();
            const upcomingHomeWasDocHome = (docHome === hName);

            let outcome;  
            if (docHomeGoals > docAwayGoals) {
                outcome = upcomingHomeWasDocHome ? 'HomeWin' : 'AwayWin';
            } else if (docHomeGoals < docAwayGoals) {
                outcome = upcomingHomeWasDocHome ? 'AwayWin' : 'HomeWin';
            } else {
                outcome = 'Draw';
            }

            return {
                totalGoals: docHomeGoals + docAwayGoals,
                homeGoals: docHomeGoals,
                awayGoals: docAwayGoals,
                bothScored: docHomeGoals > 0 && docAwayGoals > 0,
                outcome   
            };
        });

        const homeWinsInH2H = results.filter(r => r.outcome === 'HomeWin').length;
        const awayWinsInH2H = results.filter(r => r.outcome === 'AwayWin').length;
        const drawsInH2H    = results.filter(r => r.outcome === 'Draw').length;

        let homeAdvantageH2H;
        const homeAdvDiff = homeWinsInH2H - awayWinsInH2H;
        if (homeAdvDiff >= 2)        homeAdvantageH2H = `+Home (${homeTeam} wins more in H2H)`;
        else if (homeAdvDiff <= -2)  homeAdvantageH2H = `+Away (${awayTeam} wins more in H2H)`;
        else                         homeAdvantageH2H = 'Balanced (no clear H2H venue edge)';

        const over1_5_count   = results.filter(r => r.totalGoals > 1.5).length;
        const over2_5_count   = results.filter(r => r.totalGoals > 2.5).length;
        const btts_count      = results.filter(r => r.bothScored).length;
        const over1_5_percent = Math.round((over1_5_count / results.length) * 100);
        const over2_5_percent = Math.round((over2_5_count / results.length) * 100);
        const btts_percent    = Math.round((btts_count / results.length) * 100);

        return {
            home: homeTeam, away: awayTeam,
            over1_5_percent, over2_5_percent, btts_percent,
            homeWinsInH2H, awayWinsInH2H, drawsInH2H,
            homeAdvantageH2H, matchesAnalysed: results.length
        };
    } catch (err) {
        console.error(`[DB Reader] ❌ computeH2HForm error for ${homeTeam} vs ${awayTeam}:`, err.message);
        return _emptyH2H(homeTeam, awayTeam, 'Error', true);
    }
}

function _emptyH2H(homeTeam, awayTeam, advLabel = 'No data', isError = false) {
    return {
        home: homeTeam || 'Unknown', away: awayTeam || 'Unknown',
        over1_5_percent: 'N/A', over2_5_percent: 'N/A', btts_percent: 'N/A',
        homeWinsInH2H: 0, awayWinsInH2H: 0, drawsInH2H: 0,
        homeAdvantageH2H: advLabel, matchesAnalysed: 0
    };
}

async function computeVenueAdvantage(league) {
    try {
        if (!league) return _emptyAdv();

        const docs = await getCachedDocs();

        const leagueMatches = docs.filter(m =>
            m.league === league && m.score && /^\d+[:\-]\d+$/.test(m.score.trim())
        );

        if (leagueMatches.length === 0) return _emptyAdv();

        let homeWins = 0, awayWins = 0, draws = 0;
        leagueMatches.forEach(m => {
            const parts = m.score.replace('-', ':').split(':').map(s => parseInt(s.trim(), 10));
            const homeGoals = parts[0];
            const awayGoals = parts[1];
            if (homeGoals > awayGoals)       homeWins++;
            else if (homeGoals < awayGoals)  awayWins++;
            else                             draws++;
        });

        const total = leagueMatches.length;
        return {
            homeWinPercent: Math.round((homeWins / total) * 100),
            awayWinPercent: Math.round((awayWins / total) * 100),
            drawPercent: Math.round((draws / total) * 100),
            matchesAnalysed: total
        };
    } catch (err) {
        console.error(`[DB Reader] ❌ computeVenueAdvantage error for ${league}:`, err.message);
        return _emptyAdv();
    }
}

function _emptyAdv() {
    return { homeWinPercent: 0, awayWinPercent: 0, drawPercent: 0, matchesAnalysed: 0 };
}

module.exports = {
    fetchResultsFromDatabase,
    fetchResultsFromFirebase: fetchResultsFromDatabase,
    fetchTodayResultsFromDatabase,
    fetchTodayResultsFromFirebase: fetchTodayResultsFromDatabase,
    fetchFullDayRawResults,
    fetchTeamHistoryFromDatabase,
    fetchTeamHistoryFromFirebase: fetchTeamHistoryFromDatabase,
    fetchAvailableDates,
    fetchAvailableLeagues,
    fetchAllHistoryLogs,
    computeTeamForm,
    computeH2HForm,
    computeVenueAdvantage, 
    todayDDMMYYYY,
    parseDDMMYYYY,
    GLOBAL_CACHE, 
    getCachedDocs, 
};
