const path = require('path');
const fs = require('fs');

async function testExtraction() {
    const { extractMatchDataFromImage } = require('./claude_extractor');
    const { uploadMatchesToFirebase } = require('./firebase_uploader');

    const testFile = 'screenshot_1776084467718_p3.png';
    const filePath = path.join(__dirname, 'testdownloadpage', testFile);
    console.log(`[Test] Extracting ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.error('Test file not found.');
        process.exit(1);
    }
    
    try {
        const { matches: matchData } = await extractMatchDataFromImage(filePath, 'England - Virtual');
        console.log(`[Test] Raw extracted matchData length: ${matchData ? matchData.length : 0}`);
        
        fs.writeFileSync(path.join(__dirname, 'test_claude_output.json'), JSON.stringify(matchData, null, 2));
        console.log('[Test] Written to test_claude_output.json');
        
        if (matchData && matchData.length > 0) {
            console.log('[Test] Attempting dry-run of upload logic...');
            let skipped = 0;
            let uploaded = 0;
            for (const match of matchData) {
                if (!match.league) {
                    skipped++;
                    continue;
                }
                if (!match.gameId) {
                    const home = (match.homeTeam || match.home || 'unknown').replace(/\s+/g, '');
                    const time = (match.time || '00:00').replace(':', '');
                    match.gameId = `fallback_${time}_${home}`;
                }
                uploaded++;
            }
            console.log(`[Test] Dry run result: ${uploaded} valid, ${skipped} skipped.`);
        }
    } catch (e) {
        console.error('[Test] Error:', e);
    }
    process.exit(0);
}

testExtraction();
