const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto('https://www.sportybet.com/ng/virtual/football', { waitUntil: 'networkidle2', timeout: 35000 });
        await new Promise(r => setTimeout(r, 4000));
        
        const data = await page.evaluate(() => {
            const text = document.body.innerText;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            
            // Look for round numbers, live status, or timestamps
            const roundLines = lines.filter(l => /round|live|match/i.test(l)).slice(0, 20);
            
            // Look for all time patterns HH:MM
            const times = lines.filter(l => /^\d{2}:\d{2}$/.test(l));
            
            return {
                title: document.title,
                roundLines,
                times: [...new Set(times)]
            };
        });
        
        console.log('=== INSPECTION DATA ===');
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        if (browser) await browser.close();
    }
})();
