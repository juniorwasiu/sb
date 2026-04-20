const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function getChromePath() {
    const candidates = [
        process.env.CHROME_EXECUTABLE_PATH,
        '/usr/bin/chromium',
        '/usr/bin/google-chrome'
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return '/usr/bin/chromium';
}

// Utility: Click Exact Pixels by DOM Text Match
async function clickByText(page, textMatches, description) {
    console.log(`[Action] Locating '${description}'...`);
    const box = await page.evaluate((matches) => {
        const elements = Array.from(document.querySelectorAll('span, div, a, li'));
        const target = elements.find(el => {
            const txt = el.textContent.trim();
            // Must match exactly or contain, and be visible, and not be a giant container
            return matches.some(m => txt === m || txt.includes(m)) && el.children.length === 0 && el.offsetParent !== null;
        });
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        const rect = target.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, textMatches);

    if (box) {
        console.log(`[Action] Clicking exact pixels for ${description} at (${box.x}, ${box.y})`);
        if (box.y <= 768 && box.y >= 0) {
            await page.mouse.click(box.x, box.y);
            return true;
        } else {
            console.log(`[Warning] ${description} is off-screen. Using fallback direct click.`);
            await page.evaluate((matches) => {
                const elements = Array.from(document.querySelectorAll('span, div, a, li'));
                const target = elements.find(el => {
                    const txt = el.textContent.trim();
                    return matches.some(m => txt === m || txt.includes(m)) && el.children.length === 0 && el.offsetParent !== null;
                });
                if (target) target.click();
            }, textMatches);
            return true;
        }
    }
    console.log(`[Error] Could not find ${description}!`);
    return false;
}

// Utility: Click Dropdown by Index (0=Date, 1=Sport, 2=Category/League)
async function clickDropdownIndex(page, index, description) {
    console.log(`[Action] Opening Dropdown [${index}]: ${description}...`);
    const box = await page.evaluate((idx) => {
        const triggers = document.querySelectorAll('.select-index, .m-select-list .active, .m-select-wrapper span');
        if (triggers.length <= idx) return null;
        const target = triggers[idx];
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
    }, index);

    if (box) {
        await page.mouse.click(box.x, box.y);
        return true;
    }
    console.log(`[Error] Could not find dropdown at index ${index}.`);
    return false;
}

const targetDaysAgo = 0; 

// Generate date strings
const targetDateObj = new Date();
targetDateObj.setDate(targetDateObj.getDate() - targetDaysAgo);
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tMonth = shortMonths[targetDateObj.getMonth()];
const tDayNum = targetDateObj.getDate().toString();
const targetDateStr = `${tMonth} ${targetDateObj.getFullYear()}`;

const downloadPath = path.join(__dirname, 'testdownloadpage', 'today_headless');
if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

async function runFullVFootballScraper() {
    console.log(`\n=== vFootball Full Extractor | Target: ${targetDateStr} ${tDayNum} | Mode: HEADLESS ===\n`);
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: 'new', // Using new headless mode
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1366,768',
        ]
    });

    try {
        const page = await browser.newPage();
        // Since headless window sizes can be weird, force viewport
        await page.setViewport({ width: 1366, height: 768 });

        console.log("[Navigation] Loading liveResult...");
        await page.goto('https://www.sportybet.com/ng/liveResult/', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 4000));

        // 1. DATE SELECTION
        console.log(`\n[Phase 1] Date Selection`);
        await clickDropdownIndex(page, 0, "Date Picker");
        await new Promise(r => setTimeout(r, 1500));
        
        await page.evaluate(async (tMonth, tDay) => {
            const sleep = ms => new Promise(res => setTimeout(res, ms));
            const cal = document.querySelector('.vdp-datepicker__calendar');
            if (!cal) return;
            for (let i = 0; i < 24; i++) {
                const spans = Array.from(cal.querySelectorAll('header span'));
                const title = (spans.length >= 3 ? spans[1] : spans[0])?.textContent.trim();
                if (title && title.includes(tMonth)) break;
                const prev = cal.querySelector('header .prev') || spans[0];
                if (prev) { prev.click(); await sleep(400); }
            }
            await sleep(1000);
            const cells = Array.from(document.querySelectorAll('.vdp-datepicker__calendar .cell.day:not(.disabled):not(.blank)'));
            const cell = cells.find(c => c.textContent.trim() === tDay);
            if (cell) cell.click();
        }, targetDateStr, tDayNum);
        console.log(`Waiting for ${targetDateStr} ${tDayNum} games to load...`);
        await new Promise(r => setTimeout(r, 6000));

        // 2. VFOOTBALL SELECTION
        console.log(`\n[Phase 2] Selecting vFootball Sport`);
        await clickDropdownIndex(page, 1, "Sport Selection");
        await new Promise(r => setTimeout(r, 1500));
        
        const clickedVFB = await clickByText(page, ['vFootball'], 'vFootball');
        if (!clickedVFB) throw new Error("CRITICAL: Could not find or click vFootball option.");
        
        console.log(`Waiting for vFootball core interface to render...`);
        await new Promise(r => setTimeout(r, 6000));

        // Validate we are actually on vFootball before proceeding
        const pageHeader = await page.evaluate(() => document.body.innerText.substring(0, 300));
        if (!pageHeader.includes('vFootball')) {
            console.log(`[Warning] text validation of header didn't find 'vFootball'. Proceeding carefully...`);
        }

        // 3. LEAGUE ITERATION
        const targetLeagues = ['England', 'Italy', 'Spain', 'Germany'];

        for (const league of targetLeagues) {
            console.log(`\n======================================`);
            console.log(`[Phase 3] Processing League: ${league}`);
            console.log(`======================================`);

            // Open category dropdown
            await clickDropdownIndex(page, 2, "League/Category Dropdown");
            await new Promise(r => setTimeout(r, 1500));

            // Select specific league
            const clickedLeague = await clickByText(page, [league, `${league} League`, `${league} - Virtual`], league);
            if (!clickedLeague) {
                 console.log(`[Skip] Could not find category for ${league}. Moving to next...`);
                 continue;
            }

            console.log(`Waiting for ${league} tables to populate...`);
            await new Promise(r => setTimeout(r, 6000));

            // Verify with OCR if desired, but we will just check pages
            console.log(`\n[Phase 4] Checking Pagination for ${league}`);
            const pages = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
                return els.map(e => e.textContent.trim());
            });

            console.log(`Discovered ${pages.length} pages for ${league}: [${pages.join(', ')}]`);

            if (pages.length === 0) {
                // Single page fallback
                const spath = path.join(downloadPath, `vfootball_${league}_p1.png`);
                await page.screenshot({ path: spath, fullPage: true });
                console.log(`📸 Saved Single Page: ${spath}`);
            } else {
                // Loop through every page and screenshot
                for (const pNum of pages) {
                    console.log(`Navigating to ${league} -> Page ${pNum} ...`);
                    const pBox = await page.evaluate((num) => {
                        const targets = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
                        const target = targets.find(t => t.textContent.trim() === num);
                        if (!target) return null;
                        target.scrollIntoView({ block: 'center' });
                        const rect = target.getBoundingClientRect();
                        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                    }, pNum);

                    if (pBox) {
                        await page.mouse.click(pBox.x, pBox.y);
                    } else {
                        // fallback native click
                        await page.evaluate((num) => {
                            const targets = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
                            const target = targets.find(t => t.textContent.trim() === num);
                            if (target) target.click();
                        }, pNum);
                    }

                    console.log(`Waiting for table ${pNum} to render...`);
                    await new Promise(r => setTimeout(r, 4500));

                    const spath = path.join(downloadPath, `vfootball_${league}_p${pNum}.png`);
                    await page.screenshot({ path: spath, fullPage: true });
                    console.log(`📸 Saved Multi-Page Screenshot: ${spath}`);
                }
            }
        }

        console.log(`\n=== All Leagues Processed Successfully! ===`);
    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        await browser.close();
    }
}

runFullVFootballScraper();
