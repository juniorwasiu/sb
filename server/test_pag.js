const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Helper to determine yesterday's day
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tMonth = shortMonths[yesterday.getMonth()];
const tDayNum = yesterday.getDate().toString();

const downloadPath = path.join(__dirname, 'testdownloadpage', 'pagination_test');
if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

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
    throw new Error('Chrome not found');
}

async function run() {
    console.log(`[Test] Launching headless browser to test pagination for ${tMonth} ${tDayNum}...`);
    
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: true,
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1366,768'
        ]
    });
    
    const page = await browser.newPage();
    
    console.log("[Test] Navigating to SportyBet liveResult...");
    await page.goto('https://www.sportybet.com/ng/liveResult/', { waitUntil: 'networkidle2', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 4000));
    
    console.log(`[Test] Selecting Date: ${tMonth} ${tDayNum}`);
    const clickedPicker = await page.evaluate(() => {
        const firstSelectList = document.querySelector('.m-select-list');
        if (firstSelectList) {
            const selectIndex = firstSelectList.querySelector('.select-index');
            if (selectIndex) {
                selectIndex.click();
                return true;
            }
        }
        return false;
    });
    
    if (clickedPicker) {
        await new Promise(r => setTimeout(r, 2000));
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
            await sleep(1000);
            const cells = Array.from(document.querySelectorAll('.vdp-datepicker__calendar .cell.day:not(.disabled):not(.blank)'));
            const cell = cells.find(c => c.textContent.trim() === targetDayNum);
            if (cell) cell.click();
        }, tMonth, tDayNum);
        
        await new Promise(r => setTimeout(r, 6000));
    }
    
    console.log("[Test] Selecting vFootball...");
    await page.evaluate(() => {
        const sportSelects = document.querySelectorAll('.m-select-list');
        if (sportSelects.length > 1) {
            const selectIndex = sportSelects[1].querySelector('.select-index, .active');
            if (selectIndex) selectIndex.click(); 
        }
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('.option .list a, .option .list li, span'));
        const vfb = options.find(o => o.textContent.trim() === 'vFootball');
        if (vfb) vfb.click();
    });
    await new Promise(r => setTimeout(r, 6000));
    
    console.log("[Test] Selecting England League Category...");
    await page.evaluate(() => {
        const sportSelects = document.querySelectorAll('.m-select-list');
        if (sportSelects.length > 2) {
                const selectIndex = sportSelects[2].querySelector('.select-index, .active');
                if (selectIndex) selectIndex.click(); 
        } else {
                const allSelectIndexes = Array.from(document.querySelectorAll('.select-index, .active'));
                const cat = allSelectIndexes.find(el => el.textContent.trim().includes('Category'));
                if(cat) cat.click();
        }
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('.option .list a, .option .list li, span'));
        const target = options.find(o => o.textContent.trim().includes('England'));
        if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 6000));
    
    console.log("[Test] Extracting available pages from pagination...");
    const pages = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
        return els.map(e => e.textContent.trim());
    });
    
    console.log(`[Test] Discovered ${pages.length} pages: ${pages.join(', ')}`);
    
    if (pages.length === 0) {
        console.log("[Test] No multi-page pagination found. Capturing single page.");
        await page.screenshot({ path: path.join(downloadPath, 'yesterday_p1.png'), fullPage: true });
    } else {
        // Iterate through all pages
        for (let i = 0; i < pages.length; i++) {
            const pageNum = pages[i];
            console.log(`[Test] Click -> Page ${pageNum}...`);
            await page.evaluate((num) => {
                const targets = Array.from(document.querySelectorAll('.pagination .pageNum:not(.icon-prev):not(.icon-next)'));
                const target = targets.find(t => t.textContent.trim() === num);
                if (target) target.click();
            }, pageNum);
            
            // Wait for results to update via dom check or simply sleep
            console.log(`[Test] Waiting for table to render page ${pageNum}...`);
            await new Promise(r => setTimeout(r, 5000));
            
            const spath = path.join(downloadPath, `yesterday_p${pageNum}.png`);
            console.log(`[Test] Saving screenshot to ${spath}`);
            await page.screenshot({ path: spath, fullPage: true });
            
            // Just double check we have matches
            const rowCount = await page.evaluate(() => document.querySelectorAll('tr, [class*="row"], [class*="item"]').length);
            console.log(`[Test] Page ${pageNum} has ${rowCount} table rows.`);
        }
    }
    
    console.log(`[Test] Done! Check ${downloadPath}`);
    await browser.close();
}

run().catch(err => {
    console.error("[Test Error] =>", err);
    process.exit(1);
});
