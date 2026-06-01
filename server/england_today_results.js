/**
 * england_today_results.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   1. Fetch TODAY's England vFootball results from MongoDB.
 *      → Shows each match with exact Home / Away team label and score.
 *   2. For EACH fixture played today, look back through ALL historical records
 *      to find RECURRING scores between those exact two teams.
 *   3. Write a clean Markdown report to:
 *         england_today_recurring_scores.md
 *
 * RUN:
 *   node england_today_results.js
 *   node england_today_results.js --date=03/05/2026   (override date, DD/MM/YYYY)
 *   node england_today_results.js --league="England League 2"  (filter league)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { connectDb, Result } = require('./db_init');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args        = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => {
            const [k, ...v] = a.replace('--', '').split('=');
            return [k, v.join('=')];
        })
);

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayDDMMYYYY() {
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${now.getFullYear()}`;
}

function parseDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt.getTime()) ? null : dt;
}

// ── Score normaliser ───────────────────────────────────────────────────────────
function normaliseScore(raw) {
    if (!raw) return null;
    const s = raw.trim().replace('-', ':');
    return /^\d+:\d+$/.test(s) ? s : null;
}

// ── Determine result outcome from perspective of the HOME team ─────────────────
function outcomeLabel(homeGoals, awayGoals) {
    if (homeGoals > awayGoals) return '🏠 Home Win';
    if (homeGoals < awayGoals) return '✈️  Away Win';
    return '🤝 Draw';
}

// ── Build a canonical pair key (alphabetical so A-vs-B === B-vs-A) ────────────
function pairKey(teamA, teamB) {
    return [teamA, teamB].sort().join(' ⚔️ ');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ENGLAND TODAY RESULTS + RECURRING SCORE EXTRACTOR');
    console.log('═══════════════════════════════════════════════════════════');

    // Step 1 — Connect to MongoDB
    console.log('\n[Step 1/5] 🔌 Connecting to MongoDB...');
    await connectDb();
    console.log('[Step 1/5] ✅ Connected.');

    // Step 2 — Determine target date and league filter
    const targetDate   = args.date   || todayDDMMYYYY();
    const leagueFilter = args.league || null;
    console.log(`\n[Step 2/5] 📅 Target date  : ${targetDate}`);
    console.log(`[Step 2/5] 🏴󠁧󠁢󠁥󠁮󠁧󠁿 League filter : ${leagueFilter || 'All England leagues'}`);

    // Step 3 — Fetch TODAY's England results
    console.log('\n[Step 3/5] 🗄️  Fetching today\'s England results from MongoDB...');
    const todayQuery = {
        date  : targetDate,
        league: leagueFilter
            ? leagueFilter
            : { $regex: /england/i }   // Match any England league variant
    };

    const todayDocs = await Result.find(todayQuery).lean();

    // Filter to only docs that have a proper score
    const todayResults = todayDocs.filter(d => normaliseScore(d.score));

    console.log(`[Step 3/5] ✅ Found ${todayDocs.length} total docs for today. ${todayResults.length} have valid scores.`);

    if (todayResults.length === 0) {
        console.warn('[Step 3/5] ⚠️  No scored results found for today. Try --date=DD/MM/YYYY to override the date.');
        process.exit(0);
    }

    // Sort by time ascending (earliest kick-off first)
    todayResults.sort((a, b) => {
        const toMin = t => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        return toMin(a.time) - toMin(b.time);
    });

    // Step 4 — Fetch FULL England history (for recurring score look-back)
    console.log('\n[Step 4/5] 📚 Fetching full England history from MongoDB (all dates)...');
    const historyQuery = { league: leagueFilter ? leagueFilter : { $regex: /england/i } };
    const allHistory   = await Result.find(historyQuery).lean();
    console.log(`[Step 4/5] ✅ Loaded ${allHistory.length} total historical England records.`);

    // Step 5 — Build recurring score analysis per fixture
    console.log('\n[Step 5/5] 🔍 Analysing recurring scores for each fixture...\n');

    // Group today's results by league for display
    const byLeague = {};
    for (const match of todayResults) {
        const lg = match.league || 'Unknown';
        if (!byLeague[lg]) byLeague[lg] = [];
        byLeague[lg].push(match);
    }

    // Collect all pair analyses
    const allPairAnalyses = [];

    for (const [league, matches] of Object.entries(byLeague)) {
        console.log(`\n  League: ${league} (${matches.length} matches today)`);
        console.log('  ' + '─'.repeat(60));

        for (const match of matches) {
            const home  = match.homeTeam || match.home || 'Unknown';
            const away  = match.awayTeam || match.away || 'Unknown';
            const score = normaliseScore(match.score);
            const time  = match.time || '--:--';

            const [hg, ag] = score.split(':').map(Number);
            const outcome  = outcomeLabel(hg, ag);

            console.log(`\n    🕐 ${time}  |  ${home} (H) ${hg} - ${ag} ${away} (A)  →  ${outcome}`);

            // ── Find all historical meetings between these two teams ───────────
            const h = home.toLowerCase();
            const a = away.toLowerCase();

            const historicalMeetings = allHistory.filter(d => {
                if (!d.homeTeam || !d.awayTeam) return false;
                const dh = d.homeTeam.toLowerCase();
                const da = d.awayTeam.toLowerCase();
                // Include all fixture directions (home↔away flipped too)
                return (dh === h && da === a) || (dh === a && da === h);
            }).filter(d => normaliseScore(d.score) && d.date !== targetDate); // exclude today

            console.log(`      📜 Historical meetings found (excluding today): ${historicalMeetings.length}`);

            // Count each score (normalised from the perspective of doc's homeTeam)
            const scoreCounts = {};
            for (const doc of historicalMeetings) {
                const ns = normaliseScore(doc.score);
                if (!ns) continue;
                scoreCounts[ns] = (scoreCounts[ns] || 0) + 1;
            }

            // Sort by frequency
            const sortedScores = Object.entries(scoreCounts)
                .sort((a, b) => b[1] - a[1]);

            // Find recurring scores (appeared ≥ 2 times)
            const recurring = sortedScores.filter(([, cnt]) => cnt >= 2);

            console.log(`      🔁 Recurring scores (≥2 times): ${recurring.length}`);
            recurring.slice(0, 5).forEach(([sc, cnt]) => {
                const pct = ((cnt / historicalMeetings.length) * 100).toFixed(1);
                console.log(`         ${sc}  →  ${cnt}x  (${pct}%)`);
            });

            // Check if TODAY's score is one of the recurring ones
            const todayScoreRecurring = recurring.find(([sc]) => sc === score);
            if (todayScoreRecurring) {
                console.log(`      ✨ TODAY's score ${score} IS a recurring pattern! (${todayScoreRecurring[1]}x historically)`);
            }

            allPairAnalyses.push({
                league,
                time,
                home,
                away,
                todayScore: score,
                outcome,
                historicalMeetings: historicalMeetings.length,
                scoreCounts,
                recurring,
                topScore: sortedScores[0] || null,
                todayScoreWasRecurring: !!todayScoreRecurring,
            });
        }
    }

    // ── Build Markdown Report ─────────────────────────────────────────────────
    const now       = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const outPath   = path.join(__dirname, 'england_today_recurring_scores.md');

    const lines = [];
    lines.push(`# 🏴󠁧󠁢󠁥󠁮󠁧󠁿 England Today's Results & Recurring Score Report`);
    lines.push(`\n> **Date:** ${targetDate}  |  **Generated:** ${timestamp}  |  **Total matches:** ${todayResults.length}\n`);
    lines.push('---\n');

    // ── Section 1: Today's Fixture List ──────────────────────────────────────
    lines.push('## 📋 Today\'s Completed Fixtures\n');
    lines.push('| Time | League | Home Team | Score | Away Team | Venue Result |');
    lines.push('|------|--------|-----------|-------|-----------|-------------|');

    for (const p of allPairAnalyses) {
        const [hg, ag] = p.todayScore.split(':');
        lines.push(`| ${p.time} | ${p.league} | **${p.home}** | \`${hg} - ${ag}\` | **${p.away}** | ${p.outcome} |`);
    }

    lines.push('\n---\n');

    // ── Section 2: Recurring Score Analysis ──────────────────────────────────
    lines.push('## 🔁 Recurring Score Patterns — Per Fixture\n');
    lines.push('> A *recurring score* is any scoreline that has appeared **2 or more times** in the full historical record for that exact pair of teams.\n');

    let recurringFixtureCount = 0;

    for (const p of allPairAnalyses) {
        lines.push(`### ${p.time} — ${p.home} vs ${p.away}  *(${p.league})*`);
        lines.push(`**Today's Score:** \`${p.todayScore}\` → ${p.outcome}\n`);
        lines.push(`**Historical meetings (all time, excl. today):** ${p.historicalMeetings}`);

        if (p.historicalMeetings === 0) {
            lines.push('\n> ⚠️ No historical data found for this pair. This may be a new fixture combination.\n');
            continue;
        }

        if (p.recurring.length === 0) {
            lines.push('\n> ℹ️ No recurring scores found — every historical meeting between these teams ended with a unique scoreline.\n');
        } else {
            recurringFixtureCount++;
            lines.push('\n**Recurring Scores (≥2 occurrences):**\n');
            lines.push('| Score | Times Occurred | Frequency % |');
            lines.push('|-------|---------------|------------|');

            for (const [sc, cnt] of p.recurring) {
                const pct = ((cnt / p.historicalMeetings) * 100).toFixed(1);
                const highlight = sc === p.todayScore ? ' ← **TODAY\'s score!** ✨' : '';
                lines.push(`| \`${sc}\` | ${cnt}× | ${pct}%${highlight} |`);
            }
            lines.push('');
        }

        if (p.todayScoreWasRecurring) {
            lines.push(`> ✅ **MATCH:** Today's score \`${p.todayScore}\` confirmed as a recurring pattern.\n`);
        }

        // Show full score frequency table
        const allScores = Object.entries(p.scoreCounts).sort((a, b) => b[1] - a[1]);
        if (allScores.length > 0) {
            lines.push('<details>');
            lines.push('<summary>📊 Full score frequency table (click to expand)</summary>\n');
            lines.push('| Score | Count |');
            lines.push('|-------|-------|');
            for (const [sc, cnt] of allScores) {
                lines.push(`| \`${sc}\` | ${cnt} |`);
            }
            lines.push('\n</details>\n');
        }

        lines.push('---\n');
    }

    // ── Section 3: Summary Stats ──────────────────────────────────────────────
    lines.push('## 📊 Summary\n');

    const totalMatches      = allPairAnalyses.length;
    const matchesToday      = allPairAnalyses.filter(p => p.todayScoreWasRecurring).length;
    const noHistoryPairs    = allPairAnalyses.filter(p => p.historicalMeetings === 0).length;
    const withRecurring     = allPairAnalyses.filter(p => p.recurring.length > 0).length;

    // Home / Away / Draw breakdown
    const homeWins  = allPairAnalyses.filter(p => p.outcome.includes('Home Win')).length;
    const awayWins  = allPairAnalyses.filter(p => p.outcome.includes('Away Win')).length;
    const draws     = allPairAnalyses.filter(p => p.outcome.includes('Draw')).length;

    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total fixtures today | ${totalMatches} |`);
    lines.push(`| Home wins | ${homeWins} (${pct(homeWins, totalMatches)}%) |`);
    lines.push(`| Away wins | ${awayWins} (${pct(awayWins, totalMatches)}%) |`);
    lines.push(`| Draws | ${draws} (${pct(draws, totalMatches)}%) |`);
    lines.push(`| Fixtures with recurring score data | ${withRecurring} |`);
    lines.push(`| Today's score matched a recurring pattern | **${matchesToday}** |`);
    lines.push(`| Pairs with no historical data | ${noHistoryPairs} |`);
    lines.push('');

    // ── Top recurring scores across ALL pairs today ───────────────────────────
    const globalScoreBucket = {};
    for (const p of allPairAnalyses) {
        for (const [sc, cnt] of p.recurring) {
            if (!globalScoreBucket[sc]) globalScoreBucket[sc] = { totalOccurrences: 0, pairs: 0 };
            globalScoreBucket[sc].totalOccurrences += cnt;
            globalScoreBucket[sc].pairs++;
        }
    }

    const globalTopScores = Object.entries(globalScoreBucket)
        .sort((a, b) => b[1].totalOccurrences - a[1].totalOccurrences)
        .slice(0, 10);

    if (globalTopScores.length > 0) {
        lines.push('### 🏆 Top Recurring Scores Across All Today\'s Fixtures\n');
        lines.push('| Score | Total Occurrences | Pairs Sharing It |');
        lines.push('|-------|------------------|-----------------|');
        for (const [sc, data] of globalTopScores) {
            lines.push(`| \`${sc}\` | ${data.totalOccurrences} | ${data.pairs} |`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`\n*Report generated by \`england_today_results.js\` — ${timestamp}*`);

    // ── Write the file ────────────────────────────────────────────────────────
    const mdContent = lines.join('\n');
    fs.writeFileSync(outPath, mdContent, 'utf8');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`✅ Report saved → ${outPath}`);
    console.log(`   Total fixtures today : ${totalMatches}`);
    console.log(`   Recurring pattern matches today : ${matchesToday}`);
    console.log(`   Fixtures with recurring data : ${withRecurring}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function pct(part, total) {
    if (total === 0) return '0.0';
    return ((part / total) * 100).toFixed(1);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
run().catch(err => {
    console.error('\n[FATAL] Unhandled error in england_today_results.js:');
    console.error('  Message:', err.message);
    console.error('  Stack  :', err.stack);
    process.exit(1);
});
