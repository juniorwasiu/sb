const { getAllDailyTips } = require('./server/ai_memory.js');
(async () => {
    try {
        const tips = await getAllDailyTips();
        console.log(`Found ${tips.length} tips.`);
        for (const t of tips.slice(0, 3)) {
            console.log(`- ${t.league} on ${t.date} | Upcoming matches count:`, t.tipData?.upcoming_matches?.length || 0);
        }
    } catch(err) {
        console.log('Error', err);
    }
    process.exit();
})();
