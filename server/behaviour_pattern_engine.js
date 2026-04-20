// ─────────────────────────────────────────────────────────────────────────────
// behaviour_pattern_engine.js
//
// Advanced Behavioural Pattern Analysis Engine
//
// Core insight: winning teams don't always win. After a sustained win streak,
// fatigue / regression sets in. When two big teams face each other, the lower
// favourite often wins. A team on a prolonged losing streak eventually "must"
// win — statistical reversion to the mean.
//
// This engine detects three key behavioural patterns from Firebase data:
//   1. WIN STREAK FATIGUE   — Team won N+ in a row → elevated upset risk
//   2. BIG TEAM CLASH       — Two historically strong teams meet → underdog bias
//   3. LOSS REVERSAL SIGNAL — Team lost N+ in a row → overdue win
//
// All signals are persisted to Firestore under 'behaviour_patterns' collection.
// ─────────────────────────────────────────────────────────────────────────────

const { BehaviorSignal } = require('./db_init');
const { getCachedDocs, parseDDMMYYYY, computeTeamForm } = require('./db_reader');

// ── Tuneable Constants ────────────────────────────────────────────────────────
const WIN_STREAK_FATIGUE_THRESHOLD  = 4;   // ≥4 consecutive wins = fatigue risk
const LOSS_REVERSAL_THRESHOLD       = 4;   // ≥4 consecutive losses = reversal signal
const BIG_TEAM_WIN_PERCENT_CUTOFF   = 55;  // team with ≥55% overall win rate = "big team"
const STREAK_SAMPLE_LIMIT           = 15;  // look at last N matches per team

// ─────────────────────────────────────────────────────────────────────────────
// computeCurrentStreak
// Scans a team's most recent matches and returns consecutive W or L count.
// ─────────────────────────────────────────────────────────────────────────────
function computeCurrentStreak(recentResults) {
    console.log('[BPE] computeCurrentStreak — scanning', recentResults.length, 'results');

    if (!recentResults || recentResults.length === 0) {
        return { streakType: 'none', streakCount: 0, lastResult: null };
    }

    const first = recentResults[0].result;  // 'W', 'D', 'L'
    let count = 0;

    for (const r of recentResults) {
        if (r.result === first) count++;
        else break;
    }

    const streakType = first === 'W' ? 'win' : first === 'L' ? 'loss' : 'draw';
    console.log(`[BPE] Streak detected: ${count}x ${streakType}`);
    return { streakType, streakCount: count, lastResult: first };
}

// ─────────────────────────────────────────────────────────────────────────────
// detectBehaviourPatterns
// Entry point — analyses a list of upcoming fixtures and returns signals.
//
// @param {Array}  fixtures  — Array of { homeTeam, awayTeam, league, gameTime? }
// @param {string} league    — The league these fixtures belong to
// @returns {Promise<Array>} — Array of BehaviourSignal objects
// ─────────────────────────────────────────────────────────────────────────────
async function detectBehaviourPatterns(fixtures, league) {
    console.log(`[BPE] 🧠 Starting behaviour pattern detection for ${fixtures.length} fixtures in ${league}...`);

    const signals = [];

    for (const fixture of fixtures) {
        const { homeTeam, awayTeam } = fixture;
        console.log(`[BPE] Analysing: ${homeTeam} vs ${awayTeam}`);

        // ── Fetch form for both teams ────────────────────────────────────────
        let homeForm, awayForm;
        try {
            [homeForm, awayForm] = await Promise.all([
                computeTeamForm(league, homeTeam, STREAK_SAMPLE_LIMIT),
                computeTeamForm(league, awayTeam, STREAK_SAMPLE_LIMIT)
            ]);
        } catch (err) {
            console.error(`[BPE] ❌ Form fetch failed for ${homeTeam}/${awayTeam}:`, err.message);
            continue;
        }

        // Compute current streaks from lastGames
        const homeStreak = computeCurrentStreak(homeForm.lastGames || []);
        const awayStreak  = computeCurrentStreak(awayForm.lastGames || []);

        // Overall win rate (wins / played regardless of venue)
        const homeTotalPlayed = (homeForm.homeRecord?.played || 0) + (homeForm.awayRecord?.played || 0);
        const awayTotalPlayed = (awayForm.homeRecord?.played || 0) + (awayForm.awayRecord?.played || 0);
        const homeOverallWinPct = homeTotalPlayed > 0
            ? Math.round(((homeForm.wins || 0) / homeTotalPlayed) * 100) : 0;
        const awayOverallWinPct = awayTotalPlayed > 0
            ? Math.round(((awayForm.wins || 0) / awayTotalPlayed) * 100) : 0;

        const fixtureSignals = [];

        // ════════════════════════════════════════════════════════════════════
        // PATTERN 1: WIN STREAK FATIGUE
        // Team has won 4+ in a row — statistical regression risk is elevated.
        // The OPPONENT gets a signal boost for this fixture.
        // ════════════════════════════════════════════════════════════════════
        if (homeStreak.streakType === 'win' && homeStreak.streakCount >= WIN_STREAK_FATIGUE_THRESHOLD) {
            const signal = {
                patternType: 'WIN_STREAK_FATIGUE',
                team: homeTeam,
                venue: 'Home',
                streakCount: homeStreak.streakCount,
                riskLevel: homeStreak.streakCount >= 7 ? 'HIGH' : homeStreak.streakCount >= 5 ? 'MEDIUM' : 'LOW',
                message: `⚠️ ${homeTeam} is on a ${homeStreak.streakCount}-game WIN streak at home — statistical regression risk is elevated. The away team ${awayTeam} has an upset chance above their baseline probability.`,
                impact: 'UPSET_RISK_HOME',
                biasToward: awayTeam,
                biasLabel: 'Away',
                confidence: Math.min(50 + homeStreak.streakCount * 5, 85)
            };
            fixtureSignals.push(signal);
            console.log(`[BPE] 🔥 WIN_STREAK_FATIGUE: ${homeTeam} (H) on ${homeStreak.streakCount}-game streak`);
        }

        if (awayStreak.streakType === 'win' && awayStreak.streakCount >= WIN_STREAK_FATIGUE_THRESHOLD) {
            const signal = {
                patternType: 'WIN_STREAK_FATIGUE',
                team: awayTeam,
                venue: 'Away',
                streakCount: awayStreak.streakCount,
                riskLevel: awayStreak.streakCount >= 7 ? 'HIGH' : awayStreak.streakCount >= 5 ? 'MEDIUM' : 'LOW',
                message: `⚠️ ${awayTeam} is on a ${awayStreak.streakCount}-game WIN streak — regression risk. The home team ${homeTeam} may benefit from a return to form for ${awayTeam}.`,
                impact: 'UPSET_RISK_AWAY',
                biasToward: homeTeam,
                biasLabel: 'Home',
                confidence: Math.min(50 + awayStreak.streakCount * 5, 85)
            };
            fixtureSignals.push(signal);
            console.log(`[BPE] 🔥 WIN_STREAK_FATIGUE: ${awayTeam} (A) on ${awayStreak.streakCount}-game streak`);
        }

        // ════════════════════════════════════════════════════════════════════
        // PATTERN 2: LOSS REVERSAL SIGNAL
        // Team has lost 4+ in a row — they are statistically overdue a win.
        // The team on the losing streak gets a signal boost (due win).
        // ════════════════════════════════════════════════════════════════════
        if (homeStreak.streakType === 'loss' && homeStreak.streakCount >= LOSS_REVERSAL_THRESHOLD) {
            const signal = {
                patternType: 'LOSS_REVERSAL_SIGNAL',
                team: homeTeam,
                venue: 'Home',
                streakCount: homeStreak.streakCount,
                riskLevel: homeStreak.streakCount >= 6 ? 'HIGH' : homeStreak.streakCount >= 5 ? 'MEDIUM' : 'LOW',
                message: `🔄 ${homeTeam} has lost ${homeStreak.streakCount} games in a row — statistical reversion signal. Playing at HOME this game may trigger overdue win. Do not count them out.`,
                impact: 'LOSS_REVERSAL',
                biasToward: homeTeam,
                biasLabel: 'Home',
                confidence: Math.min(45 + homeStreak.streakCount * 6, 80)
            };
            fixtureSignals.push(signal);
            console.log(`[BPE] 📈 LOSS_REVERSAL: ${homeTeam} (H) on ${homeStreak.streakCount}-game loss streak`);
        }

        if (awayStreak.streakType === 'loss' && awayStreak.streakCount >= LOSS_REVERSAL_THRESHOLD) {
            const signal = {
                patternType: 'LOSS_REVERSAL_SIGNAL',
                team: awayTeam,
                venue: 'Away',
                streakCount: awayStreak.streakCount,
                riskLevel: awayStreak.streakCount >= 6 ? 'HIGH' : awayStreak.streakCount >= 5 ? 'MEDIUM' : 'LOW',
                message: `🔄 ${awayTeam} has lost ${awayStreak.streakCount} games in a row — overdue win signal. Even away, do NOT assume they lose automatically.`,
                impact: 'LOSS_REVERSAL',
                biasToward: awayTeam,
                biasLabel: 'Away',
                confidence: Math.min(40 + awayStreak.streakCount * 5, 75)
            };
            fixtureSignals.push(signal);
            console.log(`[BPE] 📈 LOSS_REVERSAL: ${awayTeam} (A) on ${awayStreak.streakCount}-game loss streak`);
        }

        // ════════════════════════════════════════════════════════════════════
        // PATTERN 3: BIG TEAM CLASH
        // Both teams have a high overall win rate — the "weaker" big team tends
        // to cause an upset when clashing with the "stronger" big team.
        // ════════════════════════════════════════════════════════════════════
        const bothBig = homeOverallWinPct >= BIG_TEAM_WIN_PERCENT_CUTOFF
                     && awayOverallWinPct >= BIG_TEAM_WIN_PERCENT_CUTOFF;

        if (bothBig) {
            // In a big-team clash, the favourite is actually more vulnerable
            const stronger = homeOverallWinPct >= awayOverallWinPct ? homeTeam : awayTeam;
            const weaker   = stronger === homeTeam ? awayTeam : homeTeam;
            const weakerVenue = stronger === homeTeam ? 'Away' : 'Home';
            const diff = Math.abs(homeOverallWinPct - awayOverallWinPct);

            const signal = {
                patternType: 'BIG_TEAM_CLASH',
                homeTeam,
                awayTeam,
                homeOverallWinPct,
                awayOverallWinPct,
                stronger,
                weaker,
                riskLevel: diff <= 10 ? 'HIGH' : diff <= 20 ? 'MEDIUM' : 'LOW',
                message: `⚡ BIG TEAM CLASH: Both ${homeTeam} (${homeOverallWinPct}% win rate) and ${awayTeam} (${awayOverallWinPct}% win rate) are top-performing teams. When two big teams meet, the slightly weaker side (${weaker}) often produces an upset — DON'T auto-predict the stronger team.`,
                impact: 'UPSET_IN_CLASH',
                biasToward: weaker,
                biasLabel: weakerVenue,
                confidence: diff <= 10 ? 72 : diff <= 20 ? 60 : 50
            };
            fixtureSignals.push(signal);
            console.log(`[BPE] ⚡ BIG_TEAM_CLASH: ${homeTeam} (${homeOverallWinPct}%) vs ${awayTeam} (${awayOverallWinPct}%) — diff=${diff}%`);
        }

        // Attach all signals to this fixture
        if (fixtureSignals.length > 0) {
            signals.push({
                fixture: `${homeTeam} vs ${awayTeam}`,
                homeTeam,
                awayTeam,
                league,
                gameTime: fixture.gameTime || null,
                homeStreak,
                awayStreak,
                homeOverallWinPct,
                awayOverallWinPct,
                signals: fixtureSignals,
                analyzedAt: new Date().toISOString()
            });
        } else {
            console.log(`[BPE] ✅ No anomalous patterns detected for ${homeTeam} vs ${awayTeam}`);
        }
    }

    console.log(`[BPE] 🏁 Analysis complete — ${signals.length} fixtures with behaviour signals found.`);
    return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// saveBehaviourSignals
// Persists detected signals to Database under 'behavior_signals'.
// ─────────────────────────────────────────────────────────────────────────────
async function saveBehaviourSignals(signals, league, date) {
    console.log(`[BPE] 💾 Saving ${signals.length} behaviour signals to Database...`);
    if (signals.length === 0) {
        console.log('[BPE] No signals to save.');
        return null;
    }
    try {
        const docId = `${date.replace(/\//g, '-')}_${league.replace(/ /g, '_')}`;
        const payload = {
            league,
            date,
            signals,
            totalSignals: signals.length,
            createdAt: new Date(),
            signalTypes: [...new Set(signals.flatMap(s => s.signals.map(sig => sig.patternType)))]
        };
        await BehaviorSignal.findByIdAndUpdate(docId, { $set: payload }, { upsert: true });
        console.log(`[BPE] ✅ Saved behaviour signals to DB doc: ${docId}`);
        return payload;
    } catch (err) {
        console.error('[BPE] ❌ Failed to save behaviour signals:', err.message);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchBehaviourSignals
// Fetches the last N saved signal documents from Database.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchBehaviourSignals(league = null, limit = 10) {
    console.log(`[BPE] 📖 Fetching behaviour signals — league=${league || 'ALL'}, limit=${limit}`);
    try {
        let query = {};
        if (league) {
            query.league = league;
        }
        const docs = await BehaviorSignal.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        console.log(`[BPE] ✅ Fetched ${docs.length} behaviour signal documents.`);
        return docs.map(d => ({ id: d._id, ...d }));
    } catch (err) {
        console.error('[BPE] ❌ Failed to fetch behaviour signals:', err.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildBehaviourPromptInjection
// Converts behaviour signals into a compact text block for AI prompt injection.
// This is injected into the predict-live and daily-tips/analyze prompts so the
// AI can factor in streak fatigue, clash dynamics, and reversal signals.
// ─────────────────────────────────────────────────────────────────────────────
function buildBehaviourPromptInjection(behaviourSignals) {
    if (!behaviourSignals || behaviourSignals.length === 0) {
        return '';
    }

    const lines = ['== 🔬 BEHAVIOURAL PATTERN SIGNALS (CRITICAL — override simple form if present) =='];
    lines.push('These signals detect statistical anomalies that override raw win% predictions.\n');

    for (const fixtureData of behaviourSignals) {
        lines.push(`📋 ${fixtureData.fixture}:`);
        for (const sig of fixtureData.signals) {
            const riskEmoji = sig.riskLevel === 'HIGH' ? '🚨' : sig.riskLevel === 'MEDIUM' ? '⚠️' : '💡';
            lines.push(`  ${riskEmoji} [${sig.patternType}] ${sig.message}`);
            lines.push(`     → Bias toward: ${sig.biasToward} (${sig.biasLabel}) | Confidence: ${sig.confidence}%`);
        }
        lines.push('');
    }

    lines.push('DIRECTIVE: If a BIG_TEAM_CLASH or WIN_STREAK_FATIGUE signal is present,');
    lines.push('reduce confidence in the favourite by 15–25% and increase upset probability accordingly.');
    lines.push('If a LOSS_REVERSAL_SIGNAL is present for the underdog, do NOT auto-predict their loss.');
    lines.push('== END BEHAVIOURAL SIGNALS ==\n');

    return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// computeLeagueStreakProfile
// Computes a league-wide streak fingerprint — which teams currently have
// active win/loss streaks of 3+. Useful for dashboard display.
// ─────────────────────────────────────────────────────────────────────────────
async function computeLeagueStreakProfile(league) {
    console.log(`[BPE] 📊 Computing league streak profile for ${league}...`);
    try {
        const docs = await getCachedDocs();

        // Collect all unique teams in this league
        const teams = new Set();
        docs.filter(d => d.league === league && d.homeTeam && d.awayTeam).forEach(d => {
            teams.add(d.homeTeam);
            teams.add(d.awayTeam);
        });

        console.log(`[BPE] Found ${teams.size} teams in ${league}`);

        const streakProfiles = [];
        for (const team of teams) {
            const form = await computeTeamForm(league, team, STREAK_SAMPLE_LIMIT);
            const streak = computeCurrentStreak(form.lastGames || []);

            if (streak.streakCount >= 3) {
                streakProfiles.push({
                    team,
                    streakType: streak.streakType,
                    streakCount: streak.streakCount,
                    riskFlag: streak.streakType === 'win' && streak.streakCount >= WIN_STREAK_FATIGUE_THRESHOLD
                        ? 'FATIGUE_RISK'
                        : streak.streakType === 'loss' && streak.streakCount >= LOSS_REVERSAL_THRESHOLD
                            ? 'REVERSAL_DUE'
                            : 'NOTABLE',
                    homeWinPct: form.homeWinPercent,
                    awayWinPct: form.awayWinPercent,
                    recentForm: form.recentForm
                });
            }
        }

        // Sort by streak length descending
        streakProfiles.sort((a, b) => b.streakCount - a.streakCount);
        console.log(`[BPE] ✅ Streak profile complete: ${streakProfiles.length} notable teams found.`);
        return streakProfiles;
    } catch (err) {
        console.error('[BPE] ❌ computeLeagueStreakProfile error:', err.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// compareScreenshotResults
// Compares the two most recent screenshot results to detect any performance
// trends or anomalies (e.g. a previously dominant team starting to slip).
//
// @param {Array} latestMatches    — Matches from the newest screenshot
// @param {Array} previousMatches  — Matches from the prior screenshot
// @returns {Object}                — Comparison report
// ─────────────────────────────────────────────────────────────────────────────
function compareScreenshotResults(latestMatches, previousMatches) {
    console.log(`[BPE] 🔍 Comparing ${latestMatches.length} latest vs ${previousMatches.length} previous screenshot matches...`);

    // Build outcome maps — team → [win/draw/loss strings]
    function buildTeamOutcomes(matches) {
        const map = {};
        for (const m of matches) {
            if (!m.homeTeam || !m.awayTeam || !m.score) continue;
            const parts = (m.score || '').replace('-', ':').split(':').map(s => parseInt(s.trim(), 10));
            if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;
            const [hg, ag] = parts;
            const homeResult = hg > ag ? 'W' : hg < ag ? 'L' : 'D';
            const awayResult = hg < ag ? 'W' : hg > ag ? 'L' : 'D';
            if (!map[m.homeTeam]) map[m.homeTeam] = [];
            if (!map[m.awayTeam]) map[m.awayTeam] = [];
            map[m.homeTeam].push({ result: homeResult, venue: 'Home', opponent: m.awayTeam, score: m.score });
            map[m.awayTeam].push({ result: awayResult, venue: 'Away', opponent: m.homeTeam, score: m.score });
        }
        return map;
    }

    const latestMap   = buildTeamOutcomes(latestMatches);
    const previousMap = buildTeamOutcomes(previousMatches);

    const comparisons = [];

    // Find teams that appear in both snapshots
    const sharedTeams = Object.keys(latestMap).filter(t => previousMap[t]);

    for (const team of sharedTeams) {
        const latestResult   = latestMap[team][latestMap[team].length - 1]?.result;  // newest
        const previousResult = previousMap[team][previousMap[team].length - 1]?.result;

        if (latestResult && previousResult && latestResult !== previousResult) {
            comparisons.push({
                team,
                previousResult,
                latestResult,
                change: `${previousResult} → ${latestResult}`,
                insight: latestResult === 'W' && previousResult === 'L'
                    ? `📈 ${team} BOUNCED BACK from a loss to a win — reversal momentum`
                    : latestResult === 'L' && previousResult === 'W'
                        ? `📉 ${team} DROPPED from a win to a loss — may signal fatigue`
                        : `↔️ ${team} moved from ${previousResult} to ${latestResult}`
            });
        }
    }

    // Summary stats
    const latestHomeWins = latestMatches.filter(m => {
        const p = (m.score || '').replace('-', ':').split(':').map(Number);
        return p[0] > p[1];
    }).length;
    const previousHomeWins = previousMatches.filter(m => {
        const p = (m.score || '').replace('-', ':').split(':').map(Number);
        return p[0] > p[1];
    }).length;

    const report = {
        latestMatchCount: latestMatches.length,
        previousMatchCount: previousMatches.length,
        teamChanges: comparisons,
        latestHomeWinRate: latestMatches.length > 0
            ? Math.round((latestHomeWins / latestMatches.length) * 100) : 0,
        previousHomeWinRate: previousMatches.length > 0
            ? Math.round((previousHomeWins / previousMatches.length) * 100) : 0,
        trend: latestHomeWins > previousHomeWins
            ? 'Home advantage STRENGTHENING'
            : latestHomeWins < previousHomeWins
                ? 'Home advantage WEAKENING'
                : 'Home advantage STABLE',
        analyzedAt: new Date().toISOString()
    };

    console.log(`[BPE] ✅ Comparison done. ${comparisons.length} teams with result changes. Trend: ${report.trend}`);
    return report;
}

module.exports = {
    detectBehaviourPatterns,
    saveBehaviourSignals,
    fetchBehaviourSignals,
    buildBehaviourPromptInjection,
    computeLeagueStreakProfile,
    compareScreenshotResults,
    computeCurrentStreak,
    // Constants - exported for reference
    WIN_STREAK_FATIGUE_THRESHOLD,
    LOSS_REVERSAL_THRESHOLD,
    BIG_TEAM_WIN_PERCENT_CUTOFF
};
