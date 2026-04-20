require('dotenv').config();
const { getStrategy, getLeagueIntelligence } = require('./ai_memory');

async function checkFirebase() {
    console.log("=== AI Strategy ===");
    const strategy = await getStrategy();
    console.log(JSON.stringify(strategy, null, 2));

    console.log("\n=== League Intelligence (England - Virtual) ===");
    const engIntel = await getLeagueIntelligence('England - Virtual');
    console.log(JSON.stringify(engIntel, null, 2));

    process.exit(0);
}

checkFirebase();
