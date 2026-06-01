const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

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

(async () => {
    console.log('[PROBE-CALENDAR] Launching browser...');
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        
        console.log('[PROBE-CALENDAR] Navigating to SportyBet liveResult page...');
        await page.goto('https://www.sportybet.com/ng/liveResult/', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });
        
        console.log('[PROBE-CALENDAR] Waiting 5s for page content...');
        await new Promise(r => setTimeout(r, 5000));
        
        console.log('[PROBE-CALENDAR] Opening datepicker...');
        const opened = await page.evaluate(() => {
            const triggers = document.querySelectorAll('.select-index, .m-select-list .active, .m-select-wrapper span, .m-select');
            if (triggers.length > 0) {
                const target = triggers[0];
                target.scrollIntoView({ block: 'center' });
                target.click();
                return true;
            }
            return false;
        });
        
        if (!opened) {
            console.log('[PROBE-CALENDAR] Failed to find or click date picker dropdown!');
            return;
        }
        
        console.log('[PROBE-CALENDAR] Date picker clicked. Waiting 2s for calendar...');
        await new Promise(r => setTimeout(r, 2000));
        
        const headerInfo = await page.evaluate(() => {
            const calendar = document.querySelector('.vdp-datepicker__calendar');
            if (!calendar) return { error: 'Calendar element not found!' };
            
            const header = calendar.querySelector('header');
            if (!header) return { error: 'Header not found inside calendar!' };
            
            const spans = Array.from(header.querySelectorAll('span'));
            const spanDetails = spans.map((s, idx) => ({
                index: idx,
                tagName: s.tagName,
                className: s.className,
                innerText: s.innerText,
                textContent: s.textContent,
                outerHTML: s.outerHTML
            }));
            
            const allHeaderChildren = Array.from(header.children).map((c, idx) => ({
                index: idx,
                tagName: c.tagName,
                className: c.className,
                innerText: c.innerText,
                textContent: c.textContent,
                outerHTML: c.outerHTML
            }));
            
            return {
                headerHTML: header.outerHTML,
                spanDetails,
                allHeaderChildren
            };
        });
        
        console.log('\n--- DATEPICKER HEADER INFO ---');
        console.log(JSON.stringify(headerInfo, null, 2));
        console.log('------------------------------\n');
        
    } catch (err) {
        console.error('[PROBE-CALENDAR] Error occurred:', err);
    } finally {
        await browser.close();
        console.log('[PROBE-CALENDAR] Browser closed.');
    }
})();
