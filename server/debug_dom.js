const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto("https://www.sportybet.com/ng/liveResult/", { waitUntil: 'networkidle2', timeout: 60000 });
    
    const html = await page.evaluate(() => {
        const selects = document.querySelectorAll('.m-select');
        let dump = [];
        selects.forEach(s => {
            dump.push(s.parentElement.outerHTML);
        });
        return dump;
    });

    console.log(JSON.stringify(html, null, 2));
    await browser.close();
})();
