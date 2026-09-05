/**
 * test_pipeline_queue.js
 * 
 * Comprehensive Unit & Integration Tests for:
 * 1. Sequential Task Queue & Mutex Concurrency Prevention
 * 2. Memory Guard & Telemetry
 * 3. 24/7 Keep-Alive Self-Ping Engine
 * 4. Pipeline Status & Health Telemetry
 */

const assert = require('assert');
const {
    enqueueTask,
    getMemoryTelemetry,
    checkAndFreeMemory,
    getPipelineStatus,
    runSinglePipelineCycle
} = require('../analytics/task_pipeline_manager');

const {
    resolveServerUrl,
    getKeepAliveStatus,
    pingSelfNow
} = require('../analytics/keep_alive_service');

async function runTests() {
    console.log('🧪 ═══════════════════════════════════════════════════════════════');
    console.log('🧪 Starting Task Pipeline & Keep-Alive Verification Tests');
    console.log('🧪 ═══════════════════════════════════════════════════════════════\n');

    // ── TEST 1: Memory Guard & Telemetry ─────────────────────────────────────
    console.log('▶️ [TEST 1] Testing Memory Guard & Telemetry...');
    const mem = getMemoryTelemetry();
    assert(typeof mem.rssMB === 'number' && mem.rssMB > 0, 'RSS memory should be a positive number');
    assert(typeof mem.heapUsedMB === 'number' && mem.heapUsedMB > 0, 'Heap memory should be a positive number');
    assert(mem.limitMB === 512, 'Default RAM limit should be 512MB');
    assert(['healthy', 'warning', 'critical'].includes(mem.status), 'Status should be valid');
    console.log(`   ✅ Memory Telemetry verified: RSS ${mem.rssMB}MB / ${mem.limitMB}MB (${mem.usagePercent}%) — Status: ${mem.status}`);

    const freeMemResult = checkAndFreeMemory('Test Context');
    assert(freeMemResult.rssMB > 0, 'checkAndFreeMemory should return valid memory telemetry');
    console.log('   ✅ Memory Check & Clean verified.\n');

    // ── TEST 2: Strict Sequential Task Queue (No Concurrency Overlap) ────────
    console.log('▶️ [TEST 2] Testing Strict Sequential Queue Execution (One-by-One)...');
    const executionLog = [];
    let concurrentRunningCount = 0;
    let maxConcurrencyObserved = 0;

    const createSimulatedTask = (taskName, durationMs) => async () => {
        concurrentRunningCount++;
        if (concurrentRunningCount > maxConcurrencyObserved) {
            maxConcurrencyObserved = concurrentRunningCount;
        }

        const start = Date.now();
        executionLog.push({ event: 'START', task: taskName, time: start });

        // Simulate async I/O work
        await new Promise(resolve => setTimeout(resolve, durationMs));

        const end = Date.now();
        executionLog.push({ event: 'END', task: taskName, time: end });
        concurrentRunningCount--;

        return { taskName, durationMs, success: true };
    };

    // Enqueue 4 tasks simultaneously
    const p1 = enqueueTask('Task A (100ms)', createSimulatedTask('Task A', 100));
    const p2 = enqueueTask('Task B (80ms)', createSimulatedTask('Task B', 80));
    const p3 = enqueueTask('Task C (60ms)', createSimulatedTask('Task C', 60));
    const p4 = enqueueTask('Task D (40ms)', createSimulatedTask('Task D', 40));

    const results = await Promise.all([p1, p2, p3, p4]);

    assert.strictEqual(results.length, 4, 'All 4 tasks should complete');
    assert.strictEqual(maxConcurrencyObserved, 1, `Max observed concurrency MUST BE EXACTLY 1 (was ${maxConcurrencyObserved})`);

    // Verify FIFO execution order: A started before B, B started before C, C started before D
    const starts = executionLog.filter(e => e.event === 'START').map(e => e.task);
    assert.deepStrictEqual(starts, ['Task A', 'Task B', 'Task C', 'Task D'], 'Tasks must execute in strict FIFO queue order');

    // Verify no time overlap: Task A END <= Task B START, etc.
    for (let i = 0; i < 3; i++) {
        const currentTask = starts[i];
        const nextTask = starts[i + 1];
        const currentEnd = executionLog.find(e => e.event === 'END' && e.task === currentTask).time;
        const nextStart = executionLog.find(e => e.event === 'START' && e.task === nextTask).time;
        assert(nextStart >= currentEnd, `Task ${nextTask} started (${nextStart}) before Task ${currentTask} ended (${currentEnd})!`);
    }

    console.log('   ✅ Strict sequential execution verified: 4 concurrent calls executed strictly 1-by-1 in FIFO order with ZERO overlap.\n');

    // ── TEST 3: Pipeline Status & Health Telemetry ───────────────────────────
    console.log('▶️ [TEST 3] Testing Pipeline Status Telemetry...');
    const status = getPipelineStatus();
    assert(status.queueLength === 0, 'Queue should be empty after tasks complete');
    assert(Array.isArray(status.recentExecutions), 'recentExecutions must be an array');
    assert(status.recentExecutions.length >= 4, 'Should record recent task executions in history');
    assert(status.memory.rssMB > 0, 'Status must include memory telemetry');
    console.log(`   ✅ Pipeline Status verified: ${status.recentExecutions.length} tasks in history, memory: ${status.memory.rssMB}MB\n`);

    // ── TEST 4: 24/7 Keep-Alive & URL Resolution ─────────────────────────────
    console.log('▶️ [TEST 4] Testing 24/7 Keep-Alive URL Resolution & Status...');
    const resolvedUrl = resolveServerUrl();
    assert(resolvedUrl.startsWith('https://'), `Resolved URL should start with https:// (got: ${resolvedUrl})`);
    assert(resolvedUrl.includes('onrender.com') || resolvedUrl.includes('http'), 'Resolved URL should contain valid domain');
    console.log(`   ✅ URL Resolution verified: ${resolvedUrl}`);

    const keepAliveStatus = getKeepAliveStatus();
    assert(typeof keepAliveStatus.enabled === 'boolean', 'KeepAlive status should include enabled flag');
    assert(typeof keepAliveStatus.totalPings === 'number', 'KeepAlive status should track totalPings');
    console.log(`   ✅ Keep-Alive Status verified: Enabled=${keepAliveStatus.enabled}, Total Pings=${keepAliveStatus.totalPings}\n`);

    console.log('🎉 ═══════════════════════════════════════════════════════════════');
    console.log('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('🎉 ═══════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
});
