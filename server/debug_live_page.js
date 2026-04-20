/**
 * debug_live_page.js
 * 
 * One-shot debug script: navigates to the SportyBet vFootball betslip page,
 * waits for content to render, then dumps:
 *   1. First 3000 chars of body.innerText
 *   2. All match-related elements found by candidate selectors
 *   3. A screenshot saved to testdownloadpage/live_debug.png
 * 
 * Run with: node debug_live_page.js
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = (() => {
    const candidates = [
        process.env.CHROME_EXECUTABLE_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return '/usr/bin/google-chrome';
})();

(async () => {
    console.log('[DEBUG-LIVE] Using Chrome:', CHROME);
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: false,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1366,768',
        ],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Intercept XHR/fetch to find the real odds API endpoint
    page.on('response', async (response) => {
        const url = response.url();
        const type = response.request().resourceType();
        if ((type === 'xhr' || type === 'fetch') && url.includes('sportybet')) {
            console.log('[NETWORK]', response.status(), url.substring(0, 120));
            try {
                const ct = response.headers()['content-type'] || '';
                if (ct.includes('json')) {
                    const json = await response.json();
                    const preview = JSON.stringify(json).substring(0, 400);
                    console.log('[NETWORK JSON PREVIEW]', preview);
                }
            } catch (_) {}
        }
    });

    const TARGET = 'https://www.sportybet.com/ng/sport/vFootball?betslipMode=real';
    console.log('[DEBUG-LIVE] Navigating to:', TARGET);

    try {
        await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
    } catch (e) {
        console.warn('[DEBUG-LIVE] Navigation timeout or error — continuing anyway:', e.message);
    }

    console.log('[DEBUG-LIVE] Waiting 5s for SPA to render...');
    await new Promise(r => setTimeout(r, 5000));

    // Screenshot
    const ssDir = path.join(__dirname, 'testdownloadpage');
    if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
    const ssPath = path.join(ssDir, 'live_debug.png');
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log('[DEBUG-LIVE] Screenshot saved:', ssPath);

    // Dump body text (first 3000 chars)
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\n===== BODY TEXT (first 3000 chars) =====');
    console.log(bodyText.substring(0, 3000));
    console.log('=========================================\n');

    // Try to find match elements by various candidate selectors
    const candidates = [
        '.m-list',             // SportyBet generic list
        '.match-item',
        '.event-item',
        '[class*="game"]',
        '[class*="match"]',
        '[class*="event"]',
        '[class*="odds"]',
        '[class*="virtual"]',
        '[class*="vfootball"]',
        '.betslip-item',
        '.sport-event',
        '[data-event-id]',
        '[data-game-id]',
        '[data-market]',
    ];

    console.log('===== CANDIDATE SELECTOR SEARCH =====');
    for (const sel of candidates) {
        const count = await page.evaluate((s) => document.querySelectorAll(s).length, sel);
        if (count > 0) {
            console.log(`  FOUND: "${sel}" → ${count} elements`);
            // Dump first element's text
            const txt = await page.evaluate((s) => {
                const el = document.querySelector(s);
                return el ? el.innerText.substring(0, 200) : '';
            }, sel);
            if (txt) console.log(`    First element text: ${txt.replace(/\n/g, ' | ')}`);
        }
    }
    console.log('=====================================\n');

    // Dump all class names on the page (top 60 unique)
    const classNames = await page.evaluate(() => {
        const names = new Set();
        document.querySelectorAll('[class]').forEach(el => {
            el.className.split(' ').forEach(c => { if (c.trim()) names.add(c.trim()); });
        });
        return [...names].slice(0, 80);
    });
    console.log('===== TOP CLASS NAMES ON PAGE =====');
    console.log(classNames.join(', '));
    console.log('===================================\n');

    await browser.close();
    console.log('[DEBUG-LIVE] Done.');
})();
