/**
 * upcoming_match_scraper.js
 * Dedicated scraper for upcoming matches and their pre-match odds directly from the DOM.
 * Saves structured fixtures and odds options into the Supabase upcoming_matches table.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { saveUpcomingMatchesToDb, getUpcomingMatchesFromDb } = require('../database/supabase');

puppeteer.use(StealthPlugin());

function getChromePath() {
    const candidates = [
        process.env.CHROME_EXECUTABLE_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return '/usr/bin/chromium';
}

function buildLaunchOptions() {
    return {
        executablePath: getChromePath(),
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1366,768'
        ]
    };
}

/**
 * Parse raw odds string or DOM text into structured odds object.
 * e.g. "1(1.85) X(3.20) 2(4.10)" -> { home_win: 1.85, draw: 3.20, away_win: 4.10 }
 */
function parseDomOdds(oddsStr = '', oddsArray = []) {
    const result = {};

    if (oddsArray && oddsArray.length >= 3) {
        result.home_win = parseFloat(oddsArray[0]) || null;
        result.draw     = parseFloat(oddsArray[1]) || null;
        result.away_win = parseFloat(oddsArray[2]) || null;
        if (oddsArray.length >= 5) {
            result.over_2_5  = parseFloat(oddsArray[3]) || null;
            result.under_2_5 = parseFloat(oddsArray[4]) || null;
        }
    }

    if (!result.home_win && oddsStr) {
        const m = oddsStr.match(/1\s*\(([0-9.]+)\)\s*X\s*\(([0-9.]+)\)\s*2\s*\(([0-9.]+)\)/i);
        if (m) {
            result.home_win = parseFloat(m[1]) || null;
            result.draw     = parseFloat(m[2]) || null;
            result.away_win = parseFloat(m[3]) || null;
        }
    }

    return result;
}

/**
 * Scrapes upcoming fixtures and odds directly from an active Puppeteer page.
 */
async function scrapeUpcomingMatchesFromPage(page, leagueName = 'vFootball Live Odds') {
    try {
        const extracted = await page.evaluate(() => {
            const matches = [];
            const matchNodes = Array.from(document.querySelectorAll('[class*="match"], [data-event-id], .m-list-item, .m-table-row'));

            for (const node of matchNodes) {
                const txt = (node.innerText || '').trim();
                if (!txt || txt.length < 5) continue;
                const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);

                // Find event code or ID
                const idLine = lines.find(l => l.startsWith('ID:') || /^\d{4,6}$/.test(l));
                let code = '';
                if (idLine) {
                    code = idLine.replace('ID:', '').trim();
                }

                // Find kickoff time (HH:MM)
                const timeMatch = txt.match(/(\d{2}:\d{2})/);
                const time = timeMatch ? timeMatch[1] : '--:--';

                // Locate team names and odds
                const oddsLines = lines.filter(l => /^\d+\.\d{2}$/.test(l));
                const teamLines = lines.filter(l =>
                    l.length >= 2 && l.length <= 30 &&
                    !l.startsWith('ID:') && !/^\d{2}:\d{2}$/.test(l) &&
                    !/^\d+\.\d{2}$/.test(l) && !/^[1X2]$/.test(l) &&
                    !l.includes('Over') && !l.includes('Under') && !l.includes('Goal')
                );

                if (teamLines.length >= 2 && oddsLines.length >= 3) {
                    const home = teamLines[0];
                    const away = teamLines[1];
                    const [o1, oX, o2] = oddsLines;
                    matches.push({
                        code: code || `${time}_${home}_vs_${away}`,
                        time,
                        home,
                        away,
                        oddsArray: [o1, oX, o2],
                        rawScore: `1(${o1}) X(${oX}) 2(${o2})`
                    });
                }
            }
            return matches;
        });

        // Deduplicate
        const unique = new Map();
        const today = new Date().toISOString().slice(0, 10);

        for (const m of extracted) {
            const key = `${m.time}_${m.home}_${m.away}`;
            if (!unique.has(key)) {
                unique.set(key, {
                    game_id: m.code,
                    league: leagueName,
                    match_date: today,
                    match_time: m.time,
                    home_team: m.home,
                    away_team: m.away,
                    odds: parseDomOdds(m.rawScore, m.oddsArray),
                    raw_odds_string: m.rawScore,
                    status: 'UPCOMING',
                    scraped_at: new Date().toISOString()
                });
            }
        }

        const upcomingList = Array.from(unique.values());
        if (upcomingList.length > 0) {
            console.log(`[Upcoming Scraper] 🎯 Captured ${upcomingList.length} upcoming matches from DOM for ${leagueName}`);
            await saveUpcomingMatchesToDb(upcomingList);
        }
        return upcomingList;
    } catch (err) {
        console.error('[Upcoming Scraper] Error scraping upcoming matches from page:', err.message);
        return [];
    }
}

/**
 * Standalone runner: launches headless Chrome, visits live odds feed, scrapes upcoming matches.
 */
async function scrapeUpcomingMatchesStandalone(url = 'https://www.sportybet.com/ng/virtual/football') {
    let browser = null;
    try {
        console.log('[Upcoming Scraper] 🚀 Launching browser to scrape upcoming matches and odds...');
        browser = await puppeteer.launch(buildLaunchOptions());
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        console.log(`[Upcoming Scraper] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await new Promise(r => setTimeout(r, 6000));

        // Detect current league
        const league = await page.evaluate(() => {
            const el = document.querySelector('[class*="category-name"], [class*="league-name"]');
            return el?.textContent?.trim() || 'vFootball Live Odds';
        });

        const upcoming = await scrapeUpcomingMatchesFromPage(page, league);
        await browser.close();
        return upcoming;
    } catch (err) {
        console.error('[Upcoming Scraper] Standalone scrape failed:', err.message);
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        return [];
    }
}

module.exports = {
    scrapeUpcomingMatchesFromPage,
    scrapeUpcomingMatchesStandalone,
    parseDomOdds
};
