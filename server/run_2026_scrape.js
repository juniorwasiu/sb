const { nativeCaptureLeagueResults } = require('./native_scraper');
const fs = require('fs');
const path = require('path');

const LOCAL_DB_PATH = path.join(__dirname, 'local_results.json');

function saveToLocalJson(newMatches) {
    console.log(`[Local DB Script] Attempting to save ${newMatches.length} matches...`);
    let current = [];
    if (fs.existsSync(LOCAL_DB_PATH)) {
        try {
            current = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
        } catch (e) {
            console.error('[Local DB Script] Error reading file, resetting:', e.message);
            current = [];
        }
    }
    
    let added = 0;
    let dupes = 0;
    
    newMatches.forEach(match => {
        // Construct canonical id
        const dateSafe = (match.date || '').replace(/\//g, '-');
        const leagueSafe = (match.league || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const gameId = match.gameId || `fallback_${(match.time || '00:00').replace(':', '')}_${(match.homeTeam || match.home || '').replace(/\s+/g, '')}`;
        const matchId = `${dateSafe}_${gameId}_${leagueSafe}`;
        
        const isDupe = current.some(m => {
            const mDateSafe = (m.date || '').replace(/\//g, '-');
            const mLeagueSafe = (m.league || '').replace(/[^a-zA-Z0-9_-]/g, '_');
            const mGameId = m.gameId || `fallback_${(m.time || '00:00').replace(':', '')}_${(m.homeTeam || m.home || '').replace(/\s+/g, '')}`;
            const mMatchId = `${mDateSafe}_${mGameId}_${mLeagueSafe}`;
            return mMatchId === matchId || (m.gameId === match.gameId && m.league === match.league && m.date === match.date);
        });
        
        if (!isDupe) {
            current.push({
                ...match,
                _id: matchId,
                uploadedAt: new Date().toISOString()
            });
            added++;
        } else {
            dupes++;
        }
    });
    
    if (added > 0) {
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(current, null, 2), 'utf8');
        console.log(`[Local DB Script] Saved ${added} new matches. Total records: ${current.length}`);
    } else {
        console.log(`[Local DB Script] No new matches saved. All ${dupes} were duplicates.`);
    }
    
    return { added, dupes, total: current.length };
}

(async () => {
    const league = 'England League';
    const targetDate = '2026-06-01';
    
    console.log(`[Runner] Starting extraction target for: ${league} on ${targetDate}`);
    
    try {
        const result = await nativeCaptureLeagueResults(league, targetDate, {
            onPageCaptured: async (err, matchRows, pageNum) => {
                if (err) {
                    console.error(`[Runner] Page ${pageNum} error:`, err);
                    return;
                }
                if (matchRows && matchRows.length > 0) {
                    console.log(`[Runner] Page ${pageNum} captured ${matchRows.length} matches. Appending...`);
                    saveToLocalJson(matchRows);
                } else {
                    console.log(`[Runner] Page ${pageNum} returned no matches.`);
                }
            }
        });
        
        console.log('[Runner] Scrape Result:', result);
        
        if (result.success) {
            console.log('🎉 Scrape successfully completed!');
        } else {
            console.error('❌ Scrape failed:', result.error);
        }
    } catch (err) {
        console.error('❌ Runner crashed:', err);
    }
})();
