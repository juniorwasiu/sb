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
        const selectors = ['li', 'a', 'span', 'div', 'button'];
        for (const sel of selectors) {
            const elements = Array.from(document.querySelectorAll(sel));
            const target = elements.find(el => {
                if (el.offsetParent === null) return false;
                const txt = el.textContent.trim();
                return matches.some(m => txt === m || txt.includes(m));
            });
            if (target) {
                target.scrollIntoView({ block: 'center' });
                const rect = target.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
        }
        return null;
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
async function nativeCaptureLeagueResults(leagueName, targetDate = null, options = {}) {
    const onPageCaptured = options.onPageCaptured || (async () => {});
    const targetLeagueName = toDbLeague(leagueName);
    
    console.log(`[Native Scraper] 🚀 Starting native extraction for: ${targetLeagueName}`);

    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: 'new',
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        console.log("[Native Scraper] 🌐 Navigating to results page...");
        await page.goto('https://www.sportybet.com/ng/liveResult/', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });
        await new Promise(r => setTimeout(r, 4000));

        // 1. Date Selection — port of the exact approach from screenshot_scraper.js
        const resolvedDate = targetDate || new Date().toISOString().split('T')[0];
        console.log(`[Native Scraper] 🎯 Selecting date: ${resolvedDate}`);

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
            console.log(`[Native Scraper] 📅 Opening date picker → target: ${tDateStr} (Year: ${targetYear}, MonthIdx: ${targetMonthIdx}) Day ${tDayNum}`);
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
                    while (attempts < 36) { // allow up to 3 years of navigation
                        const headerSpans = Array.from(calendar.querySelectorAll('header span'));
                        // Find the span containing a 4-digit year, which uniquely identifies the Month-Year title
                        const titleSpan = headerSpans.find(span => span.textContent.match(/\d{4}/)) || 
                                          (headerSpans.length >= 3 ? headerSpans[1] : headerSpans[0]);
                        
                        if (!titleSpan) {
                            console.log('[Native Scraper Calendar Navigation] Could not locate calendar title span!');
                            break;
                        }

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

                        console.log(`[Native Scraper Calendar Navigation] Attempt ${attempts}: Current title = "${titleText}" (Year: ${currentYear}, MonthIdx: ${currentMonthIdx}). Target Year: ${targetYear}, MonthIdx: ${targetMonthIdx}`);

                        if (currentMonthIdx !== -1 && currentYear !== null) {
                            const currentVal = currentYear * 12 + currentMonthIdx;
                            if (currentVal === targetVal) {
                                console.log(`[Native Scraper Calendar Navigation] Correct month reached: "${titleText}"`);
                                break;
                            }

                            if (currentVal > targetVal) {
                                // Target is in the past, click prev
                                const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                                if (prevBtn) {
                                    console.log('[Native Scraper Calendar Navigation] Clicking PREV button...');
                                    prevBtn.click();
                                    await sleep(500);
                                } else {
                                    console.log('[Native Scraper Calendar Navigation] PREV button not found!');
                                    break;
                                }
                            } else {
                                // Target is in the future, click next
                                const nextBtn = calendar.querySelector('header .next') || headerSpans[headerSpans.length - 1];
                                if (nextBtn) {
                                    console.log('[Native Scraper Calendar Navigation] Clicking NEXT button...');
                                    nextBtn.click();
                                    await sleep(500);
                                } else {
                                    console.log('[Native Scraper Calendar Navigation] NEXT button not found!');
                                    break;
                                }
                            }
                        } else {
                            console.log(`[Native Scraper Calendar Navigation] Failed to parse month/year from title text: "${titleText}"`);
                            // Fallback: click prev
                            const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                            if (prevBtn) {
                                prevBtn.click();
                                await sleep(500);
                            } else {
                                break;
                            }
                        }
                        attempts++;
                    }
                    await sleep(800);

                    // Click the specific day cell
                    const cells = Array.from(document.querySelectorAll('.vdp-datepicker__calendar .cell.day:not(.disabled):not(.blank)'));
                    const cell = cells.find(c => c.textContent.trim() === targetDayNum);
                    if (cell) {
                        console.log(`[Native Scraper Calendar Navigation] Clicking day cell: "${targetDayNum}"`);
                        cell.click();
                    } else {
                        console.log(`[Native Scraper Calendar Navigation] Day cell "${targetDayNum}" not found in available cells!`);
                    }
                }, targetMonthIdx, targetYear, tDayNum);

                await new Promise(r => setTimeout(r, 6000)); // Match screenshot_scraper's wait for deep refresh
            }
        }

        // 2. Sport Selection (vFootball)
        await clickDropdownIndex(page, 1, "Sport Selection");
        await new Promise(r => setTimeout(r, 1500));
        await clickByText(page, ['vFootball'], 'vFootball');
        await new Promise(r => setTimeout(r, 4000));

        // 3. League Selection
        await clickDropdownIndex(page, 2, "League Dropdown");
        await new Promise(r => setTimeout(r, 1500));
        const leagueShort = leagueName.replace(/ - Virtual$/i, '').replace(/ League$/i, '').trim();
        await clickByText(page, [leagueShort, `${leagueShort} League`, `${leagueShort} - Virtual`], leagueName);
        console.log(`[Native Scraper] Waiting for ${leagueName} data...`);
        await new Promise(r => setTimeout(r, 6000));

        // 3. Extraction Loop
        let allMatches = [];
        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage) {
            console.log(`[Native Scraper] Processing Page ${pageNum}...`);
            const pageMatches = await extractMatchesFromDom(page, targetLeagueName, targetDate);
            
            if (pageMatches.length > 0) {
                allMatches = allMatches.concat(pageMatches);
                // Call the hook to handle files/upload/cleanup
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

        return {
            success: true,
            league: leagueName,
            matchData: allMatches,
            totalPages: pageNum
        };

    } catch (err) {
        console.error(`[Native Scraper] ❌ Fatal Error:`, err.message);
        return { success: false, error: err.message };
    } finally {
        await browser.close();
    }
}

module.exports = { nativeCaptureLeagueResults };
