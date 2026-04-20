const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1513, height: 750 });
    
    console.log("Navigating...");
    await page.goto("https://www.sportybet.com/ng/liveResult/", { waitUntil: 'networkidle2', timeout: 60000 });
    await page.screenshot({ path: "testdownloadpage/debug_1_initial.png", fullPage: true });
    
    // Attempt to open the sport dropdown
    console.log("Finding Sportybet select lists...");
    const filters = await page.$$('.m-results-filter-item');
    console.log("Found filter items length:", filters.length);
    
    if (filters.length >= 2) {
        // Evaluate the second filter item's content:
        const innerHTML = await page.evaluate(el => el.innerHTML, filters[1]);
        console.log("Second filter item innerHTML:", innerHTML.substring(0, 500));
        
        const mSelect = await filters[1].$('.m-select');
        if (mSelect) {
            console.log("Clicking the sport .m-select");
            const box = await mSelect.boundingBox();
            console.log("Bounding box is:", box);
            await mSelect.click();
            await new Promise(r => setTimeout(r, 1000));
            await page.screenshot({ path: "testdownloadpage/debug_2_sport_clicked.png", fullPage: true });
            
            console.log("Finding vFootball...");
            // Let's try native click on the link directly
            const links = await page.$$('.m-results-filter-item:nth-child(2) ul.list a');
            console.log("Found links inside sport dropdown length:", links.length);
            
            let clicked = false;
            for (let link of links) {
                const text = await page.evaluate(el => el.textContent.trim(), link);
                if (text === 'vFootball') {
                    console.log("Clicking vFootball Link!");
                    await link.click();
                    clicked = true;
                    break;
                }
            }
            if (!clicked) console.log("vFootball link not found directly...");
            
            await new Promise(r => setTimeout(r, 2000));
            await page.screenshot({ path: "testdownloadpage/debug_3_vfootball_selected.png", fullPage: true });
        } else {
            console.log("m-select inside 2nd filter item not found!");
        }
    }
    
    if (filters.length >= 3) {
        console.log("Clicking Category dropdown...");
        const catSelect = await filters[2].$('.m-select');
        if (catSelect) {
            await catSelect.click();
            await new Promise(r => setTimeout(r, 1000));
            await page.screenshot({ path: "testdownloadpage/debug_4_cat_clicked.png", fullPage: true });
            
            const links = await page.$$('.m-results-filter-item:nth-child(3) ul.list a');
            console.log("Found links inside cat dropdown length:", links.length);
            
            for (let link of links) {
                const text = await page.evaluate(el => el.textContent.trim(), link);
                if (text.includes('England')) {
                    console.log("Clicking England Link!");
                    await link.click();
                    break;
                }
            }
            
            await new Promise(r => setTimeout(r, 2000));
            await page.screenshot({ path: "testdownloadpage/debug_5_england_selected.png", fullPage: true });
        }
    }

    console.log("Done.");
    await browser.close();
})();
