// =============================================================================
// bulk_history_scraper.js
// =============================================================================
//
// PURPOSE:
//   Scrapes the entire 3-year history of SportyBet vFootball results (all
//   leagues, all pages per day) and stores every match in Supabase.
//
//   After one complete 3-year pass it immediately starts another pass, but only
//   re-scrapes days that are NOT yet "confirmed complete" (i.e., days where
//   every game_id found was already in Supabase = all duplicates).
//   Keeps looping until 100% of days are confirmed.
//
// HOW TO RUN:
//   cd ~/development/sb/"mango browser extension"/live-sports-dashboard/server
//
//   node bulk_history_scraper.js                       ← full fresh run
//   node bulk_history_scraper.js --resume              ← resume after stop/crash
//   node bulk_history_scraper.js --leagues="England,Spain"
//   node bulk_history_scraper.js --from=2025-01-01 --to=2026-06-26
//   node bulk_history_scraper.js --dry-run             ← no Supabase writes
//   node bulk_history_scraper.js --status              ← show progress and exit
//
// RESUME BEHAVIOUR:
//   Progress is saved to bulk_scrape_progress.json after EVERY (date × league).
//   Two separate tracking lists are maintained:
//
//   1. completedDayLeagues — a (date × league) was fully scraped this run
//      (all pages done, whether new or dupe). Safe to SKIP on resume.
//
//   2. confirmedDays — a (date × league) had 0 new matches (100% duplicates).
//      Means the database already has ALL data for this day/league.
//      These are PERMANENTLY skipped on every future run.
//
//   On CTRL+C or crash the current (date × league) might be mid-page.
//   On resume, it simply replays that (date × league) from page 1 —
//   any already-saved matches are silently skipped by Supabase dedup.
//
// ARCHITECTURE:
//   Outer loop  → passes (repeats until all days confirmed)
//   Middle loop → dates (newest → oldest, so recent data fills in first)
//   Inner loop  → leagues × pages (1..MAX_PAGES)
//     └─ Puppeteer stealth browser per (date × league)
//        Saves to Supabase → checks added vs dupes
//        Marks (date + league) as "completed" always (after all pages done)
//        Marks (date + league) as "confirmed" when added === 0 (all dupes)
//
// =============================================================================

'use strict';

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const path      = require('path');
const { saveMatchesToDb } = require('../database/supabase');

puppeteer.use(Stealth());

// ─────────────────────────────────────────────────────────────────────────────
// CLI ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => {
            const [k, v] = a.replace('--', '').split('=');
            return [k, v === undefined ? true : v];
        })
);

console.log('[BulkScraper] [INIT] ============================================');
console.log('[BulkScraper] [INIT] 🚀 SportyBet vFootball Bulk History Scraper');
console.log('[BulkScraper] [INIT] CLI args:', JSON.stringify(args));
console.log('[BulkScraper] [INIT] ============================================');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** All 5 supported vFootball leagues */
const ALL_LEAGUES = [
    { name: 'England League', tab: 'England',  dbLeague: 'England - Virtual' },
    { name: 'Spain League',   tab: 'Spain',    dbLeague: 'Spain - Virtual'   },
    { name: 'Italy League',   tab: 'Italy',    dbLeague: 'Italy - Virtual'   },
    { name: 'Germany League', tab: 'Germany',  dbLeague: 'Germany - Virtual' },
    { name: 'France League',  tab: 'France',   dbLeague: 'France - Virtual'  },
];

/** Filter leagues from CLI --leagues="England,Spain" */
const ACTIVE_LEAGUES = args.leagues
    ? ALL_LEAGUES.filter(l =>
        args.leagues.split(',').some(n => l.tab.toLowerCase() === n.trim().toLowerCase())
    )
    : ALL_LEAGUES;

/** Max pages per (date × league). Stops early on empty page. */
const MAX_PAGES = 4;

/** Delay range between scrape cycles (ms) — reduces WAF pressure */
const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 8000;

/** Extra wait after page navigation for JS hydration (ms) */
const PAGE_HYDRATE_MS = 4500;

/** 3-year look-back */
const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const today          = new Date();

const FROM_DATE = args.from ? new Date(args.from) : new Date(today.getTime() - THREE_YEARS_MS);
const TO_DATE   = args.to   ? new Date(args.to)   : new Date();

const DRY_RUN = !!args['dry-run'];

const PROGRESS_FILE = path.join(__dirname, 'bulk_scrape_progress.json');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Format Date → "YYYY-MM-DD" */
function toISODate(d) {
    return d.toISOString().slice(0, 10);
}

/** Generate all dates start → end inclusive, newest first */
function generateDateRange(start, end) {
    const dates = [];
    const cur = new Date(end);
    cur.setHours(0, 0, 0, 0);
    const startClone = new Date(start);
    startClone.setHours(0, 0, 0, 0);
    while (cur >= startClone) {
        dates.push(new Date(cur));
        cur.setDate(cur.getDate() - 1);
    }
    return dates;
}

/** Random int between min and max inclusive */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep ms */
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/** Unique key for (date, league) pair */
function dayKey(dateISO, leagueTab) {
    return `${dateISO}_${leagueTab}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHROME PATH DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function getChromePath() {
    const candidates = [
        process.env.CHROME_EXECUTABLE_PATH,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            console.log(`[BulkScraper] [Chrome] ✅ Using Chrome at: ${p}`);
            return p;
        }
    }
    console.warn('[BulkScraper] [Chrome] ⚠️ Chrome not found — falling back to /usr/bin/chromium');
    return '/usr/bin/chromium';
}

function buildBrowserOptions() {
    // Clear stale lock files from previous crashed sessions
    try { fs.rmSync('/tmp/bulk_scraper_profile', { recursive: true, force: true }); } catch (_) {}
    return {
        executablePath: getChromePath(),
        headless: 'new',
        userDataDir: '/tmp/bulk_scraper_profile',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1366,768',
        ],
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS MANAGEMENT
//
// The progress file tracks two separate concepts:
//
//   completedDayLeagues  → fully scraped (all pages done). Skip on resume.
//                          A day is "completed" even if it had new records.
//
//   confirmedDays        → all game_ids were already in DB (0 new inserts).
//                          Means the DB is fully saturated for this day.
//                          These are skipped permanently, even across passes.
//
// Why two lists?
//   If we only tracked confirmedDays, a day with new matches (not yet a dupe)
//   would never be skipped on resume — causing pointless re-scraping of days
//   we already captured in this run.
//   With completedDayLeagues, once a day is done it's skipped for the REST of
//   this pass. On the next pass, only confirmedDays are permanently skipped.
// ─────────────────────────────────────────────────────────────────────────────

function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const raw  = fs.readFileSync(PROGRESS_FILE, 'utf8');
            const data = JSON.parse(raw);

            // Migration: ensure completedDayLeagues exists (added in v2)
            if (!data.completedDayLeagues) data.completedDayLeagues = {};

            const confirmed  = Object.keys(data.confirmedDays        || {}).length;
            const completed  = Object.keys(data.completedDayLeagues  || {}).length;
            console.log(`[BulkScraper] [Progress] 📂 Loaded progress file`);
            console.log(`[BulkScraper] [Progress]   Confirmed (permanent skip): ${confirmed}`);
            console.log(`[BulkScraper] [Progress]   Completed this run (skip resume): ${completed}`);
            console.log(`[BulkScraper] [Progress]   Total matches saved: ${data.stats?.totalMatchesSaved || 0}`);
            return data;
        }
    } catch (err) {
        console.error('[BulkScraper] [Progress] ⚠️ Failed to load progress file:', err.message);
        console.error('[BulkScraper] [Progress]   Starting fresh.');
    }

    return {
        startedAt:           new Date().toISOString(),
        confirmedDays:       {},     // permanent — survived all passes
        completedDayLeagues: {},     // current-pass only — reset at pass start
        stats: { totalMatchesSaved: 0, totalDupes: 0, passCount: 0 }
    };
}

function saveProgress(progress) {
    try {
        // Write atomically via temp file to prevent corruption on CTRL+C
        const tmpFile = PROGRESS_FILE + '.tmp';
        fs.writeFileSync(tmpFile, JSON.stringify(progress, null, 2), 'utf8');
        fs.renameSync(tmpFile, PROGRESS_FILE);
    } catch (err) {
        console.error('[BulkScraper] [Progress] ❌ Failed to save progress:', err.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS COMMAND
// node bulk_history_scraper.js --status
// ─────────────────────────────────────────────────────────────────────────────
function showStatus() {
    const progress = loadProgress();
    const allDates = generateDateRange(FROM_DATE, TO_DATE);
    const total    = allDates.length * ACTIVE_LEAGUES.length;
    const confirmed  = Object.keys(progress.confirmedDays       || {}).length;
    const completed  = Object.keys(progress.completedDayLeagues || {}).length;
    const remaining  = total - confirmed;
    const pct        = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0.0';

    console.log('\n[BulkScraper] [STATUS] ══════════════════════════════════════');
    console.log(`[BulkScraper] [STATUS] Date range:        ${toISODate(FROM_DATE)} → ${toISODate(TO_DATE)}`);
    console.log(`[BulkScraper] [STATUS] Leagues:           ${ACTIVE_LEAGUES.map(l => l.tab).join(', ')}`);
    console.log(`[BulkScraper] [STATUS] Total combos:      ${total}`);
    console.log(`[BulkScraper] [STATUS] Confirmed (done):  ${confirmed} (${pct}%)`);
    console.log(`[BulkScraper] [STATUS] Completed (pass):  ${completed}`);
    console.log(`[BulkScraper] [STATUS] Remaining:         ${remaining}`);
    console.log(`[BulkScraper] [STATUS] Matches saved:     ${progress.stats?.totalMatchesSaved || 0}`);
    console.log(`[BulkScraper] [STATUS] Passes done:       ${progress.stats?.passCount || 0}`);

    if (confirmed > 0) {
        const keys = Object.keys(progress.confirmedDays);
        console.log(`[BulkScraper] [STATUS] Last confirmed:    ${keys[keys.length - 1]}`);
    }
    console.log('[BulkScraper] [STATUS] ══════════════════════════════════════\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM INTERACTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Click an element whose text matches one of the given strings.
 * Finds leaf elements (no children) that are visible in the viewport.
 */
async function clickByText(page, textMatches, description) {
    console.log(`[BulkScraper] [DOM] 🖱️  Locating "${description}"...`);
    const box = await page.evaluate((matches) => {
        const els = Array.from(document.querySelectorAll('span, div, a, li, button'));
        const target = els.find(el => {
            const txt = el.textContent.trim();
            return matches.some(m => txt === m || txt.includes(m))
                && el.children.length === 0
                && el.offsetParent !== null;
        });
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, textMatches);

    if (box) {
        await page.mouse.click(box.x, box.y);
        console.log(`[BulkScraper] [DOM] ✅ Clicked "${description}"`);
        return true;
    }
    console.warn(`[BulkScraper] [DOM] ⚠️  "${description}" not found in DOM`);
    return false;
}

/**
 * Open the Nth dropdown (0-indexed) — SportyBet uses .select-index / .m-select.
 */
async function clickDropdownByIndex(page, index, description) {
    console.log(`[BulkScraper] [DOM] 🔽 Opening dropdown[${index}]: "${description}"...`);
    const box = await page.evaluate((idx) => {
        const triggers = document.querySelectorAll(
            '.select-index, .m-select-list .active, .m-select-wrapper span, .m-select'
        );
        if (triggers.length <= idx) return null;
        const target = triggers[idx];
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, index);

    if (box) {
        await page.mouse.click(box.x, box.y);
        console.log(`[BulkScraper] [DOM] ✅ Opened dropdown[${index}] "${description}"`);
        return true;
    }
    console.warn(`[BulkScraper] [DOM] ⚠️  Dropdown[${index}] "${description}" not found`);
    return false;
}

/**
 * Navigate SportyBet's vdp-datepicker calendar to the target date and click it.
 * Navigates month-by-month up to 48 steps (4 years).
 */
async function selectDateOnCalendar(page, dateISO) {
    const [yearStr, monthStr, dayStr] = dateISO.split('-');
    const targetYear     = parseInt(yearStr, 10);
    const targetMonthIdx = parseInt(monthStr, 10) - 1;
    const targetDayNum   = parseInt(dayStr, 10).toString(); // "01" → "1"

    console.log(`[BulkScraper] [Calendar] 📅 Navigating calendar to: ${dateISO}`);

    const opened = await clickDropdownByIndex(page, 0, 'Date Picker');
    if (!opened) throw new Error('Could not open date picker dropdown');
    await sleep(1200);

    await page.evaluate(async (tYear, tMonthIdx, tDayNum) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const calendar = document.querySelector('.vdp-datepicker__calendar');
        if (!calendar) { console.warn('[DOM] Calendar not found'); return; }

        const monthMap = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const targetVal = tYear * 12 + tMonthIdx;

        for (let attempt = 0; attempt < 48; attempt++) {
            const headerSpans = Array.from(calendar.querySelectorAll('header span'));
            const titleSpan = headerSpans.find(s => s.textContent.match(/\d{4}/))
                || (headerSpans.length >= 3 ? headerSpans[1] : headerSpans[0]);

            if (!titleSpan) { console.warn('[DOM] No title span found'); break; }

            const titleText  = titleSpan.textContent.trim().toLowerCase();
            let currentMonth = -1;
            for (const [key, idx] of Object.entries(monthMap)) {
                if (titleText.includes(key)) { currentMonth = idx; break; }
            }
            const yearMatch   = titleSpan.textContent.match(/\d{4}/);
            const currentYear = yearMatch ? parseInt(yearMatch[0], 10) : null;

            if (currentMonth !== -1 && currentYear !== null) {
                const currentVal = currentYear * 12 + currentMonth;
                if (currentVal === targetVal) break; // ✅ Correct month

                const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                const nextBtn = calendar.querySelector('header .next') || headerSpans[headerSpans.length - 1];

                if (currentVal > targetVal) {
                    if (prevBtn) { prevBtn.click(); await sleep(400); } else break;
                } else {
                    if (nextBtn) { nextBtn.click(); await sleep(400); } else break;
                }
            } else {
                const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                if (prevBtn) { prevBtn.click(); await sleep(400); } else break;
            }
        }

        await sleep(600);

        // Click the target day cell
        const cells = Array.from(
            calendar.querySelectorAll('.vdp-datepicker__calendar .cell.day:not(.disabled):not(.blank)')
        );
        const cell = cells.find(c => c.textContent.trim() === tDayNum);
        if (cell) {
            cell.click();
            console.log(`[DOM] Clicked day cell: ${tDayNum}`);
        } else {
            console.warn(`[DOM] Day cell "${tDayNum}" not found`);
        }
    }, targetYear, targetMonthIdx, targetDayNum);

    await sleep(6000); // Wait for results to reload for selected date
    console.log(`[BulkScraper] [Calendar] ✅ Date selected: ${dateISO}`);
}

/**
 * Select vFootball from the sport dropdown (index 1).
 */
async function selectSport(page) {
    console.log('[BulkScraper] [Sport] 🏃 Selecting vFootball...');
    const opened = await clickDropdownByIndex(page, 1, 'Sport Selection');
    if (!opened) throw new Error('Could not open Sport dropdown');
    await sleep(1200);

    const selected = await clickByText(page, ['vFootball'], 'vFootball');
    if (!selected) throw new Error('vFootball option not found in dropdown');
    await sleep(3500);
    console.log('[BulkScraper] [Sport] ✅ vFootball selected');
}

/**
 * Select a league from the league dropdown (index 2).
 */
async function selectLeague(page, leagueTab) {
    console.log(`[BulkScraper] [League] ⚽ Selecting league: ${leagueTab}...`);
    const opened = await clickDropdownByIndex(page, 2, 'League Dropdown');
    if (!opened) throw new Error('Could not open League dropdown');
    await sleep(1200);

    const selected = await clickByText(
        page,
        [leagueTab, `${leagueTab} League`, `${leagueTab} - Virtual`],
        leagueTab
    );
    if (!selected) throw new Error(`League option "${leagueTab}" not found`);
    await sleep(4000);
    console.log(`[BulkScraper] [League] ✅ League selected: ${leagueTab}`);
}

/**
 * Click the "next page" pagination button.
 * Returns true if clicked, false if no next page exists.
 */
async function clickNextPage(page) {
    const info = await page.evaluate(() => {
        const btn = document.querySelector('div.pagination span.icon-next');
        if (!btn) return { exists: false };
        return { exists: true, isDisabled: btn.classList.contains('icon-disabled') || btn.closest('.disabled') !== null };
    });

    if (info.exists && !info.isDisabled) {
        await page.evaluate(() => {
            const btn = document.querySelector('div.pagination span.icon-next');
            if (btn) btn.click();
        });
        await sleep(4000);
        console.log('[BulkScraper] [Pagination] ⏩ Moved to next page');
        return true;
    }
    console.log('[BulkScraper] [Pagination] 🏁 No more pages');
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract all match rows from the current results page DOM.
 * Returns an array of match objects ready for saveMatchesToDb().
 */
async function extractMatchesFromPage(page, dbLeague, dateISO) {
    console.log(`[BulkScraper] [Extract] 🔍 Waiting for match rows...`);

    try {
        await page.waitForSelector('ul.result-event', { timeout: 12000 });
        await sleep(1000);
    } catch (_) {
        console.log('[BulkScraper] [Extract] ℹ️  No ul.result-event elements found on this page');
        return [];
    }

    const [ctxYear, ctxMonth, ctxDay] = dateISO.split('-');
    const defaultDate = `${ctxDay}/${ctxMonth}/${ctxYear}`;

    const matches = await page.evaluate((league, ctxDate, defDate) => {
        const results = [];
        const rows    = Array.from(document.querySelectorAll('ul.result-event'));
        console.log(`[DOM-EVAL] ul.result-event rows: ${rows.length}`);

        const normalize = (val) => {
            if (!val) return defDate;
            let v = val.trim().replace(/-/g, '/');
            if (/^\d{1,2}\/\d{1,2}$/.test(v)) {
                return `${v}/${ctxDate.split('-')[0]}`;
            }
            return v;
        };

        rows.forEach((row) => {
            const timeEl   = row.querySelector('.time');
            const gameIdEl = row.querySelector('.gameId');
            const homeEl   = row.querySelector('.home');
            const awayEl   = row.querySelector('.away');
            const scoreEl  = row.querySelector('.score .score-com')
                          || row.querySelector('.score .score-con')
                          || row.querySelector('.score');

            if (timeEl && gameIdEl && homeEl && awayEl && scoreEl) {
                const fullTimeText = timeEl.innerText.trim();
                let datePart = defDate;
                let timePart = '';

                if (fullTimeText.includes('\n'))      { [datePart, timePart] = fullTimeText.split('\n'); }
                else if (fullTimeText.includes(' ')) { [datePart, timePart] = fullTimeText.split(' '); }
                else if (fullTimeText.includes(':')) { timePart = fullTimeText; }
                else                                 { timePart = fullTimeText; }

                results.push({
                    time:      timePart.trim(),
                    date:      normalize(datePart) || defDate,
                    gameId:    gameIdEl.innerText.trim(),
                    homeTeam:  homeEl.innerText.trim(),
                    awayTeam:  awayEl.innerText.trim(),
                    score:     scoreEl.innerText.trim().replace(/\s/g, '').replace(':', '-'),
                    league,
                    sourceTag: 'bulk-history-scraper'
                });
            }
        });

        return results;
    }, dbLeague, dateISO, defaultDate);

    console.log(`[BulkScraper] [Extract] ✅ Extracted ${matches.length} matches`);
    return matches;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SCRAPE: one (date × league) — all pages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open a fresh browser, navigate to the SportyBet results page, select
 * the date/sport/league, then extract and save pages 1–MAX_PAGES.
 *
 * @param {string} dateISO  - "YYYY-MM-DD"
 * @param {object} league   - { name, tab, dbLeague }
 * @returns {{ added, dupes, totalMatches, pagesScrapped, allDuplicates, fullyCompleted }}
 */
async function scrapeOneDayLeague(dateISO, league) {
    const label = `[${dateISO} | ${league.tab}]`;
    console.log(`\n[BulkScraper] [Scrape] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[BulkScraper] [Scrape] ${label} Starting...`);

    let browser        = null;
    let totalAdded     = 0;
    let totalDupes     = 0;
    let totalMatches   = 0;
    let pagesScrapped  = 0;
    let fullyCompleted = false; // set to true only after all pages are done

    try {
        // Step 1 — Launch stealth browser
        console.log(`[BulkScraper] [Scrape] ${label} 🚀 Launching browser...`);
        browser = await puppeteer.launch(buildBrowserOptions());
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // WAF bypass
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // Step 2 — Navigate to results page
        const url = 'https://www.sportybet.com/ng/liveResult/';
        console.log(`[BulkScraper] [Scrape] ${label} 🌐 Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(PAGE_HYDRATE_MS);
        console.log(`[BulkScraper] [Scrape] ${label} ✅ Page loaded`);

        // Step 3 — Select date
        await selectDateOnCalendar(page, dateISO);

        // Step 4 — Select sport
        await selectSport(page);

        // Step 5 — Select league
        await selectLeague(page, league.tab);

        // Step 6 — Scrape pages 1 → MAX_PAGES
        for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
            console.log(`[BulkScraper] [Scrape] ${label} 📄 Page ${pageNum}/${MAX_PAGES}...`);

            const matches = await extractMatchesFromPage(page, league.dbLeague, dateISO);
            pagesScrapped++;

            if (matches.length === 0) {
                console.log(`[BulkScraper] [Scrape] ${label} 📭 Empty page — stopping pagination`);
                break;
            }

            totalMatches += matches.length;
            console.log(`[BulkScraper] [Scrape] ${label} 📊 Page ${pageNum}: ${matches.length} matches`);

            // Step 7 — Save to Supabase
            if (!DRY_RUN) {
                try {
                    const stats = await saveMatchesToDb(matches);
                    totalAdded += stats.added;
                    totalDupes += stats.dupes;
                    console.log(`[BulkScraper] [Supabase] ${label} Page ${pageNum} → +${stats.added} new | ${stats.dupes} dupes | DB total: ${stats.total}`);
                } catch (saveErr) {
                    console.error(`[BulkScraper] [Supabase] ${label} ❌ Save error page ${pageNum}:`, saveErr.message);
                    // Non-fatal — carry on to next page
                }
            } else {
                console.log(`[BulkScraper] [Supabase] ${label} DRY-RUN: skipping save (${matches.length} matches)`);
                totalAdded += matches.length;
            }

            // Step 8 — Paginate
            if (pageNum < MAX_PAGES) {
                const hasNext = await clickNextPage(page);
                if (!hasNext) break;
                const delay = randInt(MIN_DELAY_MS, MAX_DELAY_MS);
                console.log(`[BulkScraper] [Scrape] ${label} ⏳ Delay ${delay}ms before page ${pageNum + 1}...`);
                await sleep(delay);
            }
        }

        // All pages finished without exception → mark as fully completed
        fullyCompleted = true;

    } catch (err) {
        console.error(`[BulkScraper] [Scrape] ${label} ❌ Error:`, err.message);
        throw err; // Bubble up so the caller can retry
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
            console.log(`[BulkScraper] [Scrape] ${label} 🔒 Browser closed`);
        }
    }

    // allDuplicates = we scraped matches but ALL were already in DB
    const allDuplicates = totalMatches > 0 && totalAdded === 0;

    console.log(
        `[BulkScraper] [Scrape] ${label} ` +
        `📈 total=${totalMatches} | +${totalAdded} new | ${totalDupes} dupes | ` +
        `allDupes=${allDuplicates} | fullyCompleted=${fullyCompleted}`
    );

    return { added: totalAdded, dupes: totalDupes, totalMatches, pagesScrapped, allDuplicates, fullyCompleted };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

async function runBulkScraper() {
    // --status flag: just print progress and exit
    if (args.status) {
        showStatus();
        process.exit(0);
    }

    console.log('[BulkScraper] [Main] ============================================');
    console.log('[BulkScraper] [Main] 🎬 Starting orchestrator...');
    console.log(`[BulkScraper] [Main] 📅 Date range: ${toISODate(FROM_DATE)} → ${toISODate(TO_DATE)}`);
    console.log(`[BulkScraper] [Main] ⚽ Leagues: ${ACTIVE_LEAGUES.map(l => l.tab).join(', ')}`);
    console.log(`[BulkScraper] [Main] 📄 Max pages/day: ${MAX_PAGES}`);
    console.log(`[BulkScraper] [Main] 🔁 Dry-run: ${DRY_RUN}`);

    const progress = loadProgress();

    const allDates             = generateDateRange(FROM_DATE, TO_DATE);
    const totalDayLeagueCombos = allDates.length * ACTIVE_LEAGUES.length;

    console.log(`[BulkScraper] [Main] 🔢 Total combos: ${totalDayLeagueCombos}`);
    console.log(`[BulkScraper] [Main] ✅ Already confirmed: ${Object.keys(progress.confirmedDays).length}`);
    console.log(`[BulkScraper] [Main] 📦 Already completed (this run): ${Object.keys(progress.completedDayLeagues).length}`);

    let passNumber = (progress.stats.passCount || 0) + 1;

    // ── Outer pass loop — repeats until ALL combos are confirmed ──────────────
    while (true) {
        console.log(`\n[BulkScraper] [Pass ${passNumber}] ═══════════════════════════════════`);
        console.log(`[BulkScraper] [Pass ${passNumber}] 🔄 Starting pass ${passNumber}`);

        // Reset completedDayLeagues at the START of each new pass so previously
        // completed days are processed again (to catch duplicate confirmation).
        // confirmedDays is NEVER reset — they are permanently done.
        if (passNumber > (progress.stats.passCount || 0) + 1) {
            console.log(`[BulkScraper] [Pass ${passNumber}] 🔃 Resetting completedDayLeagues for new pass`);
            progress.completedDayLeagues = {};
        }

        let passAdded     = 0;
        let passDupes     = 0;
        let passConfirmed = 0;
        let passErrors    = 0;
        let passSkipped   = 0;

        for (const date of allDates) {
            const dateISO = toISODate(date);

            for (const league of ACTIVE_LEAGUES) {
                const key = dayKey(dateISO, league.tab);

                // ── SKIP 1: Permanently confirmed (all-duplicate) days ──────────
                if (progress.confirmedDays[key]) {
                    passSkipped++;
                    continue;
                }

                // ── SKIP 2: Already fully scraped in THIS pass ─────────────────
                // (Handles resume within a pass — avoids re-scraping days
                // we completed before a CTRL+C in the same pass)
                if (progress.completedDayLeagues[key]) {
                    passSkipped++;
                    console.log(`[BulkScraper] [Pass ${passNumber}] ⏭️  Skipping (already done this pass): ${key}`);
                    continue;
                }

                console.log(`\n[BulkScraper] [Pass ${passNumber}] → ${key}`);

                // ── Retry loop ─────────────────────────────────────────────────
                let result    = null;
                let retries   = 0;
                const MAX_RETRIES = 3;

                while (retries < MAX_RETRIES) {
                    try {
                        result = await scrapeOneDayLeague(dateISO, league);
                        break;
                    } catch (err) {
                        retries++;
                        console.error(`[BulkScraper] [Pass ${passNumber}] ⚠️  Attempt ${retries}/${MAX_RETRIES} failed for ${key}:`, err.message);
                        if (retries < MAX_RETRIES) {
                            const delay = retries * 8000;
                            console.log(`[BulkScraper] [Pass ${passNumber}] ⏳ Retry in ${delay / 1000}s...`);
                            await sleep(delay);
                        }
                    }
                }

                if (!result) {
                    console.error(`[BulkScraper] [Pass ${passNumber}] ❌ All retries failed for ${key} — skipping`);
                    passErrors++;
                } else {
                    passAdded += result.added;
                    passDupes += result.dupes;
                    progress.stats.totalMatchesSaved += result.added;
                    progress.stats.totalDupes        += result.dupes;

                    // Mark as "completed this pass" so resume skips it
                    if (result.fullyCompleted) {
                        progress.completedDayLeagues[key] = {
                            completedAt:  new Date().toISOString(),
                            totalMatches: result.totalMatches,
                            added:        result.added,
                        };
                        console.log(`[BulkScraper] [Pass ${passNumber}] 📝 Marked as completed (this pass): ${key}`);
                    }

                    // Mark as "confirmed" if all game_ids were dupes
                    if (result.allDuplicates || result.totalMatches === 0) {
                        progress.confirmedDays[key] = {
                            confirmedAt:  new Date().toISOString(),
                            totalMatches: result.totalMatches,
                            reason:       result.totalMatches === 0 ? 'empty-page' : 'all-duplicates',
                        };
                        passConfirmed++;
                        const reason = result.totalMatches === 0 ? 'no matches on page' : 'all game_ids already in DB';
                        console.log(`[BulkScraper] [Pass ${passNumber}] ✅ CONFIRMED: ${key} (${reason})`);
                    } else {
                        console.log(`[BulkScraper] [Pass ${passNumber}] 🔵 ${key}: +${result.added} new matches added`);
                    }
                }

                // Persist progress after every (date × league)
                progress.stats.passCount = passNumber;
                saveProgress(progress);

                // Polite delay between cycles
                const interDelay = randInt(MIN_DELAY_MS, MAX_DELAY_MS);
                console.log(`[BulkScraper] [Pass ${passNumber}] ⏳ Next cycle in ${interDelay}ms...`);
                await sleep(interDelay);
            }
        }

        // ── End of pass summary ───────────────────────────────────────────────
        const totalConfirmed = Object.keys(progress.confirmedDays).length;
        const remaining      = totalDayLeagueCombos - totalConfirmed;
        const pct            = totalDayLeagueCombos > 0
            ? ((totalConfirmed / totalDayLeagueCombos) * 100).toFixed(1)
            : '0.0';

        console.log(`\n[BulkScraper] [Pass ${passNumber}] ═══════════════════════════════════`);
        console.log(`[BulkScraper] [Pass ${passNumber}] 📊 PASS ${passNumber} COMPLETE`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   +${passAdded} new matches added`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   ${passDupes} duplicates skipped`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   ${passConfirmed} days confirmed this pass`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   ${passErrors} days failed (errors)`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   ${passSkipped} days skipped (already done)`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   Total confirmed: ${totalConfirmed}/${totalDayLeagueCombos} (${pct}%)`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   Remaining: ${remaining}`);
        console.log(`[BulkScraper] [Pass ${passNumber}]   Total DB matches: ${progress.stats.totalMatchesSaved}`);

        if (remaining === 0) {
            console.log('\n[BulkScraper] [Main] 🎉 ══════════════════════════════════════════');
            console.log('[BulkScraper] [Main] 🎉 ALL DAYS CONFIRMED COMPLETE!');
            console.log(`[BulkScraper] [Main] 🎉 Passes: ${passNumber} | Matches: ${progress.stats.totalMatchesSaved}`);
            console.log('[BulkScraper] [Main] 🎉 ══════════════════════════════════════════');
            saveProgress(progress);
            break;
        }

        // More passes needed
        passNumber++;
        progress.stats.passCount = passNumber;
        progress.completedDayLeagues = {}; // Reset for the new pass

        if (passAdded === 0 && passErrors > 0) {
            const cooldown = 60000;
            console.log(`[BulkScraper] [Main] ⚠️  0 new + ${passErrors} errors. Cooling down ${cooldown / 1000}s...`);
            await sleep(cooldown);
        } else {
            console.log(`[BulkScraper] [Main] ⏳ Starting pass ${passNumber} in 5s...`);
            await sleep(5000);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n[BulkScraper] [SHUTDOWN] 🛑 CTRL+C detected');
    console.log('[BulkScraper] [SHUTDOWN] 💾 Progress file is up-to-date (saved after every cycle)');
    console.log('[BulkScraper] [SHUTDOWN] ℹ️  Resume with:');
    console.log('[BulkScraper] [SHUTDOWN]    node bulk_history_scraper.js');
    console.log('[BulkScraper] [SHUTDOWN] ✅ The scraper will automatically skip already-completed days');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[BulkScraper] [FATAL] 💥 Uncaught exception:', err.message);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('[BulkScraper] [FATAL] 💥 Unhandled rejection:', reason);
    process.exit(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// ENTRYPOINT (CLI only)
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
    (async () => {
        try {
            await runBulkScraper();
        } catch (err) {
            console.error('[BulkScraper] [FATAL] 💥 Top-level crash:', err.message);
            console.error(err.stack);
            process.exit(1);
        }
    })();
}

module.exports = { runBulkScraper };

