/**
 * task_pipeline_manager.js
 * 
 * Master Sequential Task Orchestrator & Memory Guard:
 * 1. Ensures background tasks and heavy API endpoints run strictly ONE BY ONE in sequence.
 * 2. Prevents concurrency spikes, race conditions, and memory overload on 512MB RAM cloud hosts (Render/Railway).
 * 3. Enforces an autonomous master pipeline loop:
 *    ASSOCIATE -> PREDICT -> EVALUATE -> AUTO_RESOLVE -> MEMORY_CLEANUP & COOLDOWN
 * 4. Provides `enqueueTask` for API endpoints to safely queue user-triggered tasks without crashing the server.
 */

const { associateMatches } = require('./match_lifecycle_engine');
const {
    autoRunEnginePredictions,
    autoEvaluateEnginePredictions
} = require('./engine_prediction_pipeline');

// ── State & Telemetry ────────────────────────────────────────────────────────
let isPipelineActive = false;
let currentTaskName = 'IDLE';
let currentTaskStartTime = null;
let lastCycleStats = {
    completedAt: null,
    durationMs: 0,
    associated: 0,
    predicted: 0,
    evaluated: 0,
    resolved: 0,
    rssMB: 0,
    memoryStatus: 'healthy'
};

const taskExecutionHistory = [];
const MAX_HISTORY = 30;

// Internal FIFO Task Queue for on-demand tasks
const taskQueue = [];
let isQueueProcessing = false;

// ── Memory Guard ─────────────────────────────────────────────────────────────
const RAM_LIMIT_MB = parseInt(process.env.RAM_LIMIT_MB, 10) || 512;
const MEMORY_WARNING_THRESHOLD_PERCENT = 70; // 70% of 512MB = ~358MB

function getMemoryTelemetry() {
    const mem = process.memoryUsage();
    const rssMB = parseFloat((mem.rss / 1024 / 1024).toFixed(2));
    const heapUsedMB = parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2));
    const heapTotalMB = parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2));
    const usagePercent = parseFloat(((rssMB / RAM_LIMIT_MB) * 100).toFixed(1));

    let status = 'healthy';
    if (usagePercent >= 85) status = 'critical';
    else if (usagePercent >= MEMORY_WARNING_THRESHOLD_PERCENT) status = 'warning';

    return {
        rssMB,
        heapUsedMB,
        heapTotalMB,
        limitMB: RAM_LIMIT_MB,
        usagePercent,
        status
    };
}

function checkAndFreeMemory(contextLabel = '') {
    const mem = getMemoryTelemetry();
    if (mem.usagePercent >= MEMORY_WARNING_THRESHOLD_PERCENT) {
        console.warn(`[Memory Guard] ⚠️ High RAM usage detected at [${contextLabel}]: ${mem.rssMB}MB / ${mem.limitMB}MB (${mem.usagePercent}%). Triggering garbage collection & cooldown...`);
        if (typeof global.gc === 'function') {
            try {
                global.gc();
                const afterMem = getMemoryTelemetry();
                console.log(`[Memory Guard] 🧹 GC completed. RSS dropped from ${mem.rssMB}MB to ${afterMem.rssMB}MB.`);
            } catch (gcErr) {
                console.warn('[Memory Guard] GC error:', gcErr.message);
            }
        }
    }
    return mem;
}

// ── Async Mutex / Queue Execution ────────────────────────────────────────────
/**
 * Enqueue an asynchronous operation to run strictly one-by-one.
 * Returns a promise that resolves when the task finishes.
 */
function enqueueTask(taskName, taskFn) {
    return new Promise((resolve, reject) => {
        taskQueue.push({
            name: taskName,
            fn: taskFn,
            resolve,
            reject,
            enqueuedAt: Date.now()
        });
        processQueue();
    });
}

async function processQueue() {
    if (isQueueProcessing) return;
    if (taskQueue.length === 0) return;

    isQueueProcessing = true;

    while (taskQueue.length > 0) {
        const item = taskQueue.shift();
        const startMs = Date.now();
        currentTaskName = item.name;
        currentTaskStartTime = new Date().toISOString();

        console.log(`[Task Pipeline] ▶️ [START] Executing queued task: "${item.name}" (Queue wait: ${startMs - item.enqueuedAt}ms)`);
        checkAndFreeMemory(`Before Task: ${item.name}`);

        try {
            const result = await item.fn();
            const durationMs = Date.now() - startMs;
            console.log(`[Task Pipeline] ✅ [DONE] Completed task: "${item.name}" in ${durationMs}ms`);

            recordTaskHistory({
                name: item.name,
                durationMs,
                status: 'success',
                completedAt: new Date().toISOString()
            });

            item.resolve(result);
        } catch (err) {
            const durationMs = Date.now() - startMs;
            console.error(`[Task Pipeline] ❌ [ERROR] Task "${item.name}" failed after ${durationMs}ms:`, err.message);

            recordTaskHistory({
                name: item.name,
                durationMs,
                status: 'error',
                error: err.message,
                completedAt: new Date().toISOString()
            });

            item.reject(err);
        } finally {
            checkAndFreeMemory(`After Task: ${item.name}`);
            currentTaskName = 'IDLE';
            currentTaskStartTime = null;
            // Short 50ms breather between queued tasks to let event loop handle I/O
            await new Promise(r => setTimeout(r, 50));
        }
    }

    isQueueProcessing = false;
}

function recordTaskHistory(entry) {
    taskExecutionHistory.unshift(entry);
    if (taskExecutionHistory.length > MAX_HISTORY) {
        taskExecutionHistory.pop();
    }
}

// ── Autonomous Master Pipeline Cycle ─────────────────────────────────────────
/**
 * Executes a single sequential cycle of all autonomous tasks in strict order:
 * 1. Match Association (upcoming -> played)
 * 2. Multi-Engine Prediction Generation (new upcoming matches)
 * 3. Multi-Engine Prediction Evaluation (pending predictions vs played)
 * 4. Prediction Outcomes Auto-Resolution (legacy pending predictions)
 * 5. Memory Check & Cleanup
 */
async function runSinglePipelineCycle(autoResolveFn = null) {
    const cycleStartMs = Date.now();
    console.log('[Pipeline Master] 🔄 ──────── Starting Autonomous Pipeline Cycle ────────');

    let associatedCount = 0;
    let predictedCount = 0;
    let evaluatedCount = 0;
    let resolvedCount = 0;

    // STEP 1: Match Lifecycle Association
    try {
        await enqueueTask('Match Association (Lifecycle Engine)', async () => {
            const res = await associateMatches();
            associatedCount = res?.matched || 0;
            return res;
        });
    } catch (e) {
        console.warn('[Pipeline Master] Step 1 Note (Association):', e.message);
    }

    // STEP 2: Multi-Engine Prediction Generation
    try {
        await enqueueTask('Engine Prediction Generator', async () => {
            const res = await autoRunEnginePredictions();
            predictedCount = res?.generated || 0;
            return res;
        });
    } catch (e) {
        console.warn('[Pipeline Master] Step 2 Note (Predictions):', e.message);
    }

    // STEP 3: Multi-Engine Prediction Evaluation
    try {
        await enqueueTask('Engine Prediction Evaluator', async () => {
            const res = await autoEvaluateEnginePredictions();
            evaluatedCount = res?.evaluated || 0;
            return res;
        });
    } catch (e) {
        console.warn('[Pipeline Master] Step 3 Note (Evaluation):', e.message);
    }

    // STEP 4: Auto-Resolution of legacy pending predictions
    if (typeof autoResolveFn === 'function') {
        try {
            await enqueueTask('Auto-Resolve Pending Predictions', async () => {
                const res = await autoResolveFn();
                resolvedCount = res?.resolved || 0;
                return res;
            });
        } catch (e) {
            console.warn('[Pipeline Master] Step 4 Note (Auto-Resolve):', e.message);
        }
    }

    // STEP 5: Memory Guard & Telemetry Record
    const mem = checkAndFreeMemory('Cycle Completion');
    const totalDurationMs = Date.now() - cycleStartMs;

    lastCycleStats = {
        completedAt: new Date().toISOString(),
        durationMs: totalDurationMs,
        associated: associatedCount,
        predicted: predictedCount,
        evaluated: evaluatedCount,
        resolved: resolvedCount,
        rssMB: mem.rssMB,
        memoryStatus: mem.status
    };

    console.log(`[Pipeline Master] 🏁 Cycle Finished in ${totalDurationMs}ms — Associated: ${associatedCount} | Predicted: ${predictedCount} | Evaluated: ${evaluatedCount} | Resolved: ${resolvedCount} | RAM: ${mem.rssMB}MB (${mem.usagePercent}%)`);
    return lastCycleStats;
}

/**
 * Starts the continuous background pipeline loop.
 * Runs indefinitely with a configurable cooldown between cycles.
 */
let pipelineLoopTimeout = null;
const CYCLE_COOLDOWN_MS = parseInt(process.env.PIPELINE_COOLDOWN_MS, 10) || (20 * 1000); // 20s cooldown

function startAutonomousPipeline(autoResolveFn = null) {
    if (isPipelineActive) {
        console.log('[Pipeline Master] Pipeline is already running.');
        return;
    }

    isPipelineActive = true;
    console.log(`[Pipeline Master] 🚀 Autonomous sequential pipeline initialized. Cycle interval cooldown: ${CYCLE_COOLDOWN_MS / 1000}s`);

    async function loop() {
        if (!isPipelineActive) return;

        try {
            await runSinglePipelineCycle(autoResolveFn);
        } catch (cycleErr) {
            console.error('[Pipeline Master] ❌ Unexpected error in pipeline loop:', cycleErr.message);
        }

        if (isPipelineActive) {
            pipelineLoopTimeout = setTimeout(loop, CYCLE_COOLDOWN_MS);
        }
    }

    // Initial startup delay to let DB connections settle
    setTimeout(loop, 6000);
}

function stopAutonomousPipeline() {
    isPipelineActive = false;
    if (pipelineLoopTimeout) {
        clearTimeout(pipelineLoopTimeout);
        pipelineLoopTimeout = null;
    }
    console.log('[Pipeline Master] 🛑 Autonomous pipeline stopped.');
}

// ── Status Telemetry for APIs ────────────────────────────────────────────────
function getPipelineStatus() {
    const memory = getMemoryTelemetry();
    return {
        pipelineActive: isPipelineActive,
        currentTask: currentTaskName,
        currentTaskStartTime,
        queueLength: taskQueue.length,
        queuedTasks: taskQueue.map(q => q.name),
        lastCycle: lastCycleStats,
        memory,
        recentExecutions: taskExecutionHistory.slice(0, 10)
    };
}

module.exports = {
    enqueueTask,
    runSinglePipelineCycle,
    startAutonomousPipeline,
    stopAutonomousPipeline,
    getPipelineStatus,
    getMemoryTelemetry,
    checkAndFreeMemory
};
