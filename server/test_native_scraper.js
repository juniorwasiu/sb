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

async function extractMatchesFromDom(page, leagueName) {
    console.log(`[Extraction] Waiting for match rows...`);
    try {
        await page.waitForSelector('ul.result-event', { timeout: 15000 });
        console.log(`[Extraction] ✅ Found at least one ul.result-event.`);
    } catch (e) {
        console.log(`[Extraction] ⚠️ No matches found (timeout). Taking error screenshot...`);
        await page.screenshot({ path: 'extraction_error.png' });
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log(`[Extraction] Page head text: ${bodyText}`);
        return [];
    }

    const debugInfo = await page.evaluate(() => {
        const first = document.querySelector('ul.result-event');
        return first ? first.outerHTML : "NOT FOUND";
    });
    console.log(`[Extraction] First Row Row HTML: ${debugInfo.substring(0, 300)}...`);

    return await page.evaluate((league) => {
        const matches = [];
        const rows = Array.from(document.querySelectorAll('ul.result-event'));
        
        rows.forEach((row, idx) => {
            const timeEl = row.querySelector('.time');
            const gameIdEl = row.querySelector('.gameId');
            const homeEl = row.querySelector('.home');
            const awayEl = row.querySelector('.away');
            const scoreEl = row.querySelector('.score .score-com') || row.querySelector('.score .score-con') || row.querySelector('.score');

            if (timeEl && gameIdEl && homeEl && awayEl && scoreEl) {
                const fullTimeText = timeEl.innerText.trim(); // "16/04/2026\n23:48"
                let date = '';
                let time = '';
                
                if (fullTimeText.includes('\n')) {
                    [date, time] = fullTimeText.split('\n');
                } else if (fullTimeText.includes(' ')) {
                    [date, time] = fullTimeText.split(' ');
                } else {
                    time = fullTimeText;
                    date = new Date().toLocaleDateString('en-GB');
                }
                
                matches.push({
                    time: time.trim(),
                    date: date.trim(), 
                    gameId: gameIdEl.innerText.trim(),
                    homeTeam: homeEl.innerText.trim(),
                    awayTeam: awayEl.innerText.trim(),
                    score: scoreEl.innerText.trim().replace(/\s/g, '').replace(':', '-'),
                    league: league
                });
            }
        });
        return matches;
    }, leagueName);
}

async function runNativeScraper() {
    const targetLeagues = ['England', 'Italy', 'Spain', 'Germany'];
    
    console.log(`\n=== vFootball Multi-League Native Extractor ===\n`);
    
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: 'new',
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        console.log("[Navigation] Loading liveResult...");
        await page.goto('https://www.sportybet.com/ng/liveResult/', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 4000));

        // 1. DATE SELECTION
        console.log(`[Phase 1] Date Selection (Today)`);
        
        // 2. VFOOTBALL SELECTION
        console.log(`[Phase 2] Selecting vFootball Sport`);
        await clickDropdownIndex(page, 1, "Sport Selection");
        await new Promise(r => setTimeout(r, 1500));
        await clickByText(page, ['vFootball'], 'vFootball');
        await new Promise(r => setTimeout(r, 4000));

        for (const league of targetLeagues) {
            console.log(`\n======================================`);
            console.log(`[Phase 3] Processing League: ${league}`);
            console.log(`======================================`);

            // Open league dropdown
            await clickDropdownIndex(page, 2, "League/Category Dropdown");
            await new Promise(r => setTimeout(r, 1500));

            // Select league
            const clickedLeague = await clickByText(page, [league, `${league} League`, `${league} - Virtual`], league);
            if (!clickedLeague) {
                console.log(`[Skip] Could not find category for ${league}.`);
                continue;
            }

            console.log(`Waiting for ${league} data to load...`);
            await new Promise(r => setTimeout(r, 6000));

            // 4. EXTRACTION LOOP WITH PAGINATION
            let hasNextPage = true;
            let pageCount = 1;

            while (hasNextPage) {
                console.log(`\n--- ${league} | Page ${pageCount} ---`);
                const pageMatches = await extractMatchesFromDom(page, `${league} - Virtual`);
                
                if (pageMatches.length > 0) {
                    const fileName = `native_extract_${league.toLowerCase()}_p${pageCount}.json`;
                    fs.writeFileSync(fileName, JSON.stringify(pageMatches, null, 2));
                    console.log(`✅ Saved ${pageMatches.length} matches to ${fileName}`);
                } else {
                    console.log(`⚠️ No matches found for ${league} on page ${pageCount}.`);
                }

                // Pagination Check
                const paginationInfo = await page.evaluate(() => {
                    const nextBtn = document.querySelector('div.pagination span.icon-next');
                    if (!nextBtn) return { exists: false };
                    const isDisabled = nextBtn.classList.contains('icon-disabled') || nextBtn.closest('.disabled') !== null;
                    return { exists: true, isDisabled };
                });

                if (paginationInfo.exists && !paginationInfo.isDisabled) {
                    console.log(`[Pagination] Clicking Next...`);
                    await page.evaluate(() => {
                        const nextBtn = document.querySelector('div.pagination span.icon-next');
                        if (nextBtn) nextBtn.click();
                    });
                    await new Promise(r => setTimeout(r, 3500)); // wait for load
                    pageCount++;
                } else {
                    console.log(`[Pagination] End of results for ${league}.`);
                    hasNextPage = false;
                }
                
                if (pageCount > 15) break;
            }
        }

        console.log(`\n=== ALL LEAGUES COMPLETE ===`);

    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        await browser.close();
    }
}

runNativeScraper();
