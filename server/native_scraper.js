const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { toDbLeague } = require('./constants');

puppeteer.use(StealthPlugin());

function getChromePath() {
    const candidates = [
        process.env.CHROME_EXECUTABLE_PATH,
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return '/usr/bin/chromium';
}

/**
 * Click an element containing specific text.
 */
async function clickByText(page, textMatches, description) {
    console.log(`[Native Scraper] Locating '${description}'...`);
    const box = await page.evaluate((matches) => {
        const elements = Array.from(document.querySelectorAll('span, div, a, li, button'));
        const target = elements.find(el => {
            const txt = el.textContent.trim();
            return matches.some(m => txt === m || txt.includes(m)) && el.children.length === 0 && el.offsetParent !== null;
        });
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        const rect = target.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, textMatches);

    if (box) {
        await page.mouse.click(box.x, box.y);
        return true;
    }
    return false;
}

/**
 * Open a dropdown filter by index.
 */
async function clickDropdownIndex(page, index, description) {
    console.log(`[Native Scraper] 🔽 Opening Dropdown [${index}]: ${description}...`);
    const box = await page.evaluate((idx) => {
        // Match both mobile and desktop select containers
        const triggers = document.querySelectorAll('.select-index, .m-select-list .active, .m-select-wrapper span, .m-select');
        if (triggers.length <= idx) return null;
        const target = triggers[idx];
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, index);

    if (box) {
        await page.mouse.click(box.x, box.y);
        return true;
    }
    return false;
}

/**
 * Extract matches from the current page DOM.
 */
async function extractMatchesFromDom(page, leagueName, targetDateISO = null) {
    console.log(`[Native Scraper] Waiting for match rows...`);
    try {
        await page.waitForSelector('ul.result-event', { timeout: 15000 });
        // Allow brief moment for all lazy elements to fully populate
        await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
        console.log(`[Native Scraper] ⚠️ No matches found on this page.`);
        return [];
    }

    // Capture the target date for closure context
    const contextDate = targetDateISO || new Date().toISOString().split('T')[0];

    return await page.evaluate((league, ctxDate) => {
        const matches = [];
        const rows = Array.from(document.querySelectorAll('ul.result-event'));
        
        // Helper to normalize the date inside the browser evaluate context
        const normalize = (val) => {
            if (!val) return '';
            let v = val.trim().replace(/-/g, '/');
            // If it's DD/MM, append year from context
            if (/^\d{1,2}\/\d{1,2}$/.test(v)) {
                const year = ctxDate.split('-')[0];
                return `${v}/${year}`;
            }
            return v;
        };

        const [ctxYear, ctxMonth, ctxDay] = ctxDate.split('-');
        const defaultDate = `${ctxDay}/${ctxMonth}/${ctxYear}`;

        rows.forEach((row) => {
            const timeEl = row.querySelector('.time');
            const gameIdEl = row.querySelector('.gameId');
            const homeEl = row.querySelector('.home');
            const awayEl = row.querySelector('.away');
            const scoreEl = row.querySelector('.score .score-com') || row.querySelector('.score .score-con') || row.querySelector('.score');

            if (timeEl && gameIdEl && homeEl && awayEl && scoreEl) {
                const fullTimeText = timeEl.innerText.trim();
                let datePart = '';
                let timePart = '';
                
                if (fullTimeText.includes('\n')) {
                    [datePart, timePart] = fullTimeText.split('\n');
                } else if (fullTimeText.includes(' ')) {
                    [datePart, timePart] = fullTimeText.split(' ');
                } else if (fullTimeText.includes(':')) {
                    timePart = fullTimeText;
                    datePart = defaultDate;
                } else {
                    timePart = fullTimeText;
                    datePart = defaultDate;
                }
                
                matches.push({
                    time: timePart.trim(),
                    date: normalize(datePart) || defaultDate, 
                    gameId: gameIdEl.innerText.trim(),
                    homeTeam: homeEl.innerText.trim(),
                    awayTeam: awayEl.innerText.trim(),
                    score: scoreEl.innerText.trim().replace(/\s/g, '').replace(':', '-'),
                    league: league,
                    sourceTag: 'native-dom'
                });
            }
        });
        return matches;
    }, leagueName, contextDate);
}

/**
 * Orchestrates the full native scraping flow for a single league.
 */
/**
 * Orchestrates the full native scraping flow for a single league with robust retry logic.
 */
async function nativeCaptureLeagueResults(leagueName, targetDate = null, options = {}) {
    const onPageCaptured = options.onPageCaptured || (async () => {});
    const targetLeagueName = toDbLeague(leagueName);
    
    console.log(`[Native Scraper] 🚀 Starting native extraction for: ${targetLeagueName}`);

    const maxAttempts = (leagueName.toLowerCase().includes('germany') || leagueName.toLowerCase().includes('france')) ? 10 : 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] Initializing scraper browser for ${targetLeagueName}...`);
        
        let browser = null;
        try {
            browser = await puppeteer.launch({
                executablePath: getChromePath(),
                headless: 'new',
                args: [
                    '--start-maximized',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--window-size=1366,768'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });

            // Set User Agent and hide automation footprint to bypass WAF
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] 🌐 Navigating to results page...`);
            await page.goto('https://www.sportybet.com/ng/liveResult/', { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
            await new Promise(r => setTimeout(r, 4000));

            // 1. Date Selection
            const resolvedDate = targetDate || new Date().toISOString().split('T')[0];
            console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] 🎯 Selecting date: ${resolvedDate}`);

            let tDateStr = null;
            let tDayNum = null;
            let targetYear = null;
            let targetMonthIdx = null;

            if (resolvedDate.includes('-')) {
                const parts = resolvedDate.split('-');
                if (parts.length === 3) {
                    targetYear = parseInt(parts[0], 10);
                    targetMonthIdx = parseInt(parts[1], 10) - 1; // 0-indexed month
                    tDayNum = parseInt(parts[2], 10).toString();
                    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    tDateStr = `${shortMonths[targetMonthIdx]} ${targetYear}`;
                }
            }

            if (targetYear !== null && targetMonthIdx !== null && tDayNum !== null) {
                console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] 📅 Opening date picker → target: ${tDateStr} Day ${tDayNum}`);
                const clickedPicker = await clickDropdownIndex(page, 0, "Date Picker");
                if (clickedPicker) {
                    await new Promise(r => setTimeout(r, 1500));

                    await page.evaluate(async (targetMonthIdx, targetYear, targetDayNum) => {
                        const sleep = ms => new Promise(r => setTimeout(r, ms));
                        const calendar = document.querySelector('.vdp-datepicker__calendar');
                        if (!calendar) return;

                        const monthAbbrevMap = {
                            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
                        };
                        const targetVal = targetYear * 12 + targetMonthIdx;

                        let attempts = 0;
                        while (attempts < 36) {
                            const headerSpans = Array.from(calendar.querySelectorAll('header span'));
                            const titleSpan = headerSpans.find(span => span.textContent.match(/\d{4}/)) || 
                                              (headerSpans.length >= 3 ? headerSpans[1] : headerSpans[0]);
                            
                            if (!titleSpan) break;

                            const titleText = titleSpan.textContent.trim();
                            const textLower = titleText.toLowerCase();
                            let currentMonthIdx = -1;
                            for (const [key, idx] of Object.entries(monthAbbrevMap)) {
                                if (textLower.includes(key)) {
                                    currentMonthIdx = idx;
                                    break;
                                }
                            }
                            
                            const yearMatch = titleText.match(/\d{4}/);
                            const currentYear = yearMatch ? parseInt(yearMatch[0], 10) : null;

                            if (currentMonthIdx !== -1 && currentYear !== null) {
                                const currentVal = currentYear * 12 + currentMonthIdx;
                                if (currentVal === targetVal) break;

                                if (currentVal > targetVal) {
                                    const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                                    if (prevBtn) {
                                        prevBtn.click();
                                        await sleep(500);
                                    } else break;
                                } else {
                                    const nextBtn = calendar.querySelector('header .next') || headerSpans[headerSpans.length - 1];
                                    if (nextBtn) {
                                        nextBtn.click();
                                        await sleep(500);
                                    } else break;
                                }
                            } else {
                                const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                                if (prevBtn) {
                                    prevBtn.click();
                                    await sleep(500);
                                } else break;
                            }
                            attempts++;
                        }
                        await sleep(800);

                        const cells = Array.from(document.querySelectorAll('.vdp-datepicker__calendar .cell.day:not(.disabled):not(.blank)'));
                        const cell = cells.find(c => c.textContent.trim() === targetDayNum);
                        if (cell) {
                            cell.click();
                        }
                    }, targetMonthIdx, targetYear, tDayNum);

                    await new Promise(r => setTimeout(r, 6000));
                }
            }

            // 2. Sport Selection (vFootball)
            const clickedSport = await clickDropdownIndex(page, 1, "Sport Selection");
            if (!clickedSport) {
                throw new Error("Failed to open Sport Selection dropdown");
            }
            await new Promise(r => setTimeout(r, 1500));
            const selectedSport = await clickByText(page, ['vFootball'], 'vFootball');
            if (!selectedSport) {
                throw new Error("Failed to select vFootball sport option");
            }
            await new Promise(r => setTimeout(r, 4000));

            // 3. League Selection
            const clickedLeague = await clickDropdownIndex(page, 2, "League Dropdown");
            if (!clickedLeague) {
                throw new Error("Failed to open League Selection dropdown");
            }
            await new Promise(r => setTimeout(r, 1500));
            const leagueShort = leagueName.replace(/ - Virtual$/i, '').replace(/ League$/i, '').trim();
            const selectedLeague = await clickByText(page, [leagueShort, `${leagueShort} League`, `${leagueShort} - Virtual`], leagueName);
            if (!selectedLeague) {
                throw new Error(`Failed to select league option: ${leagueShort}`);
            }
            console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] Verification: waiting for ${targetLeagueName} matches to load in DOM...`);
            
            const LEAGUE_TEAMS = {
                'England - Virtual': ['ars', 'ast', 'bha', 'bou', 'bre', 'bur', 'che', 'cry', 'eve', 'for', 'ful', 'lee', 'liv', 'mci', 'mun', 'new', 'sun', 'tot', 'whu', 'wol'],
                'Spain - Virtual': ['ala', 'atm', 'bil', 'cel', 'elc', 'esp', 'fcb', 'get', 'gir', 'lev', 'mal', 'osa', 'ovi', 'ray', 'rbb', 'rma', 'rso', 'sev', 'vcf', 'vil'],
                'Italy - Virtual': ['acm', 'ata', 'bfc', 'cag', 'com', 'fio', 'gen', 'int', 'juv', 'laz', 'lec', 'nap', 'par', 'pis', 'rom', 'sas', 'tor', 'udi', 'usc', 'ver'],
                'France - Virtual': ['amo', 'ang', 'aux', 'b29', 'leh', 'len', 'lil', 'lor', 'lyo', 'met', 'nan', 'nce', 'olm', 'pfc', 'psg', 'ren', 'str', 'tou'],
                'Germany - Virtual': ['bmg', 'bmu', 'bvb', 'fca', 'hdh', 'hsv', 'koe', 'lev', 'mai', 'rbl', 'scf', 'sge', 'stp', 'svw', 'tsg', 'uni', 'vfb', 'wob']
            };

            const targetTeams = LEAGUE_TEAMS[targetLeagueName] || [];
            let verifiedLoaded = false;

            // Loop for up to 15 seconds to wait for league teams to show up in the first match
            for (let check = 1; check <= 15; check++) {
                const checkMatches = await extractMatchesFromDom(page, targetLeagueName, targetDate);
                if (checkMatches.length > 0) {
                    const m1 = checkMatches[0];
                    const hTeam = (m1.homeTeam || '').toLowerCase();
                    const aTeam = (m1.awayTeam || '').toLowerCase();

                    if (targetTeams.includes(hTeam) || targetTeams.includes(aTeam)) {
                        console.log(`[Native Scraper] ✅ Verified ${targetLeagueName} loaded on page (matchup: "${m1.homeTeam} vs ${m1.awayTeam}").`);
                        verifiedLoaded = true;
                        break;
                    } else {
                        console.log(`[Native Scraper] ⏳ DOM matches represent other league (e.g. "${m1.homeTeam} vs ${m1.awayTeam}"). Waiting...`);
                    }
                } else {
                    console.log(`[Native Scraper] ⏳ No matches in DOM yet. Waiting...`);
                }
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!verifiedLoaded) {
                throw new Error(`Timing failure: SportyBet did not update the DOM to ${targetLeagueName} matches in time.`);
            }

            // Verify League Selection dropdown text
            const verifyText = await page.evaluate(() => {
                const triggers = document.querySelectorAll('.select-index, .m-select-list .active, .m-select-wrapper span, .m-select');
                if (triggers.length > 2) {
                    return triggers[2].textContent.trim();
                }
                return '';
            });
            console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] Dropdown Category verified text: "${verifyText}"`);
            if (verifyText && !verifyText.toLowerCase().includes(leagueShort.toLowerCase())) {
                throw new Error(`Category selection verification mismatch. Dropdown shows "${verifyText}", expected matches for "${leagueShort}"`);
            }

            // 4. Extraction Loop
            let allMatches = [];
            let hasNextPage = true;
            let pageNum = 1;

            while (hasNextPage) {
                console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] Processing Page ${pageNum}...`);
                const pageMatches = await extractMatchesFromDom(page, targetLeagueName, targetDate);
                
                if (pageMatches.length > 0) {
                    // Double check team validity on the first page
                    if (pageNum === 1) {
                        const m1 = pageMatches[0];
                        const hTeam = (m1.homeTeam || '').toLowerCase();
                        const aTeam = (m1.awayTeam || '').toLowerCase();
                        const isValid = targetTeams.includes(hTeam) || targetTeams.includes(aTeam);
                        if (!isValid) {
                            throw new Error(`${targetLeagueName} validation failed. Matchup: "${m1.homeTeam} vs ${m1.awayTeam}" has teams not matching this league's database.`);
                        }
                    }

                    allMatches = allMatches.concat(pageMatches);
                    
                    // Call the page capture hook
                    const hookResult = await onPageCaptured(null, pageMatches, pageNum);
                    if (hookResult && hookResult.stop) {
                        console.log(`[Native Scraper] 🛑 Hook requested termination (database is fully up-to-date). Halting page extraction early.`);
                        hasNextPage = false;
                        break;
                    }
                }

                // Pagination detection
                const paginationInfo = await page.evaluate(() => {
                    const nextBtn = document.querySelector('div.pagination span.icon-next');
                    if (!nextBtn) return { exists: false };
                    const isDisabled = nextBtn.classList.contains('icon-disabled') || nextBtn.closest('.disabled') !== null;
                    return { exists: true, isDisabled };
                });

                if (paginationInfo.exists && !paginationInfo.isDisabled) {
                    console.log(`[Native Scraper] ⏩ Clicking Next Page...`);
                    await page.evaluate(() => {
                        const nextBtn = document.querySelector('div.pagination span.icon-next');
                        if (nextBtn) nextBtn.click();
                    });
                    await new Promise(r => setTimeout(r, 4500)); 
                    pageNum++;
                } else {
                    console.log(`[Native Scraper] ✅ End of results reached.`);
                    hasNextPage = false;
                }

                if (pageNum > 20) break; // Hard limit
            }

            if (allMatches.length === 0) {
                throw new Error("No matches found or extracted from SportyBet results page DOM.");
            }

            console.log(`[Native Scraper] [Attempt ${attempt}/${maxAttempts}] ✅ Extraction complete! Successfully scraped ${allMatches.length} matches.`);
            return {
                success: true,
                league: leagueName,
                matchData: allMatches,
                totalPages: pageNum
            };

        } catch (err) {
            console.error(`[Native Scraper] ⚠️ Attempt ${attempt}/${maxAttempts} failed:`, err.message);
            lastError = err;
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (_) {}
            }
        }

        if (attempt < maxAttempts) {
            const delay = attempt * 5000;
            console.log(`[Native Scraper] Retrying in ${delay / 1000} seconds...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    console.error(`[Native Scraper] ❌ All ${maxAttempts} attempts to scrape ${targetLeagueName} failed.`);
    return {
        success: false,
        error: lastError ? lastError.message : "Scraping failed after all retry attempts"
    };
}

module.exports = { nativeCaptureLeagueResults };
