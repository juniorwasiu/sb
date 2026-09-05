/**
 * observe_memory_and_lifecycle.js
 * 
 * Runs the live server services (scraper + pipeline + lifecycle engine + prediction generator)
 * and continuously records memory (RSS, Heap, External, Buffers) over time to observe
 * where memory accumulates, if any operation leaks or hangs, or where crashes originate.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { startAutonomousPipeline, runSinglePipelineCycle, getMemoryTelemetry } = require('../analytics/task_pipeline_manager');
const { autoResolvePendingPredictions } = require('../database/supabase');
const { pingSelfNow, getKeepAliveStatus } = require('../analytics/keep_alive_service');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🔬 STARTING MEMORY & LIFECYCLE OBSERVATION HARNESS');
console.log('═══════════════════════════════════════════════════════════════════');

function logMem(stage) {
    const mem = process.memoryUsage();
    const rssMB = (mem.rss / 1024 / 1024).toFixed(2);
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);
    const externalMB = (mem.external / 1024 / 1024).toFixed(2);
    const arrayBuffersMB = (mem.arrayBuffers ? mem.arrayBuffers / 1024 / 1024 : 0).toFixed(2);
    
    console.log(`[OBSERVE] [${new Date().toISOString().slice(11, 19)}] [${stage}] RSS: ${rssMB}MB | HeapUsed: ${heapUsedMB}MB / ${heapTotalMB}MB | Ext: ${externalMB}MB | ArrayBuf: ${arrayBuffersMB}MB`);
    return { rssMB: parseFloat(rssMB), heapUsedMB: parseFloat(heapUsedMB) };
}

async function runObservation() {
    logMem('Initial Baseline');

    console.log('\n--- PHASE 1: Running 3 Sequential Pipeline Cycles ---');
    for (let i = 1; i <= 3; i++) {
        console.log(`\n▶️ Starting Pipeline Cycle #${i}...`);
        const start = Date.now();
        logMem(`Cycle #${i} - START`);
        
        try {
            const stats = await runSinglePipelineCycle(autoResolvePendingPredictions);
            const duration = Date.now() - start;
            console.log(`✅ Cycle #${i} completed in ${duration}ms:`, JSON.stringify(stats));
        } catch (err) {
            console.error(`❌ Cycle #${i} failed:`, err);
        }
        
        logMem(`Cycle #${i} - END`);
        
        // Cooldown between cycles
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n--- PHASE 2: Simulating 5 Live Scraper Ingestion Batches ---');
    try {
        const { detectLeague } = require('../constants');
        const { saveUpcomingMatchesToDb } = require('../database/supabase');
        
        for (let b = 1; b <= 5; b++) {
            const mockMatches = [
                { league: 'England League', home: 'ARS', away: 'CHE', time: '14:30', score: '1(1.85) X(3.20) 2(4.10)', odds: { home_win: 1.85, draw: 3.2, away_win: 4.1 } },
                { league: 'Spain League', home: 'RMA', away: 'BAR', time: '15:00', score: '1(2.10) X(3.40) 2(3.20)', odds: { home_win: 2.1, draw: 3.4, away_win: 3.2 } },
                { league: 'Italy League', home: 'JUV', away: 'INT', time: '16:00', score: '1(2.40) X(3.00) 2(2.90)', odds: { home_win: 2.4, draw: 3.0, away_win: 2.9 } },
                { league: 'Germany League', home: 'BAY', away: 'BVB', time: '17:30', score: '1(1.60) X(4.00) 2(5.00)', odds: { home_win: 1.6, draw: 4.0, away_win: 5.0 } },
                { league: 'France League', home: 'PSG', away: 'MAR', time: '20:00', score: '1(1.50) X(4.20) 2(6.00)', odds: { home_win: 1.5, draw: 4.2, away_win: 6.0 } }
            ];
            
            const today = new Date().toISOString().slice(0, 10);
            const upcomingBatch = mockMatches.map(m => ({
                game_id: `test_mock_${b}_${m.home}_${m.away}`,
                league: detectLeague(m.league, m.home, m.away),
                match_date: today,
                match_time: m.time,
                home_team: m.home,
                away_team: m.away,
                odds: m.odds,
                raw_odds_string: m.score,
                status: 'UPCOMING'
            }));
            
            await saveUpcomingMatchesToDb(upcomingBatch).catch(e => console.warn('Save note:', e.message));
            logMem(`Scraper Ingestion Batch #${b}`);
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (e) {
        console.error('Phase 2 error:', e);
    }

    console.log('\n--- PHASE 3: Testing Keep-Alive Ping Execution ---');
    try {
        logMem('Before Keep-Alive Ping');
        await pingSelfNow();
        logMem('After Keep-Alive Ping');
    } catch (e) {
        console.error('Keep-Alive error:', e);
    }

    console.log('\n--- PHASE 4: Final Memory Audit & Garbage Collection Check ---');
    if (global.gc) {
        global.gc();
        logMem('After Manual GC');
    } else {
        logMem('Final State (No GC flag)');
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('🔬 OBSERVATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════════');
    process.exit(0);
}

runObservation().catch(err => {
    console.error('Fatal observation harness error:', err);
    process.exit(1);
});
