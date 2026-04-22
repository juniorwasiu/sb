require('dotenv').config();
const { connectDb, Result } = require('./db_init');
const fs = require('fs');
const path = require('path');

function parseDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt.getTime()) ? null : dt;
}

async function analyzeAllLeagues() {
    await connectDb();

    // Fetch all records from the db to filter in memory
    const allDocs = await Result.find({}).lean();

    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    threeDaysAgo.setHours(0,0,0,0);

    const relevantDocs = allDocs.filter(doc => {
        const d = parseDDMMYYYY(doc.date);
        if (!d) return false;
        return d >= threeDaysAgo;
    });

    console.log(`Found ${relevantDocs.length} total records from the past 3+ days.`);

    // Group by league
    const leagueData = {};

    relevantDocs.forEach(m => {
        if (!m.score || !/^\d+[:\-]\d+$/.test(m.score.trim())) return;
        const lg = m.league || "Unknown";
        if (!leagueData[lg]) leagueData[lg] = [];
        leagueData[lg].push(m);
    });

    let reportContent = "# Full League Pattern Analysis Report (Past 3+ Days)\n\n";

    // Sort leagues by number of matches (descending)
    const sortedLeagues = Object.keys(leagueData).sort((a,b) => leagueData[b].length - leagueData[a].length);

    for (const lg of sortedLeagues) {
        const matches = leagueData[lg];
        const totalValid = matches.length;
        if (totalValid < 5) continue; // Skip leagues with very few matches to avoid statistical noise

        let sumHomeGoals = 0;
        let sumAwayGoals = 0;
        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;
        let gg = 0;
        let over1_5 = 0;
        let over2_5 = 0;
        const topScores = {};

        matches.forEach(m => {
            const parts = m.score.replace('-', ':').split(':').map(s => parseInt(s.trim(), 10));
            const hg = parts[0];
            const ag = parts[1];

            sumHomeGoals += hg;
            sumAwayGoals += ag;

            if (hg > ag) homeWins++;
            else if (hg < ag) awayWins++;
            else draws++;

            if (hg > 0 && ag > 0) gg++;
            if (hg + ag > 1.5) over1_5++;
            if (hg + ag > 2.5) over2_5++;

            const scoreStr = `${hg}-${ag}`;
            topScores[scoreStr] = (topScores[scoreStr] || 0) + 1;
        });

        reportContent += `## League: ${lg}\n`;
        reportContent += `- **Matches Evaluated**: ${totalValid}\n`;
        reportContent += `- **Average Goals/Match**: ${((sumHomeGoals + sumAwayGoals) / totalValid).toFixed(2)}\n\n`;

        reportContent += `### Match Outcomes\n`;
        reportContent += `- **Home Wins**: ${homeWins} (${((homeWins / totalValid) * 100).toFixed(1)}%)\n`;
        reportContent += `- **Away Wins**: ${awayWins} (${((awayWins / totalValid) * 100).toFixed(1)}%)\n`;
        reportContent += `- **Draws**: ${draws} (${((draws / totalValid) * 100).toFixed(1)}%)\n\n`;

        reportContent += `### Goal Markets\n`;
        reportContent += `- **GG (BTTS)**: ${gg} (${((gg / totalValid) * 100).toFixed(1)}%)\n`;
        reportContent += `- **Over 1.5**: ${over1_5} (${((over1_5 / totalValid) * 100).toFixed(1)}%)\n`;
        reportContent += `- **Over 2.5**: ${over2_5} (${((over2_5 / totalValid) * 100).toFixed(1)}%)\n\n`;

        reportContent += `### Top Scorelines\n`;
        const sortedScores = Object.entries(topScores).sort((a,b) => b[1] - a[1]).slice(0, 5);
        for (let i = 0; i < sortedScores.length; i++) {
            const [score, count] = sortedScores[i];
            const outcome = score.split('-')[0] > score.split('-')[1] ? 'Home Win' : (score.split('-')[0] < score.split('-')[1] ? 'Away Win' : 'Draw');
            reportContent += `${i + 1}. **${score}** (${outcome}) - ${count} matches (${((count/totalValid)*100).toFixed(1)}%)\n`;
        }
        reportContent += `\n---\n\n`;
    }

    const outputPath = path.join(__dirname, 'all_leagues_patterns_report.md');
    fs.writeFileSync(outputPath, reportContent);
    console.log(`\nAnalysis complete. Report written to ${outputPath}`);
    
    process.exit(0);
}

analyzeAllLeagues().catch(err => {
    console.error(err);
    process.exit(1);
});
