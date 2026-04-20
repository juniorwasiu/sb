const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

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

async function testClicker() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: false,
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1366,768',
        ]
    });

    try {
        const page = await browser.newPage();
        
        console.log("Navigating to liveResult...");
        await page.goto('https://www.sportybet.com/ng/liveResult/', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));

        console.log("Clicking Football...");
        await page.evaluate(() => {
            const fb = Array.from(document.querySelectorAll('span, div')).find(el => el.textContent.trim() === 'Football' && el.children.length === 0);
            if (fb) fb.click();
        });
        
        await new Promise(r => setTimeout(r, 2000));

        console.log("Clicking vFootball...");
        await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('.option .list a, .option .list li, span, div, a')).filter(el => !el.closest('header, nav, .m-header, .top-nav, .m-nav, .layout-header'));
            const vfb = options.find(o => o.textContent.trim() === 'vFootball' && o.children.length === 0);
            if (vfb) vfb.click();
        });
        
        await new Promise(r => setTimeout(r, 5000));

        console.log("Checking dropdowns after vFootball load...");
        const selectsHtml = await page.evaluate(() => {
            const lists = document.querySelectorAll('.m-select-list');
            return Array.from(lists).map(l => l.outerHTML).join('\n---\n');
        });
        fs.writeFileSync('debug_selects.html', selectsHtml);
        await page.screenshot({ path: 'debug_vfootball.png', fullPage: true });

        console.log("Done checking dropdowns.");

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

testClicker();
