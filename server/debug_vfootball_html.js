const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: 'new',
        args: ['--start-maximized', '--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('https://www.sportybet.com/ng/liveResult/', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));
    
    // Quick navigation to vfootball -> england
    const box1 = await page.evaluate(() => { const els = document.querySelectorAll('.select-index'); return els[1] ? els[1].getBoundingClientRect() : null; });
    await page.mouse.click(box1.x + box1.width/2, box1.y + box1.height/2);
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => { const os = Array.from(document.querySelectorAll('span, li')); const o = os.find(x => x.textContent.trim() === 'vFootball'); if(o) o.click(); });
    await new Promise(r => setTimeout(r, 4000));
    
    const box2 = await page.evaluate(() => { const els = document.querySelectorAll('.select-index'); return els[2] ? els[2].getBoundingClientRect() : null; });
    await page.mouse.click(box2.x + box2.width/2, box2.y + box2.height/2);
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => { const os = Array.from(document.querySelectorAll('span, li')); const o = os.find(x => x.textContent.trim() === 'England' || x.textContent.trim().includes('England League')); if(o) o.click(); });
    await new Promise(r => setTimeout(r, 4000));

    const html = await page.evaluate(() => {
        const table = document.querySelector('.m-table');
        return table ? table.outerHTML : 'No .m-table found';
    });
    console.log(html.substring(0, 5000));
    await browser.close();
})();
