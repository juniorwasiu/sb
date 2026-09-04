/**
 * Global API configuration & interceptor for Vercel and local development.
 * 
 * In Vercel deployments, the backend server typically runs on Coolify, Railway, Render,
 * or a VPS. By setting the VITE_API_URL environment variable in your Vercel Project Settings
 * (e.g. VITE_API_URL=https://my-backend.railway.app), all API fetch calls and Server-Sent Event
 * (EventSource) streams are automatically routed to your remote backend.
 * 
 * In local development, if VITE_API_URL is omitted, all calls use relative paths ('/api/...')
 * and proxy seamlessly to http://127.0.0.1:3001 via Vite's proxy.
 */

export const API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export function apiUrl(endpoint) {
    if (!endpoint) return API_BASE;
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
}

// Automatically patch window.fetch and window.EventSource when VITE_API_URL is configured
if (typeof window !== 'undefined') {
    if (API_BASE) {
        console.log(`[API Config] 🌐 Connected to remote backend at: ${API_BASE}`);

        // Patch fetch
        const originalFetch = window.fetch;
        window.fetch = function (input, init) {
            if (typeof input === 'string') {
                if (input.startsWith('/api')) {
                    input = `${API_BASE}${input}`;
                }
            } else if (input instanceof URL) {
                if (input.pathname.startsWith('/api') && input.origin === window.location.origin) {
                    input = new URL(`${API_BASE}${input.pathname}${input.search}`);
                }
            } else if (input && typeof input === 'object' && input.url && typeof input.url === 'string') {
                if (input.url.startsWith('/api')) {
                    input = new Request(`${API_BASE}${input.url}`, input);
                }
            }
            return originalFetch.call(this, input, init);
        };

        // Patch EventSource for SSE streams
        if (window.EventSource) {
            const OriginalEventSource = window.EventSource;
            window.EventSource = function (url, eventSourceInitDict) {
                let targetUrl = url;
                if (typeof url === 'string' && url.startsWith('/api')) {
                    targetUrl = `${API_BASE}${url}`;
                }
                return new OriginalEventSource(targetUrl, eventSourceInitDict);
            };
        }
    } else if (window.location && window.location.hostname.includes('vercel.app')) {
        console.warn(
            '[API Config] ⚠️ Running on Vercel without VITE_API_URL set. ' +
            'If your backend is hosted separately (e.g. Railway or Coolify), add VITE_API_URL in your Vercel Project Settings.'
        );
    }
}
