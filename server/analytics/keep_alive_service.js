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

// 4.5 minutes interval — well under Render's 15-minute free-tier idle hibernation limit
const DEFAULT_INTERVAL_MS = 4.5 * 60 * 1000;
const pingHistory = [];
const MAX_PING_HISTORY = 20;

let discoveredServerUrl = '';

let stats = {
    enabled: true,
    targetUrl: '',
    localUrl: '',
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    lastPingTime: null,
    lastPingDurationMs: 0,
    lastStatus: 'INITIALIZING',
    lastError: null
};

/**
 * Dynamically register or update the public server URL based on incoming requests
 */
function updateServerUrl(url) {
    if (!url || typeof url !== 'string') return;
    let clean = url.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
    }
    if (clean && clean !== discoveredServerUrl) {
        discoveredServerUrl = clean;
        stats.targetUrl = `${clean}/api/health`;
        console.log(`[Keep-Alive] 🌐 Auto-detected public host: ${clean}`);
    }
}

/**
 * Resolves the public server URL from environment variables, auto-discovery, or default fallback.
 */
function resolveServerUrl() {
    const candidate =
        process.env.RENDER_EXTERNAL_URL ||
        process.env.SERVER_URL ||
        process.env.APP_URL ||
        process.env.BASE_URL ||
        discoveredServerUrl ||
        'https://sb-te5s.onrender.com';

    let cleanUrl = candidate.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = `https://${cleanUrl}`;
    }
    return cleanUrl;
}

/**
 * Helper to perform an HTTP/HTTPS GET request
 */
function performGet(fullUrl, timeoutMs = 15000) {
    return new Promise((resolve) => {
        const startMs = Date.now();
        try {
            const urlObj = new URL(fullUrl);
            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.get(fullUrl, {
                headers: {
                    'User-Agent': 'KeepAlive-Service/2.0 (24/7 Render Keep-Alive)'
                },
                timeout: timeoutMs
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    const durationMs = Date.now() - startMs;
                    const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
                    resolve({ success: isSuccess, statusCode: res.statusCode, durationMs });
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: 'Timeout', durationMs: Date.now() - startMs });
            });

            req.on('error', (err) => {
                resolve({ success: false, error: err.message, durationMs: Date.now() - startMs });
            });
        } catch (parseErr) {
            resolve({ success: false, error: parseErr.message, durationMs: Date.now() - startMs });
        }
    });
}

/**
 * Execute a keep-alive ping to both external public URL and local loopback.
 */
async function pingSelfNow(targetEndpoint = '/api/health') {
    const baseUrl = resolveServerUrl();
    const fullUrl = `${baseUrl}${targetEndpoint}`;
    stats.targetUrl = fullUrl;

    const port = process.env.PORT || 3001;
    const localUrl = `http://127.0.0.1:${port}${targetEndpoint}`;
    stats.localUrl = localUrl;

    console.log(`[Keep-Alive] 📡 Sending 24/7 self-ping to: ${fullUrl}...`);

    // Ping external public endpoint (keeps Render edge router and container awake)
    const extResult = await performGet(fullUrl, 15000);

    // Also ping local loopback
    performGet(localUrl, 5000).catch(() => {});

    stats.totalPings++;
    stats.lastPingTime = new Date().toISOString();
    stats.lastPingDurationMs = extResult.durationMs;

    if (extResult.success) {
        stats.successfulPings++;
        stats.lastStatus = `SUCCESS (${extResult.statusCode})`;
        stats.lastError = null;

        const entry = {
            timestamp: stats.lastPingTime,
            url: fullUrl,
            statusCode: extResult.statusCode,
            durationMs: extResult.durationMs,
            success: true
        };
        recordPing(entry);

        console.log(`[Keep-Alive] ✅ Self-ping successful! [${extResult.statusCode}] in ${extResult.durationMs}ms — Server running 24/7 in background.`);
        return { success: true, statusCode: extResult.statusCode, durationMs: extResult.durationMs };
    } else {
        stats.failedPings++;
        stats.lastStatus = 'FAILED';
        stats.lastError = extResult.error || `HTTP ${extResult.statusCode}`;

        const entry = {
            timestamp: stats.lastPingTime,
            url: fullUrl,
            statusCode: extResult.statusCode || null,
            durationMs: extResult.durationMs,
            success: false,
            error: stats.lastError
        };
        recordPing(entry);

        console.warn(`[Keep-Alive] ⚠️ Self-ping note (${stats.lastError}). Will retry on next scheduled interval.`);
        return { success: false, error: stats.lastError };
    }
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

    // First ping after 20 seconds (after server boot settles)
    setTimeout(() => {
        pingSelfNow();
    }, 20000);

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
    resolveServerUrl,
    updateServerUrl
};
