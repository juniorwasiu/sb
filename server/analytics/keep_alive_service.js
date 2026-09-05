/**
 * keep_alive_service.js
 * 
 * 24/7 Keep-Alive & Self-Ping Service for Render / Cloud Web Services:
 * 1. Solves the Render Free Tier 15-minute hibernation / sleep issue.
 * 2. Periodically sends an outbound HTTP/HTTPS request to the server's public endpoint.
 * 3. Keeps the server awake 24/7 so background scrapers, match associations,
 *    prediction engines, and evaluation loops continue running uninterrupted even when offline.
 */

const https = require('https');
const http = require('http');

let keepAliveInterval = null;
let isKeepAliveRunning = false;

const DEFAULT_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes (well under Render's 15-min sleep threshold)
const pingHistory = [];
const MAX_PING_HISTORY = 20;

let stats = {
    enabled: true,
    targetUrl: '',
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    lastPingTime: null,
    lastPingDurationMs: 0,
    lastStatus: 'INITIALIZING',
    lastError: null
};

/**
 * Resolves the public server URL from environment variables or sensible default.
 */
function resolveServerUrl() {
    const candidate =
        process.env.RENDER_EXTERNAL_URL ||
        process.env.SERVER_URL ||
        process.env.APP_URL ||
        process.env.BASE_URL ||
        'https://sb-te5s.onrender.com';

    let cleanUrl = candidate.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = `https://${cleanUrl}`;
    }
    return cleanUrl;
}

/**
 * Execute a single keep-alive ping.
 */
function pingSelfNow(targetEndpoint = '/api/health') {
    return new Promise((resolve) => {
        const baseUrl = resolveServerUrl();
        const fullUrl = `${baseUrl}${targetEndpoint}`;
        stats.targetUrl = fullUrl;

        const startMs = Date.now();
        const urlObj = new URL(fullUrl);
        const client = urlObj.protocol === 'https:' ? https : http;

        console.log(`[Keep-Alive] 📡 Sending 24/7 self-ping to: ${fullUrl}...`);

        const req = client.get(fullUrl, {
            headers: {
                'User-Agent': 'KeepAlive-Service/1.0 (24/7 Render Keep-Alive)'
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                const durationMs = Date.now() - startMs;
                const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

                stats.totalPings++;
                if (isSuccess) stats.successfulPings++;
                else stats.failedPings++;

                stats.lastPingTime = new Date().toISOString();
                stats.lastPingDurationMs = durationMs;
                stats.lastStatus = isSuccess ? `SUCCESS (${res.statusCode})` : `HTTP ${res.statusCode}`;
                stats.lastError = null;

                const entry = {
                    timestamp: stats.lastPingTime,
                    url: fullUrl,
                    statusCode: res.statusCode,
                    durationMs,
                    success: isSuccess
                };
                recordPing(entry);

                console.log(`[Keep-Alive] ✅ Self-ping successful! [${res.statusCode}] in ${durationMs}ms — Server remains awake 24/7.`);
                resolve({ success: true, statusCode: res.statusCode, durationMs });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            handlePingFailure(new Error('Request timed out after 15s'), Date.now() - startMs, fullUrl);
            resolve({ success: false, error: 'Timeout' });
        });

        req.on('error', (err) => {
            handlePingFailure(err, Date.now() - startMs, fullUrl);
            resolve({ success: false, error: err.message });
        });
    });
}

function handlePingFailure(err, durationMs, fullUrl) {
    stats.totalPings++;
    stats.failedPings++;
    stats.lastPingTime = new Date().toISOString();
    stats.lastPingDurationMs = durationMs;
    stats.lastStatus = 'FAILED';
    stats.lastError = err.message;

    recordPing({
        timestamp: stats.lastPingTime,
        url: fullUrl,
        statusCode: null,
        durationMs,
        success: false,
        error: err.message
    });

    console.warn(`[Keep-Alive] ⚠️ Self-ping note (${err.message}). Will retry on next scheduled interval.`);
}

function recordPing(entry) {
    pingHistory.unshift(entry);
    if (pingHistory.length > MAX_PING_HISTORY) {
        pingHistory.pop();
    }
}

/**
 * Starts the automated recurring keep-alive pinger.
 */
function startKeepAliveService(intervalMs = DEFAULT_INTERVAL_MS) {
    if (isKeepAliveRunning) {
        console.log('[Keep-Alive] Keep-alive service is already running.');
        return;
    }

    // Allow disabling if explicitly set in environment
    if (process.env.DISABLE_KEEP_ALIVE === 'true') {
        console.log('[Keep-Alive] ⏸️ DISABLE_KEEP_ALIVE=true. Self-ping service disabled.');
        stats.enabled = false;
        return;
    }

    isKeepAliveRunning = true;
    stats.enabled = true;
    stats.targetUrl = `${resolveServerUrl()}/api/health`;

    const intervalMinutes = (intervalMs / 1000 / 60).toFixed(1);
    console.log(`[Keep-Alive] 🚀 24/7 Keep-Alive Service started. Target: ${stats.targetUrl} (every ${intervalMinutes} mins)`);

    // First ping after 30 seconds (after server boot settles)
    setTimeout(() => {
        pingSelfNow();
    }, 30000);

    // Recurring ping loop
    keepAliveInterval = setInterval(() => {
        pingSelfNow();
    }, intervalMs);
}

function stopKeepAliveService() {
    isKeepAliveRunning = false;
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    console.log('[Keep-Alive] 🛑 Keep-alive service stopped.');
}

function getKeepAliveStatus() {
    return {
        ...stats,
        isRunning: isKeepAliveRunning,
        history: pingHistory
    };
}

module.exports = {
    startKeepAliveService,
    stopKeepAliveService,
    pingSelfNow,
    getKeepAliveStatus,
    resolveServerUrl
};
