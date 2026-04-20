const { captureLeagueResults } = require('./screenshot_scraper');

(async () => {
    console.log("=== Testing Core screenshot_scraper Integration ===");
    try {
        const result = await captureLeagueResults('England League');
        console.log("\n[TEST RESULT] Success:", result.success);
        console.log("[TEST RESULT] League:", result.league);
        console.log("[TEST RESULT] Final Image Path:", result.screenshotPath);
        console.log("[TEST RESULT] Parsed Match Records Count:", result.matchData ? result.matchData.length : 0);
        if (result.matchData && result.matchData.length > 0) {
            console.log("[TEST RESULT] Sample Match 1:", result.matchData[0]);
        }
        process.exit(0);
    } catch (e) {
        console.error("[TEST FATAL ERROR]", e);
        process.exit(1);
    }
})();
