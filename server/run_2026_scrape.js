const { nativeCaptureLeagueResults } = require('./native_scraper');
const { saveMatchesToDb } = require('./supabase');

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
                    console.log(`[Runner] Page ${pageNum} captured ${matchRows.length} matches. Deduplicating and writing to Supabase...`);
                    const stats = await saveMatchesToDb(matchRows);
                    console.log(`[Runner] Page ${pageNum} saved: +${stats.added} new matches, skipped ${stats.dupes} duplicates. Total database: ${stats.total}.`);
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
