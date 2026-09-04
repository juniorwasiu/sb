const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.goto('https://www.sportybet.com/ng/sport/vFootball?betslipMode=real', { waitUntil: 'networkidle2', timeout: 35000 });
        await new Promise(r => setTimeout(r, 4000));
        
        const pageInfo = await page.evaluate(() => {
            // Find any elements mentioning live, inplay, score, or match
            const allElements = Array.from(document.querySelectorAll('*'));
            const liveCandidates = allElements.filter(el => {
                const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
                return cls.includes('live') || cls.includes('tracker') || cls.includes('player') || cls.includes('score') || cls.includes('video');
            });
            
            const liveSnippets = liveCandidates.slice(0, 15).map(el => ({
                tag: el.tagName,
                className: el.className,
                text: (el.innerText || '').slice(0, 100)
            }));
            
            // Check top banner or scoreboard text
            const headerText = document.querySelector('header, [class*="header"], [class*="banner"]')?.innerText || '';
            
            return {
                title: document.title,
                url: window.location.href,
                liveSnippets,
                headerText: headerText.slice(0, 200)
            };
        });
        
        console.log(JSON.stringify(pageInfo, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        if (browser) await browser.close();
    }
})();
