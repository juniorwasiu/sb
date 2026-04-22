require('dotenv').config();
const { connectDb, Result } = require('./db_init');

function parseDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt.getTime()) ? null : dt;
}

async function analyzeEngland() {
    await connectDb();

    // Fetch all results to do memory filtering since date is stored as string DD/MM/YYYY
    const allDocs = await Result.find({ league: { $regex: /england/i } }).lean();

    const today = new Date();
    // Start of today minus 3 days
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    threeDaysAgo.setHours(0,0,0,0);

    const relevantDocs = allDocs.filter(doc => {
        const d = parseDDMMYYYY(doc.date);
        if (!d) return false;
        return d >= threeDaysAgo;
    });

    console.log(`Found ${relevantDocs.length} England records from the past 3+ days.`);

    let sumHomeGoals = 0;
    let sumAwayGoals = 0;
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let gg = 0;
    let over1_5 = 0;
    let over2_5 = 0;

    const topScores = {};

    relevantDocs.forEach(m => {
        if (!m.score || !/^\d+[:\-]\d+$/.test(m.score.trim())) return;

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

    const totalValid = homeWins + awayWins + draws;
    if (totalValid === 0) {
        console.log("No valid matches with scores found for analysis.");
        process.exit(0);
    }

    console.log("-----------------------------------------");
    console.log("ANALYSIS RESULTS FOR ENGLAND LEAGUE");
    console.log("-----------------------------------------");
    console.log(`Total Valid Matches: ${totalValid}`);
    console.log(`Total Home Goals: ${sumHomeGoals}`);
    console.log(`Total Away Goals: ${sumAwayGoals}`);
    console.log(`Avg Match Goals: ${((sumHomeGoals + sumAwayGoals) / totalValid).toFixed(2)}`);
    console.log("-----------------------------------------");
    console.log(`Home Wins: ${homeWins} (${((homeWins / totalValid) * 100).toFixed(1)}%)`);
    console.log(`Away Wins: ${awayWins} (${((awayWins / totalValid) * 100).toFixed(1)}%)`);
    console.log(`Draws:     ${draws} (${((draws / totalValid) * 100).toFixed(1)}%)`);
    console.log("-----------------------------------------");
    console.log(`GG (BTTS): ${gg} (${((gg / totalValid) * 100).toFixed(1)}%)`);
    console.log(`Over 1.5:  ${over1_5} (${((over1_5 / totalValid) * 100).toFixed(1)}%)`);
    console.log(`Over 2.5:  ${over2_5} (${((over2_5 / totalValid) * 100).toFixed(1)}%)`);
    
    console.log("-----------------------------------------");
    console.log("TOP SCORE PATTERNS:");
    const sortedScores = Object.entries(topScores).sort((a,b) => b[1] - a[1]).slice(0, 5);
    for (const [score, count] of sortedScores) {
        console.log(`Score ${score}: ${count} matches (${((count/totalValid)*100).toFixed(1)}%)`);
    }
    
    process.exit(0);
}

analyzeEngland().catch(err => {
    console.error(err);
    process.exit(1);
});
