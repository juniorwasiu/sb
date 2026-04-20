const { captureLeagueResults } = require('./screenshot_scraper');

async function testCapture() {
    console.log("Starting full trail test for England League...");
    const result = await captureLeagueResults('England League', null, {
        onPageCaptured: async (screenshotPath, matchRows, pageNum) => {
            console.log(`[TEST HOOK] Page ${pageNum} captured. Got ${matchRows ? matchRows.length : 0} matches.`);
            if (matchRows && matchRows.length > 0) {
                console.log(`[TEST HOOK] Simulated upload to Firebase for page ${pageNum}...`);
            }
        }
    });

    console.log("Final captureLeagueResults Output:");
    console.log(JSON.stringify(result, null, 2));
}

testCapture();
