// ─────────────────────────────────────────────────────────────────────────────
// screenshot_scraper.js
//
// Based on the exact precision approach from test_vfootball_new.js.
// Uses headless: 'new' to prevent detection while forcing rigorous viewport coordinates.
// Navigates strictly using dynamic layout pixel bounding box clicking to bypass React.
// ─────────────────────────────────────────────────────────────────────────────

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { extractMatchDataFromImage } = require('./ai_router');
const { getLivePage, getLivePageUrl } = require('./scraper');
const { LEAGUE_MAP, LEAGUE_TAB_TEXT } = require('./constants');

puppeteer.use(StealthPlugin());

// Re-use Chrome auto-detection
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
        if (fs.existsSync(p)) return p;
    }
    return '/usr/bin/chromium';
}

function buildLaunchOptions() {
    return {
        executablePath: getChromePath(),
        headless: 'new', // Switched to new headless for stability + stealth
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1366,768',
        ],
    };
}

// LEAGUE_MAP and LEAGUE_TAB_TEXT are imported from constants.js — single source of truth.
// DB_LEAGUE_MAP is kept as an alias so existing references below don't break.
const DB_LEAGUE_MAP = LEAGUE_MAP;

// ─────────────────────────────────────────────────────────────────────────────
// clickByText — Click a visible element matching any of the given text strings.
// Tries multiple DOM selector strategies in priority order.
// Dumps visible text nodes to console on failure to help debugging.
// ─────────────────────────────────────────────────────────────────────────────
async function clickByText(page, textMatches, description) {
    console.log(`[Screenshot Service] Locating '${description}'...`);

    // Dump all visible text nodes (≤50 chars) to aid debugging when element is not found
    const allVisible = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('span, div, a, li, button'))
            .filter(el => el.offsetParent !== null && el.textContent.trim().length > 0 && el.textContent.trim().length < 50)
            .map(el => el.textContent.trim())
            .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
            .slice(0, 60);
    });
    console.log(`[Screenshot Service] Visible short text nodes:`, allVisible.join(' | '));

    const box = await page.evaluate((matches) => {
        // Priority: li > a > span > div > button (list items are most specific for dropdowns)
        const selectors = ['li', 'a', 'span', 'div', 'button'];
        for (const sel of selectors) {
            const elements = Array.from(document.querySelectorAll(sel));
            const target = elements.find(el => {
                if (el.offsetParent === null) return false; // must be visible
                const txt = el.textContent.trim();
                return matches.some(m => txt === m || txt.startsWith(m + ' ') || txt === m.trim());
            });
            if (target) {
                target.scrollIntoView({ block: 'center' });
                const rect = target.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, found: sel, text: target.textContent.trim().slice(0, 40) };
            }
        }
        return null;
    }, textMatches);

    if (box) {
        console.log(`[Screenshot Service] ✅ Found '${description}' via <${box.found}> "${box.text}" at (${Math.round(box.x)}, ${Math.round(box.y)})`);
        if (box.y <= 900 && box.y >= 0) {
            await page.mouse.click(box.x, box.y);
        } else {
            // Element is off-screen — use DOM .click() fallback
            console.log(`[Screenshot Service] ⚠️ ${description} off-screen (y=${Math.round(box.y)}). Using DOM .click() fallback.`);
            await page.evaluate((matches) => {
                for (const sel of ['li', 'a', 'span', 'div', 'button']) {
                    const el = Array.from(document.querySelectorAll(sel)).find(e => {
                        const txt = e.textContent.trim();
                        return e.offsetParent !== null && matches.some(m => txt === m || txt.startsWith(m + ' '));
                    });
                    if (el) { el.click(); break; }
                }
            }, textMatches);
        }
        return true;
    }
    console.log(`[Screenshot Service] ❌ Could not find '${description}'. Tried: ${textMatches.join(', ')}`);
    return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// clickDropdownIndex — Open a SportyBet results-page filter dropdown by index.
//
// SportyBet's /ng/liveResult/ page uses .m-results-filter-item containers,
// each holding a .m-select element as the clickable trigger.
// Confirmed via debug_scraper.js DOM inspection:
//   filters[0] = Date picker
//   filters[1] = Sport selector (vFootball, Football, etc.)
//   filters[2] = Category/League selector
//
// Falls back through multiple selector strategies to maximise reliability
// across different SportyBet DOM versions.
// ─────────────────────────────────────────────────────────────────────────────
async function clickDropdownIndex(page, index, description) {
    console.log(`[Screenshot Service] 🔽 Opening Dropdown [${index}]: ${description}...`);

    // --- Strategy 1: .m-results-filter-item > .m-select (confirmed from debug_scraper.js) ---
    const s1Result = await page.evaluate((idx) => {
        const filterItems = document.querySelectorAll('.m-results-filter-item');
        console.log('[DOM-EVAL] .m-results-filter-item count:', filterItems.length);
        if (filterItems.length <= idx) return null;
        const mSelect = filterItems[idx].querySelector('.m-select');
        if (!mSelect) return null;
        mSelect.scrollIntoView({ block: 'center' });
        const r = mSelect.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, strategy: 'm-results-filter-item' };
    }, index);

    if (s1Result) {
        console.log(`[Screenshot Service] ✅ Strategy 1 (m-results-filter-item[${index}]) → (${Math.round(s1Result.x)}, ${Math.round(s1Result.y)})`);
        await page.mouse.click(s1Result.x, s1Result.y);
        return true;
    }
    console.log(`[Screenshot Service] ⚠️ Strategy 1 failed — trying Strategy 2 (m-select-list)...`);

    // --- Strategy 2: .m-select-list (older DOM layout) ---
    const s2Result = await page.evaluate((idx) => {
        const lists = document.querySelectorAll('.m-select-list');
        console.log('[DOM-EVAL] .m-select-list count:', lists.length);
        if (lists.length <= idx) return null;
        const trigger = lists[idx].querySelector('.select-index, .active, span');
        if (!trigger) return null;
        trigger.scrollIntoView({ block: 'center' });
        const r = trigger.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, strategy: 'm-select-list' };
    }, index);

    if (s2Result) {
        console.log(`[Screenshot Service] ✅ Strategy 2 (m-select-list[${index}]) → (${Math.round(s2Result.x)}, ${Math.round(s2Result.y)})`);
        await page.mouse.click(s2Result.x, s2Result.y);
        return true;
    }
    console.log(`[Screenshot Service] ⚠️ Strategy 2 failed — trying Strategy 3 (generic select-index)...`);

    // --- Strategy 3: generic .select-index fallback ---
    const s3Result = await page.evaluate((idx) => {
        const triggers = document.querySelectorAll('.select-index, .m-select-wrapper span');
        console.log('[DOM-EVAL] .select-index count:', triggers.length);
        if (triggers.length <= idx) return null;
        const target = triggers[idx];
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, strategy: 'select-index' };
    }, index);

    if (s3Result) {
        console.log(`[Screenshot Service] ✅ Strategy 3 (select-index[${index}]) → (${Math.round(s3Result.x)}, ${Math.round(s3Result.y)})`);
        await page.mouse.click(s3Result.x, s3Result.y);
        return true;
    }

    console.log(`[Screenshot Service] ❌ All 3 strategies failed to open dropdown [${index}] (${description}). Check DOM structure.`);
    return false;
}


async function processSinglePage(page, leagueName, targetDate, pageNumStr) {
    const downloadPath = path.join(__dirname, 'testdownloadpage');
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

    const timedatenow = Date.now();
    const screenshotPath = path.join(downloadPath, `screenshot_${timedatenow}_p${pageNumStr}.png`);
    const metaPath = path.join(downloadPath, `screenshot_${timedatenow}_p${pageNumStr}.meta.json`);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const dbLeague = DB_LEAGUE_MAP[leagueName] || leagueName;
    const meta = {
        league: leagueName,
        dbLeague,
        capturedAt: timedatenow,
        capturedAtISO: new Date(timedatenow).toISOString(),
        date: targetDate || null,
        filename: `screenshot_${timedatenow}_p${pageNumStr}.png`,
        page: pageNumStr
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    let imageBuffer = fs.readFileSync(screenshotPath);

    console.log(`[Screenshot Service] 🤖 Handing off screenshot to Vision AI Extractor...`);
    const resultPayload = await extractMatchDataFromImage(screenshotPath, dbLeague);
    const matchData = resultPayload.matches || [];
    const totalPages = resultPayload.totalPages || 1;
    const tokenStats = resultPayload.tokenStats || { input: 0, output: 0, durationMs: 0 };

    const rawText = matchData.map(m => `${m.time}  ${m.homeTeam || m.home} vs ${m.awayTeam || m.away}  ${m.score || m.odds}`).join('\n');
    return { screenshotPath, meta, imageBuffer, matchData, rawText, totalPages, tokenStats };
}

async function captureLeagueResults(leagueName, targetDate = null, options = {}) {
    const isHistorical = options.isHistorical || false;
    const uploadedPages = options.uploadedPages || [];
    const onPageCaptured = options.onPageCaptured || null;
    console.log(`[Screenshot Service] [1/6] 🚀 Starting rigorous pixel capture for: ${leagueName}`);

    const browser = await puppeteer.launch(buildLaunchOptions());

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 }); // Lock headless coordinate mapping
        
        console.log(`[Screenshot Service] [2/6] 🌐 Navigating to SportyBet live results...`);
        await page.goto('https://www.sportybet.com/ng/liveResult/', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });

        // ── Step 3: Parse Optional Date Target ─────────────────────
        let tDateStr = null;
        let tDayNum = null;
        if (targetDate) {
            const d = new Date(targetDate);
            if (!isNaN(d.getTime())) {
                const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                tDateStr = `${shortMonths[d.getMonth()]} ${d.getFullYear()}`;
                tDayNum = d.getDate().toString();
            }
        }

        console.log(`[Screenshot Service] [3/6] 🔍 Handling Date Selection: ${tDateStr ? tDateStr + ' Day ' + tDayNum : 'Default/Today'}...`);
        await new Promise(r => setTimeout(r, 4000)); // wait for React to mount

        if (tDateStr && tDayNum) {
            const clickedPicker = await clickDropdownIndex(page, 0, "Date Picker");
            if (clickedPicker) {
                await new Promise(r => setTimeout(r, 1500));
                await page.evaluate(async (targetMonth, targetDayNum) => {
                    const sleep = ms => new Promise(r => setTimeout(r, ms));
                    const calendar = document.querySelector('.vdp-datepicker__calendar');
                    if (!calendar) return;

                    let attempts = 0;
                    while (attempts < 24) {
                        const headerSpans = Array.from(calendar.querySelectorAll('header span'));
                        const titleSpan = headerSpans.length >= 3 ? headerSpans[1] : headerSpans[0];
                        if (titleSpan && titleSpan.textContent.trim().includes(targetMonth)) break;

                        const prevBtn = calendar.querySelector('header .prev') || headerSpans[0];
                        if (prevBtn) {
                            prevBtn.click();
                            await sleep(400);
                        }
                        attempts++;
                    }
                    await sleep(800);
                    const cells = Array.from(document.querySelectorAll('.vdp-datepicker__calendar .cell.day:not(.disabled):not(.blank)'));
                    const cell = cells.find(c => c.textContent.trim() === targetDayNum);
                    if (cell) cell.click();
                }, tDateStr, tDayNum);

                await new Promise(r => setTimeout(r, 6000)); // Crucial to wait for deep refresh 
            }
        }

        // ── Step 4: Select vFootball sport ────────────────────────────────────
        // PRIMARY: use .m-results-filter-item a links (confirmed via debug_scraper.js)
        // FALLBACK: clickDropdownIndex + clickByText text search
        console.log(`[Screenshot Service] [4/6] 📱 Selecting vFootball sport...`);
        try {
            // Open the sport dropdown (2nd .m-results-filter-item)
            const sportDropdownOpened = await page.evaluate(() => {
                const filterItems = document.querySelectorAll('.m-results-filter-item');
                console.log('[DOM-EVAL Step4] m-results-filter-item count:', filterItems.length);
                if (filterItems.length < 2) return false;
                const mSelect = filterItems[1].querySelector('.m-select');
                if (mSelect) { mSelect.click(); return true; }
                return false;
            });

            await new Promise(r => setTimeout(r, 1500));

            if (sportDropdownOpened) {
                // Click the vFootball link inside the dropdown
                const vfbClicked = await page.evaluate(() => {
                    // Strategy A: scoped to 2nd filter-item list
                    const links = document.querySelectorAll('.m-results-filter-item:nth-child(2) ul.list a, .m-results-filter-item:nth-child(2) ul li a');
                    console.log('[DOM-EVAL Step4] Sport dropdown links:', links.length);
                    for (const link of links) {
                        if (link.textContent.trim() === 'vFootball') { link.click(); return 'scoped-link'; }
                    }
                    // Strategy B: any visible anchor with text vFootball
                    const all = Array.from(document.querySelectorAll('ul.list a, .option a, .list a'));
                    const vfb = all.find(a => a.textContent.trim() === 'vFootball' && a.offsetParent !== null);
                    if (vfb) { vfb.click(); return 'global-anchor'; }
                    return null;
                });
                console.log(`[Screenshot Service] ${vfbClicked ? `✅ vFootball clicked (${vfbClicked})` : '⚠️ Direct link not found — trying clickByText fallback...'}`);
                if (!vfbClicked) await clickByText(page, ['vFootball'], 'vFootball');
            } else {
                // FALLBACK: generic approach
                console.log('[Screenshot Service] ⚠️ Sport dropdown primary failed — trying clickDropdownIndex fallback...');
                await clickDropdownIndex(page, 1, 'Sport Selection');
                await new Promise(r => setTimeout(r, 1200));
                await clickByText(page, ['vFootball'], 'vFootball');
            }
        } catch (e) {
            console.error(`[Screenshot Service] ❌ vFootball selection error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 6000)); // Wait for vFootball to load

        // ── Step 5: Select League/Category ────────────────────────────────────
        const leagueShort = (LEAGUE_TAB_TEXT[leagueName]
            || leagueName.replace(/ League$/i, '').replace(/ - Virtual$/i, '')).trim();

        const leagueVariants = [
            leagueShort,
            `${leagueShort} League`,
            `${leagueShort} - Virtual`,
            `Virtual ${leagueShort}`,
            leagueName,
        ];
        console.log(`[Screenshot Service] [5/6] 🏆 League variants: ${leagueVariants.join(' | ')}`);

        try {
            // Open the category dropdown (3rd .m-results-filter-item)
            const catDropdownOpened = await page.evaluate(() => {
                const filterItems = document.querySelectorAll('.m-results-filter-item');
                console.log('[DOM-EVAL Step5] m-results-filter-item count:', filterItems.length);
                if (filterItems.length < 3) return false;
                const mSelect = filterItems[2].querySelector('.m-select');
                if (mSelect) { mSelect.click(); return true; }
                return false;
            });

            await new Promise(r => setTimeout(r, 1500));

            if (catDropdownOpened) {
                // Click the matching league link
                const lgClicked = await page.evaluate((variants) => {
                    const links = document.querySelectorAll('.m-results-filter-item:nth-child(3) ul.list a, .m-results-filter-item:nth-child(3) ul li a');
                    console.log('[DOM-EVAL Step5] Category dropdown links:', links.length);
                    for (const link of links) {
                        const txt = link.textContent.trim();
                        if (variants.some(v => txt === v || txt.includes(v))) { link.click(); return txt; }
                    }
                    // Fallback: search all visible list anchors
                    const all = Array.from(document.querySelectorAll('ul.list a, .option a'));
                    const match = all.find(a => {
                        const txt = a.textContent.trim();
                        return a.offsetParent !== null && variants.some(v => txt === v || txt.includes(v));
                    });
                    if (match) { match.click(); return match.textContent.trim(); }
                    return null;
                }, leagueVariants);

                console.log(`[Screenshot Service] ${lgClicked ? `✅ League selected: "${lgClicked}"` : '⚠️ League link not found — trying clickByText fallback...'}`);
                if (!lgClicked) await clickByText(page, leagueVariants, leagueShort);
            } else {
                // FALLBACK: generic approach
                console.log('[Screenshot Service] ⚠️ Category dropdown primary failed — using clickDropdownIndex fallback...');
                await clickDropdownIndex(page, 2, 'League/Category Dropdown');
                await new Promise(r => setTimeout(r, 1200));
                const lgFb = await clickByText(page, leagueVariants, leagueShort);
                if (!lgFb) console.warn(`[Screenshot Service] ⚠️ Could not click league — screenshots may show wrong league!`);
            }
        } catch (e) {
            console.error(`[Screenshot Service] ❌ League selection error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 6000)); // Wait for tables to load


        // ── Step 6: Screenshot Page 1 and map further pages dynamically ──────────
        console.log(`[Screenshot Service] [6/6] 📸 Capturing Page 1 — Claude Vision will determine total pages...`);

        const allMatchData = [];
        let finalImageBuffer = null;
        let finalScreenshotPath = null;
        let finalRawText = '';
        let dbLeague = DB_LEAGUE_MAP[leagueName] || leagueName;
        let cumulativeTokens = { input: 0, output: 0, durationMs: 0 };

        const res1 = await processSinglePage(page, leagueName, targetDate, '1');
        allMatchData.push(...res1.matchData);
        finalImageBuffer = res1.imageBuffer;
        finalScreenshotPath = res1.screenshotPath;
        finalRawText = res1.rawText;
        if (res1.tokenStats) {
            cumulativeTokens.input += res1.tokenStats.input;
            cumulativeTokens.output += res1.tokenStats.output;
            cumulativeTokens.durationMs += res1.tokenStats.durationMs;
        }

        if (onPageCaptured) {
            await onPageCaptured(res1.screenshotPath, res1.matchData, 1);
        }

        // For historical dates the full day is always complete: min 4 pages.
        // For the current day, Claude's reading stands (results still streaming in).
        const aiDetectedPages = res1.totalPages || 1;
        const totalPages = isHistorical ? Math.max(aiDetectedPages, 4) : aiDetectedPages;
        console.log(`[Screenshot Service] Claude detected ${aiDetectedPages} pages. Using ${totalPages} (isHistorical=${isHistorical}).`);

        if (totalPages > 1) {
            console.log(`[Screenshot Service] Multi-page dynamic iteration up to page ${totalPages}.`);
            for (let i = 2; i <= totalPages; i++) {
                const pageNumStr = i.toString();
                if (uploadedPages.includes(pageNumStr) || uploadedPages.includes(i)) {
                    console.log(`[Screenshot Service] ⏭️ Skipping page ${pageNumStr} (already tracked in history logs)...`);
                    continue;
                }
                console.log(`[Screenshot Service] ⏱️ Yielding click command for Page ${pageNumStr}...`);
                
                const pBox = await page.evaluate((num) => {
                    const targets = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
                    const target = targets.find(t => t.textContent.trim() === num);
                    if (!target) return null;
                    target.scrollIntoView({ block: 'center' });
                    const rect = target.getBoundingClientRect();
                    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                }, pageNumStr);

                if (pBox) {
                    await page.mouse.click(pBox.x, pBox.y);
                } else {
                    // Fallback to DOM evaluation specifically for pagination since it's sometimes plain HTML
                    await page.evaluate((num) => {
                        const targets = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
                        const target = targets.find(t => t.textContent.trim() === num);
                        if (target) target.click();
                    }, pageNumStr);
                }

                await new Promise(r => setTimeout(r, 4500)); // wait for dom flush

                console.log(`[Screenshot Service] 📸 Slicing snapshot of Page ${pageNumStr}...`);
                const res = await processSinglePage(page, leagueName, targetDate, pageNumStr);
                allMatchData.push(...res.matchData);
                
                if (res.tokenStats) {
                    cumulativeTokens.input += res.tokenStats.input;
                    cumulativeTokens.output += res.tokenStats.output;
                    cumulativeTokens.durationMs += res.tokenStats.durationMs;
                    // Mirror latest rate limit barriers from the backend
                    cumulativeTokens.rpm = res.tokenStats.rpm;
                    cumulativeTokens.tpm = res.tokenStats.tpm;
                    cumulativeTokens.rpd = res.tokenStats.rpd;
                    cumulativeTokens.keyIndex  = res.tokenStats.keyIndex;
                    cumulativeTokens.totalKeys = res.tokenStats.totalKeys;
                }

                if (onPageCaptured) {
                    console.log(`[Screenshot Service] 🚀 Uploading Page ${pageNumStr} hook...`);
                    await onPageCaptured(res.screenshotPath, res.matchData, i);
                }

                finalImageBuffer = res.imageBuffer;
                finalScreenshotPath = res.screenshotPath;
                finalRawText += '\n' + res.rawText;
            }
        }

        await browser.close();
        console.log(`[Screenshot Service] ✅ Done! ${allMatchData.length} records parsed securely for ${leagueName}`);

        return {
            success: true,
            league: leagueName,
            dbLeague,
            screenshotPath: finalScreenshotPath,
            base64Image: finalImageBuffer ? `data:image/png;base64,${finalImageBuffer.toString('base64')}` : null,
            rawText: finalRawText || 'All pages were skipped or processed.',
            matchData: allMatchData,
            skippedAll: finalScreenshotPath === null,
            tokenStats: cumulativeTokens
        };

    } catch (err) {
        console.error(`[Firebase Index Debug/Error Details]: [Screenshot Service] ❌ Fatal exception trace:`, err.message);
        try { await browser.close(); } catch (_) { }
        return { success: false, error: err.message };
    }
}

module.exports = { captureLeagueResults };
