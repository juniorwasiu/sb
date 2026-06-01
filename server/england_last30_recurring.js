/**
 * england_last30_recurring.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Analyse ALL England (or any) virtual football results from the LAST 30 DAYS
 *   (or whatever daysBack you set), extract every unique team-pair encountered,
 *   and compute:
 *     • All scores that have occurred between those two teams
 *     • Recurring scores (≥ 2 occurrences) with frequency %
 *     • Per-day breakdown of that pair's results
 *     • Summary stats: home/away/draw splits, most common score overall
 *
 *   Saves a rich Markdown report to:
 *       england_last30_recurring_scores.md
 *
 * RUN:
 *   node england_last30_recurring.js
 *   node england_last30_recurring.js --days=15
 *   node england_last30_recurring.js --league="England - Virtual" --days=30
 *   node england_last30_recurring.js --league="Spain - Virtual" --days=30
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { connectDb, Result } = require('./db_init');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => {
            const [k, ...v] = a.replace('--', '').split('=');
            return [k, v.join('=')];
        })
);

const DAYS_BACK     = parseInt(args.days   || '30', 10);
const LEAGUE_FILTER = args.league || null; // null = all England leagues
const MIN_RECUR     = parseInt(args.min    || '2', 10);  // min occurrences to count as recurring

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt.getTime()) ? null : dt;
}

function todayDDMMYYYY() {
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${now.getFullYear()}`;
}

function formatDateLabel(str) {
    const d = parseDDMMYYYY(str);
    if (!d) return str;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Score normaliser ──────────────────────────────────────────────────────────
function normaliseScore(raw) {
    if (!raw) return null;
    const s = raw.trim().replace('-', ':');
    return /^\d+:\d+$/.test(s) ? s : null;
}

// ── Outcome from home team perspective ───────────────────────────────────────
function outcomeLabel(homeGoals, awayGoals) {
    if (homeGoals > awayGoals) return '🏠 HW';
    if (homeGoals < awayGoals) return '✈️ AW';
    return '🤝 D';
}

// ── Canonical pair key (alphabetical so order doesn't matter) ─────────────────
function pairKey(teamA, teamB) {
    return [teamA.trim(), teamB.trim()].sort().join(' ⚔️ ');
}

function pct(part, total) {
    if (!total) return '0.0';
    return ((part / total) * 100).toFixed(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  LAST-30-DAYS RECURRING SCORE EXTRACTOR');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Days back    : ${DAYS_BACK}`);
    console.log(`  League filter: ${LEAGUE_FILTER || 'All England - Virtual leagues'}`);
    console.log(`  Min recur    : ≥ ${MIN_RECUR} occurrences`);
    console.log(`  Run time     : ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Step 1 — Connect
    console.log('\n[Step 1/4] 🔌 Connecting to MongoDB...');
    await connectDb();
    console.log('[Step 1/4] ✅ Connected.');

    // Step 2 — Compute date window
    console.log(`\n[Step 2/4] 📅 Computing date window (last ${DAYS_BACK} days)...`);
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - DAYS_BACK);
    cutoff.setHours(0, 0, 0, 0);
    console.log(`[Step 2/4] ✅ Cutoff date : ${cutoff.toISOString().slice(0, 10)}`);

    // Step 3 — Fetch data
    console.log('\n[Step 3/4] 🗄️  Fetching records from MongoDB...');
    const leagueQuery = LEAGUE_FILTER
        ? LEAGUE_FILTER
        : { $regex: /england/i };

    const allDocs = await Result.find({ league: leagueQuery }).lean();
    console.log(`[Step 3/4]   Raw docs fetched: ${allDocs.length}`);

    // Filter to date window and valid scores
    const docs = allDocs.filter(doc => {
        const d = parseDDMMYYYY(doc.date);
        if (!d) return false;
        if (d < cutoff) return false;
        return normaliseScore(doc.score) !== null;
    });

    console.log(`[Step 3/4] ✅ Docs within window with valid scores: ${docs.length}`);

    if (docs.length === 0) {
        console.warn('[Step 3/4] ⚠️  No data found in the specified window. Try --days=60 or check the DB.');
        process.exit(0);
    }

    // Which dates are actually in the window?
    const datesInWindow = [...new Set(docs.map(d => d.date))].sort((a, b) => {
        const pa = parseDDMMYYYY(a) || new Date(0);
        const pb = parseDDMMYYYY(b) || new Date(0);
        return pb - pa;
    });
    console.log(`[Step 3/4]   Distinct dates in window: ${datesInWindow.length} (${datesInWindow[datesInWindow.length - 1]} → ${datesInWindow[0]})`);

    // Step 4 — Build pair index
    console.log('\n[Step 4/4] 🔍 Building team-pair recurring score index...');

    // pairMap: pairKey → { matchHistory: [], scoreCounts: {}, datesSeen: Set }
    const pairMap = new Map();

    for (const doc of docs) {
        const home  = (doc.homeTeam || doc.home || '').trim();
        const away  = (doc.awayTeam || doc.away || '').trim();
        const score = normaliseScore(doc.score);

        if (!home || !away || !score) continue;

        const key = pairKey(home, away);
        if (!pairMap.has(key)) {
            pairMap.set(key, {
                teamA: [home, away].sort()[0],
                teamB: [home, away].sort()[1],
                matchHistory: [],
                scoreCounts: {},
            });
        }

        const entry = pairMap.get(key);
        const [hg, ag] = score.split(':').map(Number);

        entry.matchHistory.push({
            date   : doc.date,
            time   : doc.time || '--:--',
            league : doc.league,
            home,
            away,
            score,
            hg, ag,
            outcome: outcomeLabel(hg, ag),
        });

        entry.scoreCounts[score] = (entry.scoreCounts[score] || 0) + 1;
    }

    console.log(`[Step 4/4] ✅ ${pairMap.size} unique team pairs indexed.`);

    // ── Enrich each pair ──────────────────────────────────────────────────────
    const pairList = [];

    for (const [key, data] of pairMap.entries()) {
        data.matchHistory.sort((a, b) => {
            const pa = parseDDMMYYYY(a.date) || new Date(0);
            const pb = parseDDMMYYYY(b.date) || new Date(0);
            if (pb - pa !== 0) return pb - pa;  // newest date first
            return (b.time || '').localeCompare(a.time || '');
        });

        const total   = data.matchHistory.length;
        const homeWins = data.matchHistory.filter(m => m.hg > m.ag).length;
        const awayWins = data.matchHistory.filter(m => m.hg < m.ag).length;
        const draws    = data.matchHistory.filter(m => m.hg === m.ag).length;

        // Recurring = appeared ≥ MIN_RECUR times
        const recurring = Object.entries(data.scoreCounts)
            .filter(([, cnt]) => cnt >= MIN_RECUR)
            .sort((a, b) => b[1] - a[1]);

        // All scores sorted
        const allScores = Object.entries(data.scoreCounts)
            .sort((a, b) => b[1] - a[1]);

        pairList.push({
            key,
            teamA: data.teamA,
            teamB: data.teamB,
            total,
            homeWins,
            awayWins,
            draws,
            scoreCounts: data.scoreCounts,
            allScores,
            recurring,
            matchHistory: data.matchHistory,
            mostCommonScore: allScores[0] || null,
        });
    }

    // Sort: pairs with most recurring scores first, then by match count
    pairList.sort((a, b) => {
        if (b.recurring.length !== a.recurring.length) return b.recurring.length - a.recurring.length;
        return b.total - a.total;
    });

    const pairsWithRecurring = pairList.filter(p => p.recurring.length > 0);
    console.log(`\n  Pairs with recurring scores: ${pairsWithRecurring.length} / ${pairList.length}`);

    // ── Global recurring score frequency (across all pairs) ───────────────────
    const globalScoreBucket = {};
    for (const p of pairList) {
        for (const [sc, cnt] of p.recurring) {
            if (!globalScoreBucket[sc]) globalScoreBucket[sc] = { total: 0, pairs: 0 };
            globalScoreBucket[sc].total += cnt;
            globalScoreBucket[sc].pairs++;
        }
    }
    const globalTopScores = Object.entries(globalScoreBucket)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 15);

    // ── Build Markdown report ─────────────────────────────────────────────────
    const leagueLabel = LEAGUE_FILTER || 'England - Virtual (all)';
    const outFileName = `england_last30_recurring_scores.md`;
    const outPath     = path.join(__dirname, outFileName);

    const lines = [];

    lines.push(`# 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Last ${DAYS_BACK}-Day Recurring Score Report`);
    lines.push(`\n> **League:** ${leagueLabel}  |  **Window:** last ${DAYS_BACK} days (${datesInWindow[datesInWindow.length - 1]} → ${datesInWindow[0]})  |  **Generated:** ${timestamp}`);
    lines.push(`> **Total matches analysed:** ${docs.length}  |  **Unique pairs:** ${pairList.length}  |  **Pairs with recurring scores:** ${pairsWithRecurring.length}\n`);
    lines.push('---\n');

    // ── Section 1: Executive Summary ─────────────────────────────────────────
    lines.push('## 📊 Executive Summary\n');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Dates in window | ${datesInWindow.length} (${datesInWindow[datesInWindow.length - 1]} → ${datesInWindow[0]}) |`);
    lines.push(`| Total scored matches | ${docs.length} |`);
    lines.push(`| Unique team pairs | ${pairList.length} |`);
    lines.push(`| Pairs with ≥${MIN_RECUR} recurring scores | **${pairsWithRecurring.length}** |`);

    const allHomeWins  = docs.filter(d => { const [h,a] = normaliseScore(d.score).split(':').map(Number); return h > a; }).length;
    const allAwayWins  = docs.filter(d => { const [h,a] = normaliseScore(d.score).split(':').map(Number); return h < a; }).length;
    const allDraws     = docs.filter(d => { const [h,a] = normaliseScore(d.score).split(':').map(Number); return h === a; }).length;
    lines.push(`| Home wins | ${allHomeWins} (${pct(allHomeWins, docs.length)}%) |`);
    lines.push(`| Away wins | ${allAwayWins} (${pct(allAwayWins, docs.length)}%) |`);
    lines.push(`| Draws | ${allDraws} (${pct(allDraws, docs.length)}%) |`);
    lines.push('');

    // ── Section 2: Global Top Recurring Scores ────────────────────────────────
    if (globalTopScores.length > 0) {
        lines.push('## 🏆 Most Recurring Scores Across All Pairs\n');
        lines.push('> These scorelines appeared most frequently across the league over the last ' + DAYS_BACK + ' days.\n');
        lines.push('| Rank | Score | Total Occurrences | Pairs Sharing It |');
        lines.push('|------|-------|------------------|-----------------|');
        globalTopScores.forEach(([sc, data], i) => {
            lines.push(`| ${i + 1} | \`${sc}\` | ${data.total} | ${data.pairs} |`);
        });
        lines.push('\n---\n');
    }

    // ── Section 3: Per-Pair Recurring Scores (only pairs with recurrences) ────
    lines.push('## 🔁 Recurring Scores — Per Team Pair\n');
    lines.push(`> Only showing pairs with **≥${MIN_RECUR} recurring scores**. Sorted by most recurring scorelines first.\n`);

    if (pairsWithRecurring.length === 0) {
        lines.push('> ⚠️ No recurring scores found. Try `--days=60` or `--min=1` to widen the criteria.\n');
    }

    for (const p of pairsWithRecurring) {
        lines.push(`### ${p.teamA} ⚔️ ${p.teamB}`);
        lines.push(`**Matches in window:** ${p.total}  |  🏠 Home Wins: ${p.homeWins} (${pct(p.homeWins, p.total)}%)  |  ✈️ Away Wins: ${p.awayWins} (${pct(p.awayWins, p.total)}%)  |  🤝 Draws: ${p.draws} (${pct(p.draws, p.total)}%)\n`);

        lines.push('**Recurring Scores (≥' + MIN_RECUR + ' occurrences):**\n');
        lines.push('| Score | Occurrences | Frequency % |');
        lines.push('|-------|------------|------------|');
        for (const [sc, cnt] of p.recurring) {
            lines.push(`| \`${sc}\` | ${cnt}× | ${pct(cnt, p.total)}% |`);
        }
        lines.push('');

        // Match history for this pair
        lines.push('<details>');
        lines.push('<summary>📅 Full match history (click to expand)</summary>\n');
        lines.push('| Date | Time | Home | Score | Away | Result |');
        lines.push('|------|------|------|-------|------|--------|');
        for (const m of p.matchHistory) {
            const dateFmt = formatDateLabel(m.date);
            lines.push(`| ${dateFmt} | ${m.time} | ${m.home} | \`${m.score}\` | ${m.away} | ${m.outcome} |`);
        }
        lines.push('\n</details>\n');
        lines.push('---\n');
    }

    // ── Section 4: Pairs with NO recurring scores (compact list) ─────────────
    const noRecurPairs = pairList.filter(p => p.recurring.length === 0);
    if (noRecurPairs.length > 0) {
        lines.push('## ℹ️ Pairs With No Recurring Scores Yet\n');
        lines.push('> These pairs played in the window but every result was unique so far.\n');
        lines.push('| Pair | Matches | Most Common Score |');
        lines.push('|------|---------|------------------|');
        for (const p of noRecurPairs.slice(0, 50)) { // cap at 50 rows
            const top = p.allScores[0] ? `\`${p.allScores[0][0]}\` (1×)` : 'N/A';
            lines.push(`| ${p.teamA} ⚔️ ${p.teamB} | ${p.total} | ${top} |`);
        }
        if (noRecurPairs.length > 50) {
            lines.push(`\n*...and ${noRecurPairs.length - 50} more pairs with a single match each.*`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`\n*Report generated by \`england_last30_recurring.js\` — ${timestamp}*`);

    // ── Write file ────────────────────────────────────────────────────────────
    const mdContent = lines.join('\n');
    fs.writeFileSync(outPath, mdContent, 'utf8');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`✅ Report saved → ${outPath}`);
    console.log(`   Dates in window   : ${datesInWindow.length}`);
    console.log(`   Total matches     : ${docs.length}`);
    console.log(`   Unique pairs      : ${pairList.length}`);
    console.log(`   Pairs w/ recurring: ${pairsWithRecurring.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
run().catch(err => {
    console.error('\n[FATAL] Unhandled error in england_last30_recurring.js:');
    console.error('  Message:', err.message);
    console.error('  Stack  :', err.stack);
    process.exit(1);
});
