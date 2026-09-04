const puppeteer = require('puppeteer-core');

// Module-level reference to the live scraper page (set once Chrome boots)
// Used by screenshot_scraper.js to capture without opening a second browser
let _livePage = null;
let _livePageUrl = '';

function getLivePage() { return _livePage; }
function getLivePageUrl() { return _livePageUrl; }

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LAUNCH CONFIGURATION
// WAF-bypass flags: hide webdriver fingerprint, disable automation signals
// ─────────────────────────────────────────────────────────────────────────────
const fs2 = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// Detect which Chrome/Chromium binary is available on this system.
// Railway (Nixpacks) installs Chromium at /usr/bin/chromium
// Most Linux desktops use /usr/bin/google-chrome or /usr/bin/chromium-browser
// Falls back to env var CHROME_EXECUTABLE_PATH for custom setups.
// ─────────────────────────────────────────────────────────────────────────────
function getChromePath() {
    const candidates = [
        process.env.CHROME_EXECUTABLE_PATH,   // custom override via env var
        '/usr/bin/chromium',                   // Railway (Nixpacks Chromium)
        '/usr/bin/chromium-browser',           // Ubuntu/Debian
        '/usr/bin/google-chrome',              // Google Chrome on Linux
        '/usr/bin/google-chrome-stable',       // Alternative
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs2.existsSync(p)) {
            console.log(`[DEBUG] [Scraper] Using Chrome at: ${p}`);
            return p;
        }
    }

    console.warn('[⚠️] [Scraper] Could not detect Chrome/Chromium binary. Set CHROME_EXECUTABLE_PATH env var.');
    return '/usr/bin/chromium'; // best guess fallback
}

function buildLaunchOptions() {
    return {
        executablePath: getChromePath(),
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--no-zygote',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-domain-reliability',
            '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--js-flags=--max-old-space-size=128',
            '--window-size=1280,720',
        ],
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// HISTORY STORE (server-memory ring buffer)
//
// Architecture:
//   • The live vFootball scraper fires every 5s and captures match snapshots.
//   • Each snapshot is stamped with the CURRENT TIME and pushed into this store.
//   • The /api/vfootball/history endpoint pages through this store in reverse-
//     chronological order (newest first).
//   • Max 2000 match-slot entries kept in memory to prevent leaks.
//
// Why this approach instead of re-scraping liveResult/:
//   • SportyBet's /liveResult/ URL consistently times out (WAF / rate limiting).
//   • The vFootball sport page (/ng/sport/vFootball) loads reliably and already
//     contains current vFootball matches every 5 seconds.
//   • By accumulating these snapshots we build a genuine real-time history.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_HISTORY_SLOTS = 2000;   // max individual match entries stored
const MATCHES_PER_PAGE = 20;     // matches returned per /history page

// historyStore: Array<{ capturedAt: ISO string, match: matchObj }>
// Newest entries are PREPENDED so index 0 = most recent.
const historyStore = [];

// matchKey: deduplicate by code+home+away so we don't store the same
// upcoming match 100 times (the same match appears every 5s poll)
const seenMatchKeys = new Set();

// Track what match codes have ever been seen so we can age them out
// when they've been on the page for > 10 minutes (i.e., completed)
const matchFirstSeen = new Map();  // code → timestamp

function addMatchesToHistory(matches) {
    const now = new Date();
    const nowIso = now.toISOString();

    let added = 0;
    for (const match of matches) {
        const key = `${match.code}|${match.home}|${match.away}`;

        if (!matchFirstSeen.has(match.code)) {
            matchFirstSeen.set(match.code, now);
            console.log(`[DEBUG] [History Store] New vFootball match tracked: ${match.home} vs ${match.away} (code ${match.code})`);
        }

        const firstSeen = matchFirstSeen.get(match.code);
        const ageMs = now - firstSeen;

        // A match has "completed" if it's been visible for at least 4 minutes.
        // vFootball games are very short, so after 4 min the result is final.
        const COMPLETED_AGE_MS = 4 * 60 * 1000;

        if (ageMs >= COMPLETED_AGE_MS && !seenMatchKeys.has(key)) {
            seenMatchKeys.add(key);

            // Derive a realistic final score from the odds string if available
            // odds format: "1(1.50) X(3.20) 2(5.00)" — lower odds = likely winner
            const result = deriveFinalScore(match);

            historyStore.unshift({
                capturedAt: nowIso,
                match: {
                    time: formatTime(firstSeen),
                    code: match.code,
                    home: match.home,
                    away: match.away,
                    score: result,
                    completedAt: nowIso,
                },
            });

            added++;

            // Trim store to prevent unbounded growth
            if (historyStore.length > MAX_HISTORY_SLOTS) {
                historyStore.pop();
            }
        }
    }

    if (added > 0) {
        console.log(`[DEBUG] [History Store] Added ${added} completed match(es). Store size: ${historyStore.length}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// (Seeding logic intentionally removed to enforce 100% real history)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: We no longer derive/fabricate scores from odds.
// The in-memory history store marks completions as "Pending Result".
// Real scores are ONLY sourced from the Screenshot → Gemini → Firebase pipeline.
// This prevents showing simulated data as if it were real match results.
// ─────────────────────────────────────────────────────────────────────────────
function deriveFinalScore(_match) {
    // Always return pending — do NOT fabricate scores from odds probabilities.
    // Real results arrive via the screenshot capture + Gemini extraction pipeline.
    return 'Pending Result';
}

function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GETTER — called by the Express route to serve paginated history
// Returns matches for the requested page (newest-first order).
// ─────────────────────────────────────────────────────────────────────────────
function getHistoryPage(pageNumber) {
    console.log(`[DEBUG] [History API] Serving page ${pageNumber} from in-memory store (${historyStore.length} total entries)`);

    const start = (pageNumber - 1) * MATCHES_PER_PAGE;
    const slice = historyStore.slice(start, start + MATCHES_PER_PAGE);

    if (slice.length === 0) {
        console.log('[DEBUG] [History API] Store empty or page beyond range — returning empty result set');
        return [];
    }

    // Group by date for a clean UI display
    const grouped = {};
    for (const entry of slice) {
        const date = entry.capturedAt.slice(0, 10); // "YYYY-MM-DD"
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(entry.match);
    }

    const buckets = Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))  // newest date first
        .map(([date, matches]) => ({
            league: `vFootball Results — ${formatDisplayDate(date)}`,
            matches,
        }));

    console.log(`[DEBUG] [History API] Returning ${slice.length} matches across ${buckets.length} date bucket(s)`);
    return buckets;
}

function formatDisplayDate(dateStr) {
    try {
        const d = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if (dateStr === today.toISOString().slice(0, 10)) return 'Today';
        if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';

        return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
        return dateStr;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTINUOUS LIVE SCRAPER
//
// Single long-lived Chrome window on the vFootball betslip page.
// Polls every 5 seconds, extracts match rows, and:
//   1. Calls updateCallback(results) so /api/scores stays fresh (live tab)
//   2. Passes all matches to addMatchesToHistory() so they age into history
//
// Extraction cascade (tried in order, first with results wins):
//   A: [data-event-id] attributes  — most semantic, works on new DOM
//   B: .m-list container scan      — confirmed present by debug_live_page.js
//   C: [class*="match"] containers — original approach, still works on some layouts
//   D: body.innerText parser        — last resort text-based fallback
// ─────────────────────────────────────────────────────────────────────────────

// Module-scoped scraper controller — fixes the scoping bug in stopContinuousScraper
// where `browser` and `shouldRestart` were only defined inside startContinuousScraper
const _scraperCtrl = { browser: null, shouldStop: false };

async function startContinuousScraper(updateCallback) {
    _scraperCtrl.shouldStop = false;

    // ─── Outer restart loop — fully relaunches Chrome on fatal frame detach ────
    while (!_scraperCtrl.shouldStop) {
        console.log('[DEBUG] [Live Scraper] 🚀 Launching fresh Chrome instance...');

        let browser;
        let page;

        try {
            browser = await puppeteer.launch(buildLaunchOptions());
            _scraperCtrl.browser = browser;
            page = await browser.newPage();
            _livePage = page;
            _livePageUrl = 'https://www.sportybet.com/ng/sport/vFootball?betslipMode=real';

            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            // Block heavy media/fonts/images to save up to 200MB of RAM in Chrome
            try {
                await page.setRequestInterception(true);
                page.on('request', (interceptedReq) => {
                    const resourceType = interceptedReq.resourceType();
                    if (['image', 'media', 'font'].includes(resourceType)) {
                        interceptedReq.abort();
                    } else {
                        interceptedReq.continue();
                    }
                });
            } catch (interceptErr) {
                console.warn('[Live Scraper] Request interception warning:', interceptErr.message);
            }

            console.log('[DEBUG] [Live Scraper] Navigating to vFootball live odds page...');
            await page.goto(_livePageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log('[DEBUG] [Live Scraper] Navigation complete. Starting poll loop...');

        } catch (launchErr) {
            console.error('[Firebase Index Debug/Error Details]: [Live Scraper] Browser launch/nav failed:', launchErr.message);
            try { if (browser) await browser.close(); } catch (_) { }
            _scraperCtrl.browser = null;
            _livePage = null;
            console.log('[DEBUG] [Live Scraper] ⏳ Waiting 10s before retry...');
            await new Promise(r => setTimeout(r, 10000));
            continue; // retry the outer loop
        }

        // ─── Inner poll loop: Multi-League Extraction (England, Spain, Italy, Germany, France) ──
        let shouldRestart = false;
        let pollCount = 0;
        const LEAGUE_NAMES = ['England', 'Spain', 'Italy', 'Germany', 'France'];

        while (!shouldRestart && !_scraperCtrl.shouldStop) {
            try {
                console.log('[DEBUG] [Live Scraper] 🔄 Polling live odds across all leagues...');
                const allExtractedMatches = [];
                const leagueResults = [];

                for (const lName of LEAGUE_NAMES) {
                    try {
                        // Click category-item for this league
                        await page.evaluate((target) => {
                            const items = Array.from(document.querySelectorAll('.category-item'));
                            const found = items.find(it => it.innerText.includes(target));
                            if (found) found.click();
                        }, lName);
                        await new Promise(r => setTimeout(r, 900));
                    } catch (_) {}

                    const lMatches = await page.evaluate((leagueTarget) => {
                        const results = [];
                        const allText = document.body.innerText;
                        const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);

                        for (let i = 0; i < lines.length - 6; i++) {
                            if (/^\d{2}:\d{2}$/.test(lines[i])) {
                                const time = lines[i];
                                let code = '';
                                let offset = 1;
                                if (lines[i+1] && lines[i+1].startsWith('ID:')) {
                                    code = lines[i+1].replace('ID:', '').trim();
                                    offset = 2;
                                }
                                const home = lines[i + offset];
                                const away = lines[i + offset + 1];
                                const odd1 = lines[i + offset + 2];
                                const oddX = lines[i + offset + 3];
                                const odd2 = lines[i + offset + 4];

                                if (home && away && /^\d+\.\d+$/.test(odd1) && /^\d+\.\d+$/.test(oddX) && /^\d+\.\d+$/.test(odd2)) {
                                    results.push({
                                        time,
                                        code: code || `${home}_vs_${away}_${time}`,
                                        home,
                                        away,
                                        league: `${leagueTarget} - Virtual`,
                                        score: `1(${odd1}) X(${oddX}) 2(${odd2})`,
                                        odds: {
                                            home_win: parseFloat(odd1),
                                            draw: parseFloat(oddX),
                                            away_win: parseFloat(odd2)
                                        }
                                    });
                                }
                            }
                        }
                        return results;
                    }, lName);

                    if (lMatches.length > 0) {
                        allExtractedMatches.push(...lMatches);
                        leagueResults.push({
                            league: `${lName} - Virtual`,
                            matches: lMatches
                        });
                    }
                }

                // De-duplicate matches
                const uniqueMatchesMap = new Map();
                for (const m of allExtractedMatches) {
                    const key = `${m.league}_${m.home}_${m.away}_${m.time}`;
                    if (!uniqueMatchesMap.has(key)) uniqueMatchesMap.set(key, m);
                }
                const allMatches = Array.from(uniqueMatchesMap.values());
                console.log(`[DEBUG] [Live Scraper] ✅ All Leagues Extracted: ${allMatches.length} total fixtures`);

                if (leagueResults.length > 0) {
                    updateCallback(leagueResults);
                }

                if (allMatches.length > 0) {
                    addMatchesToHistory(allMatches);

                    // Sync upcoming & in-play fixtures with pre-match DOM odds
                    try {
                        const { saveUpcomingMatchesToDb } = require('../database/supabase');
                        const today = new Date().toISOString().slice(0, 10);
                        const upcomingBatch = allMatches.map(m => ({
                            game_id: m.code,
                            league: m.league,
                            match_date: today,
                            match_time: m.time,
                            home_team: m.home,
                            away_team: m.away,
                            odds: m.odds,
                            raw_odds_string: m.score,
                            status: 'UPCOMING'
                        }));
                        saveUpcomingMatchesToDb(upcomingBatch).catch(e =>
                            console.warn('[Live Scraper] upcoming matches save error:', e.message)
                        );
                    } catch (syncErr) {
                        console.warn('[Live Scraper] upcoming matches sync skipped:', syncErr.message);
                    }
                }


            } catch (pollErr) {
                console.error('[Firebase Index Debug/Error Details]: [Live Scraper] Poll error:', pollErr.message);

                // Detect permanent browser/frame death — trigger full browser restart
                const isFatalError =
                    pollErr.message.includes('detached Frame') ||
                    pollErr.message.includes('Execution context was destroyed') ||
                    pollErr.message.includes('Target closed') ||
                    pollErr.message.includes('Session closed') ||
                    pollErr.message.includes('Protocol error');

                if (isFatalError) {
                    console.log('[DEBUG] [Live Scraper] ☠️ Fatal browser error. Restarting Chrome in 10s...');
                    try { await browser.close(); } catch (_) { }
                    _scraperCtrl.browser = null;
                    _livePage = null;
                    await new Promise(r => setTimeout(r, 10000));
                    shouldRestart = true;
                    break;
                }
            }

            // Periodically recycle Chrome every 100 polls (~25 mins) to prevent memory accumulation
            pollCount++;
            if (pollCount >= 100) {
                console.log('[DEBUG] [Live Scraper] ♻️ Periodic Chrome recycling to prevent memory leak (100 polls reached). Restarting browser...');
                try { await browser.close(); } catch (_) { }
                _scraperCtrl.browser = null;
                _livePage = null;
                shouldRestart = true;
                break;
            }

            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL RESULTS ENDPOINT
//
// Called by GET /api/vfootball/history?page=N
//
// Returns up to MATCHES_PER_PAGE entries from the in-memory history store,
// newest first. Page 1 = most recent completed vFootball matches (today).
//
// If the store is empty (scraper just started), returns informative empty state.
// ─────────────────────────────────────────────────────────────────────────────
async function getHistoricalResults(pageNumber) {
    console.log(`[DEBUG] [History Scraper] Request for page ${pageNumber}. Store has ${historyStore.length} entries.`);

    const data = getHistoryPage(pageNumber);

    if (data.length === 0) {
        // Store is empty — the scraper needs time to accumulate completed matches.
        // A match is "completed" after being on the betslip for 4+ minutes.
        // Return an informative status bucket instead of an error.
        console.log('[DEBUG] [History Scraper] Store empty — returning warming-up status.');
        return [{
            league: 'vFootball Results — Today',
            matches: [],
            status: 'warming_up',
            message: 'The history store is warming up. Matches appear here once they have completed (approx. 4 min after first seen on live page). Check back shortly.',
        }];
    }

    return data;
}

// ── Cleanup Helper ───────────────────────────────────────────────────────────
async function stopContinuousScraper() {
    _scraperCtrl.shouldStop = true;
    if (_scraperCtrl.browser) {
        console.log('[DEBUG] [Live Scraper] 🛑 Shutting down browser instance...');
        try { await _scraperCtrl.browser.close(); } catch (_) { }
        _scraperCtrl.browser = null;
    }
    _livePage = null;
    console.log('[DEBUG] [Live Scraper] 🛑 Scraper stopped.');
}

async function reloadContinuousScraper() {
    console.log('[DEBUG] [Live Scraper] 🔄 Manual reload triggered from UI. Closing browser to force restart...');
    if (_scraperCtrl.browser) {
        try { await _scraperCtrl.browser.close(); } catch (_) {}
        // The error caused by closing the browser will naturally be caught by the inner poll loop
        // as a 'Target closed' or 'Session closed' error, triggering a clean automatic restart.
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPE LIVE LIST ON DEMAND
// Scrapes the mobile live list to find matches currently playing, which are the 
// immediate next fixtures that pattern intelligence should predict.
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeLiveListOnDemand() {
    let tempBrowser = null;
    let browserToUse = _scraperCtrl.browser;
    
    // Check if we have an active, connected browser instance
    if (!browserToUse || typeof browserToUse.isConnected !== 'function' || !browserToUse.isConnected()) {
        console.log('[Live Scraper OnDemand] No active browser instance available. Launching temporary Chrome instance...');
        try {
            tempBrowser = await puppeteer.launch(buildLaunchOptions());
            browserToUse = tempBrowser;
        } catch (launchErr) {
            console.error('[Live Scraper OnDemand] Failed to launch temporary browser:', launchErr.message);
            throw new Error(`Browser Launch Failed: ${launchErr.message}`);
        }
    }
    
    let page;
    try {
        console.log('[Live Scraper OnDemand] Opening new page for live_list...');
        page = await browserToUse.newPage();
        await page.setViewport({ width: 1366, height: 8000 });
        
        // Set user agent and hide webdriver to match main scraper settings
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        
        console.log('[Live Scraper OnDemand] Navigating to https://www.sportybet.com/ng/m/sport/vFootball/live_list ...');
        // Use domcontentloaded instead of networkidle2 to prevent timeouts due to persistent websocket/SSE activity
        await page.goto('https://www.sportybet.com/ng/m/sport/vFootball/live_list', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        console.log('[Live Scraper OnDemand] Navigation complete. Waiting for matches to render in DOM...');
        // Wait for JS framework to render the matches (with 20s timeout)
        await page.waitForSelector('.m-league, .m-live-upcoming, .m-sports-row, div[data-key]', { timeout: 20000 })
            .catch(() => console.log('[Live Scraper OnDemand] ⚠️ Timed out waiting for matches to render, checking page body anyway...'));
            
        console.log('[Live Scraper OnDemand] Matches rendered. Pausing 5 seconds for full React hydration...');
        await new Promise(r => setTimeout(r, 5000)); // 5 seconds pause to ensure React components are fully hydrated
        
        const results = await page.evaluate(() => {
            const groups = [];
            
            // 1. Parse main live leagues (In-Play matches)
            const leagueNodes = document.querySelectorAll('.m-league');
            leagueNodes.forEach(leagueNode => {
                const titleNode = leagueNode.querySelector('.m-league-title .text');
                if (!titleNode) return;
                const leagueName = titleNode.innerText.trim();
                
                const matches = [];
                const matchBlocks = leagueNode.querySelectorAll('div[data-key]');
                
                matchBlocks.forEach(block => {
                    const timeNode = block.querySelector('.m-event-time');
                    const timeStr = timeNode ? timeNode.innerText.trim() : '';
                    const teams = block.querySelectorAll('.m-info-cell .team');
                    const scores = block.querySelectorAll('.set-score');
                    const oddsNodes = block.querySelectorAll('.m-odds-value');
                    
                    if (teams.length >= 2) {
                        matches.push({
                            status: 'IN-PLAY',
                            time: timeStr,
                            home: teams[0].innerText.trim(),
                            away: teams[1].innerText.trim(),
                            homeScore: scores.length >= 1 ? scores[0].innerText.trim() : '',
                            awayScore: scores.length >= 2 ? scores[1].innerText.trim() : '',
                            score: Array.from(oddsNodes).map(n => n.innerText.trim()).join(' ') // Keep odds as 'score' field to maintain backward compatibility
                        });
                    }
                });
                
                if (matches.length > 0) {
                    groups.push({ league: leagueName, matches });
                }
            });
            
            // 2. Parse Upcoming Live section
            const upcomingLiveSection = document.querySelector('.m-live-upcoming');
            if (upcomingLiveSection) {
                const rows = upcomingLiveSection.querySelectorAll('.m-sports-row');
                const upcomingMatches = [];
                
                rows.forEach(row => {
                    const preTimeNode = row.querySelector('.m-time');
                    const gameIdNode = row.querySelector('.m-game-id');
                    const lgNode = row.querySelector('.m-league-name');
                    const teams = row.querySelectorAll('.m-info-cell .team');
                    const oddsNodes = row.querySelectorAll('.m-odds-value');
                    
                    if (teams.length >= 2) {
                        upcomingMatches.push({
                            status: 'UPCOMING',
                            league: lgNode ? lgNode.innerText.trim() : 'Unknown',
                            time: preTimeNode ? preTimeNode.innerText.trim() : '',
                            code: gameIdNode ? gameIdNode.innerText.trim().replace('ID ', '') : '',
                            home: teams[0].innerText.trim(),
                            away: teams[1].innerText.trim(),
                            score: Array.from(oddsNodes).map(n => n.innerText.trim()).join(' ')
                        });
                    }
                });
                
                const map = {};
                upcomingMatches.forEach(m => {
                    if (!map[m.league]) map[m.league] = [];
                    map[m.league].push(m);
                });
                
                Object.keys(map).forEach(lg => {
                    groups.push({ league: lg + ' (Upcoming)', matches: map[lg] });
                });
            }
            
            return groups;
        });
        console.log(`[Live Scraper OnDemand] Successfully scraped ${results.reduce((acc, curr) => acc + curr.matches.length, 0)} live matches across ${results.length} leagues.`);
        return results;
        
    } catch (err) {
        console.error('[Live Scraper OnDemand] Error scraping live_list:', err.message);
        throw new Error(`SportyBet Live List Scrape Failed: ${err.message}`);
    } finally {
        if (page) {
            try { await page.close(); } catch (_) {}
        }
        if (tempBrowser) {
            try {
                console.log('[Live Scraper OnDemand] Closing temporary Chrome instance...');
                await tempBrowser.close();
            } catch (_) {}
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    startContinuousScraper,
    stopContinuousScraper,
    reloadContinuousScraper,
    getHistoricalResults,
    getLivePage,
    getLivePageUrl,
    scrapeLiveListOnDemand,
    // Expose store info for debug endpoint
    getHistoryStoreInfo: () => ({
        totalEntries: historyStore.length,
        trackedCodes: matchFirstSeen.size,
        oldestEntry: historyStore[historyStore.length - 1]?.capturedAt ?? null,
        newestEntry: historyStore[0]?.capturedAt ?? null,
    }),
};
