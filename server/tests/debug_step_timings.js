require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { associateMatches } = require('../analytics/match_lifecycle_engine');
const { autoRunEnginePredictions, autoEvaluateEnginePredictions } = require('../analytics/engine_prediction_pipeline');
const { autoResolvePendingPredictions } = require('../database/supabase');

function logMem(label) {
    const mem = process.memoryUsage();
    console.log(`[TIME-MEM] [${label}] RSS: ${(mem.rss/1024/1024).toFixed(2)}MB | Heap: ${(mem.heapUsed/1024/1024).toFixed(2)}MB`);
}

async function debugSteps() {
    console.log('--- Step 1: Match Association ---');
    logMem('Start Step 1');
    const t1 = Date.now();
    try {
        const res1 = await associateMatches();
        console.log(`Step 1 Result in ${Date.now() - t1}ms:`, res1);
    } catch (e) {
        console.error('Step 1 Error:', e.message);
    }
    logMem('End Step 1');

    console.log('\n--- Step 2: Prediction Generation ---');
    logMem('Start Step 2');
    const t2 = Date.now();
    try {
        const res2 = await autoRunEnginePredictions();
        console.log(`Step 2 Result in ${Date.now() - t2}ms:`, res2);
    } catch (e) {
        console.error('Step 2 Error:', e.message);
    }
    logMem('End Step 2');

    console.log('\n--- Step 3: Prediction Evaluation ---');
    logMem('Start Step 3');
    const t3 = Date.now();
    try {
        const res3 = await autoEvaluateEnginePredictions();
        console.log(`Step 3 Result in ${Date.now() - t3}ms:`, res3);
    } catch (e) {
        console.error('Step 3 Error:', e.message);
    }
    logMem('End Step 3');

    console.log('\n--- Step 4: Auto-Resolve Pending ---');
    logMem('Start Step 4');
    const t4 = Date.now();
    try {
        const res4 = await autoResolvePendingPredictions();
        console.log(`Step 4 Result in ${Date.now() - t4}ms:`, res4);
    } catch (e) {
        console.error('Step 4 Error:', e.message);
    }
    logMem('End Step 4');

    console.log('\n--- ALL STEPS COMPLETED ---');
    process.exit(0);
}

debugSteps().catch(e => {
    console.error('Fatal debug error:', e);
    process.exit(1);
});
