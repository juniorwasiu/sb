require('dotenv').config();
const { connectDb, Result } = require('./db_init');
const fs = require('fs');
const path = require('path');

// ── Parse DD/MM/YYYY + HH:MM into a Date object ──────────────────────────────
function parseDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length !== 3) return new Date(0);
    const [d, m, y] = parts;
    const [h, min] = timeStr.split(':');
    return new Date(y, m - 1, d, h || 0, min || 0);
}

// ── Compute outcome tips for a stats bucket ──────────────────────────────────
function computeTips(stats, threshold = 80) {
    if (stats.total === 0) return [];
    const pct = (k) => (stats[k] / stats.total) * 100;
    const f   = (k) => stats.total - stats[k];
    const tips = [];
    if (pct('nextWin')        >= threshold) tips.push(`🏆 Win (${pct('nextWin').toFixed(1)}% — ${stats.nextWin}✓/${f('nextWin')}✗)`);
    if (pct('nextLoss')       >= threshold) tips.push(`❌ Loss (${pct('nextLoss').toFixed(1)}% — ${stats.nextLoss}✓/${f('nextLoss')}✗)`);
    if (pct('nextDraw')       >= threshold) tips.push(`🤝 Draw (${pct('nextDraw').toFixed(1)}% — ${stats.nextDraw}✓/${f('nextDraw')}✗)`);
    if (pct('nextOver15')     >= threshold) tips.push(`⚽ Over 1.5 (${pct('nextOver15').toFixed(1)}% — ${stats.nextOver15}✓/${f('nextOver15')}✗)`);
    if (pct('nextOver25')     >= threshold) tips.push(`🔥 Over 2.5 (${pct('nextOver25').toFixed(1)}% — ${stats.nextOver25}✓/${f('nextOver25')}✗)`);
    if (pct('nextGG')         >= threshold) tips.push(`🥅 GG/BTTS (${pct('nextGG').toFixed(1)}% — ${stats.nextGG}✓/${f('nextGG')}✗)`);
    if (pct('nextHomeOver05') >= threshold) tips.push(`🏠 Home Scores (${pct('nextHomeOver05').toFixed(1)}% — ${stats.nextHomeOver05}✓/${f('nextHomeOver05')}✗)`);
    if (pct('nextAwayOver05') >= threshold) tips.push(`✈️ Away Scores (${pct('nextAwayOver05').toFixed(1)}% — ${stats.nextAwayOver05}✓/${f('nextAwayOver05')}✗)`);
    return tips;
}

function initStats() {
    return { total: 0, nextWin: 0, nextLoss: 0, nextDraw: 0, nextOver15: 0, nextOver25: 0, nextGG: 0, nextHomeOver05: 0, nextAwayOver05: 0 };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function analyzeScorePatterns() {
    await connectDb();
    console.log('Fetching all match results...');
    const allDocs = await Result.find({}).lean();
    console.log(`Fetched ${allDocs.length} total matches.`);

    let minDate = new Date('2100-01-01');
    let maxDate = new Date('1970-01-01');

    // ── Step 1: Build per-team chronological match list ───────────────────────
    const teamMatches = {}; // { [league]: { [team]: [...matches sorted chronologically] } }

    for (const m of allDocs) {
        if (!m.score || !/^\d+[:\-]\d+$/.test(m.score.trim())) continue;
        const parsedDate = parseDateTime(m.date, m.time);

        if (parsedDate.getTime() !== 0) {
            if (parsedDate < minDate) minDate = parsedDate;
            if (parsedDate > maxDate) maxDate = parsedDate;
        }

        const lg = m.league || 'Unknown';
        if (!teamMatches[lg]) teamMatches[lg] = {};

        const add = (team, isHome) => {
            if (!team) return;
            if (!teamMatches[lg][team]) teamMatches[lg][team] = [];
            teamMatches[lg][team].push({ ...m, isHome, parsedDate });
        };
        add(m.homeTeam, true);
        add(m.awayTeam, false);
    }

    // Sort each team's matches chronologically
    for (const lg of Object.keys(teamMatches))
        for (const team of Object.keys(teamMatches[lg]))
            teamMatches[lg][team].sort((a, b) => a.parsedDate - b.parsedDate);

    // ── Step 2: Accumulate stats per team, grouped by score & role ────────────
    //
    //   store[league][score][role (Home|Away)][teamName] = stats
    //
    // For a match ending 0:0:
    //   - The HOME TEAM is recorded under store[lg]['0:0']['Home'][homeTeamName]
    //   - The AWAY TEAM is recorded under store[lg]['0:0']['Away'][awayTeamName]
    //
    // stats tracks what happened in that team's VERY NEXT MATCH
    const store = {};

    for (const lg of Object.keys(teamMatches)) {
        store[lg] = {};
        for (const team of Object.keys(teamMatches[lg])) {
            const matches = teamMatches[lg][team];

            for (let i = 0; i < matches.length - 1; i++) {
                const cur = matches[i];     // trigger match (the scored match)
                const nxt = matches[i + 1]; // that team's immediate next match

                const score = cur.score.replace('-', ':').trim();
                const role  = cur.isHome ? 'Home' : 'Away'; // role in TRIGGER match

                if (!store[lg][score])              store[lg][score] = {};
                if (!store[lg][score][role])         store[lg][score][role] = {};
                if (!store[lg][score][role][team])   store[lg][score][role][team] = initStats();

                const st = store[lg][score][role][team];
                st.total++;

                // What happened to this team in their next match?
                const np  = nxt.score.replace('-', ':').split(':').map(Number);
                const ngf = nxt.isHome ? np[0] : np[1]; // goals FOR  the tracked team
                const nga = nxt.isHome ? np[1] : np[0]; // goals AGAINST

                if (ngf > nga)      st.nextWin++;
                else if (ngf < nga) st.nextLoss++;
                else                st.nextDraw++;

                const ntg = ngf + nga;
                if (ntg > 1.5) st.nextOver15++;
                if (ntg > 2.5) st.nextOver25++;
                if (ngf > 0 && nga > 0) st.nextGG++;
                if (np[0] > 0) st.nextHomeOver05++; // home side of NEXT match scored
                if (np[1] > 0) st.nextAwayOver05++; // away side of NEXT match scored
            }
        }
    }

    // ── Step 3: Build Markdown Report ─────────────────────────────────────────
    let report = '# 🎯 Elite Behavioral Patterns Report — By Specific Team Name\n\n';
    report += `**Data Range:** ${minDate.toDateString()} to ${maxDate.toDateString()}\n\n`;
    report += 'For each scoreline, this report shows which **specific teams** were involved and what happens\n';
    report += 'to each of those teams in their **very next match**, with a minimum 80% probability.\n\n';
    report += '- **Home Team**: the team that played at HOME when that score occurred\n';
    report += '- **Away Team**: the team that played AWAY when that score occurred\n\n';
    report += '> **Minimum sample size per team: 3 matches · Minimum probability: 80%**\n\n';
    report += '---\n\n';

    const MIN_SAMPLES = 3;
    const THRESHOLD   = 80;

    let totalPatternsFound = 0;

    for (const lg of Object.keys(store).sort()) {
        let leagueOutput = '';

        for (const score of Object.keys(store[lg]).sort()) {
            let scoreBlock = '';

            for (const role of ['Home', 'Away']) {
                if (!store[lg][score][role]) continue;

                const teamEntries = Object.entries(store[lg][score][role])
                    .filter(([, st]) => st.total >= MIN_SAMPLES)
                    .sort((a, b) => b[1].total - a[1].total); // most samples first

                if (teamEntries.length === 0) continue;

                // Only include teams that have at least one elite tip
                const teamRows = teamEntries.map(([teamName, st]) => {
                    const tips = computeTips(st, THRESHOLD);
                    if (tips.length === 0) return null;
                    return { teamName, st, tips };
                }).filter(Boolean);

                if (teamRows.length === 0) continue;

                scoreBlock += `\n#### ${role === 'Home' ? '🏠 Home Team' : '✈️ Away Team'} — after ${role === 'Home' ? 'playing at HOME' : 'playing AWAY'} in a \`${score}\`\n\n`;
                scoreBlock += `| Team | Samples | Elite Tips (≥${THRESHOLD}%) |\n`;
                scoreBlock += `|------|---------|-----------------------------|\n`;

                for (const { teamName, st, tips } of teamRows) {
                    scoreBlock += `| **${teamName}** | ${st.total} | ${tips.join(' · ')} |\n`;
                    totalPatternsFound++;
                }
                scoreBlock += '\n';
            }

            if (scoreBlock) {
                leagueOutput += `### Score: \`${score}\`\n${scoreBlock}`;
            }
        }

        if (leagueOutput) {
            report += `## 🏴󠁧󠁢󠁥󠁮󠁧󠁿 League: ${lg}\n\n`;
            report += leagueOutput;
            report += '---\n\n';
        }
    }

    report += `\n_Total team-specific patterns found: **${totalPatternsFound}**_\n`;

    const outputPath = path.join(__dirname, 'score_patterns_80_100.md');
    fs.writeFileSync(outputPath, report);
    console.log(`\n✅ Done. Found ${totalPatternsFound} team-specific patterns.`);
    console.log(`Report saved to: ${outputPath}`);

    process.exit(0);
}

analyzeScorePatterns().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
});
