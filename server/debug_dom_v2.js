const puppeteer = require('puppeteer-core');
const fs = require('fs');

function getChromePath() {
    const p = '/usr/bin/google-chrome';
    return fs.existsSync(p) ? p : '/usr/bin/chromium';
}

async function debugDom() {
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: 'new',
        args: ['--no-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        console.log("Loading page...");
        await page.goto('https://www.sportybet.com/ng/liveResult/', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 5000));

        // Note: For debugging, we just dump what's there before any complex navigation
        // because the user said they correctly navigate up to league selection.
        // We'll just assume the results are there for *some* league by default or we'll click something.
        
        const htmlDump = await page.evaluate(() => {
            const list = document.querySelector('dl.list');
            if (!list) return "dl.list NOT FOUND";
            
            const firstRow = list.querySelector('ul.result-event');
            if (!firstRow) return "ul.result-event NOT FOUND inside dl.list. HTML of dl.list: " + list.innerHTML.substring(0, 1000);
            
            return "Found Row! HTML: " + firstRow.outerHTML;
        });

        console.log("DOM DUMP:", htmlDump);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

debugDom();
