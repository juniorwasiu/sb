const puppeteer = require('puppeteer-core');

async function main() {
    console.log('[Debug] Launching browser...');
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36');
    
    console.log('[Debug] Navigating to live list...');
    await page.goto('https://www.sportybet.com/ng/m/sport/vFootball/live_list', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    
    const results = await page.evaluate(() => {
        const groups = [];
        // The leagues are usually inside .m-league
        const leagueNodes = document.querySelectorAll('.m-league');
        leagueNodes.forEach(leagueNode => {
            const leagueNameNode = leagueNode.querySelector('.m-league-title .text');
            if (!leagueNameNode) return;
            const leagueName = leagueNameNode.innerText.trim();
            
            const matches = [];
            
            // Look for in-play matches (they have .m-live-row and .m-live-table.margin-xs)
            // Actually, each match block is usually a div with data-key="sr:match:..."
            const matchBlocks = leagueNode.querySelectorAll('div[data-key]');
            matchBlocks.forEach(block => {
                const timeNode = block.querySelector('.m-event-time');
                const timeStr = timeNode ? timeNode.innerText.trim() : '';
                
                // In-play matches have team names in .m-info-cell .team
                const teams = block.querySelectorAll('.m-info-cell .team');
                
                // Score 
                const scores = block.querySelectorAll('.set-score');
                
                // Odds
                const oddsNodes = block.querySelectorAll('.m-odds-value');
                
                if (teams.length >= 2) {
                    matches.push({
                        status: 'IN-PLAY',
                        time: timeStr,
                        home: teams[0].innerText.trim(),
                        away: teams[1].innerText.trim(),
                        homeScore: scores.length >= 1 ? scores[0].innerText.trim() : '-',
                        awayScore: scores.length >= 2 ? scores[1].innerText.trim() : '-',
                        odds: Array.from(oddsNodes).map(n => n.innerText.trim()).join(' ')
                    });
                } else {
                    // It might be an upcoming match
                    const prematchTeams = block.querySelectorAll('.m-sports-table .team');
                    const preTimeNode = block.querySelector('.m-time');
                    const gameIdNode = block.querySelector('.m-game-id');
                    
                    if (prematchTeams.length >= 2) {
                        matches.push({
                            status: 'UPCOMING',
                            time: preTimeNode ? preTimeNode.innerText.trim() : '',
                            code: gameIdNode ? gameIdNode.innerText.trim().replace('ID ', '') : '',
                            home: prematchTeams[0].innerText.trim(),
                            away: prematchTeams[1].innerText.trim(),
                            odds: Array.from(oddsNodes).map(n => n.innerText.trim()).join(' ')
                        });
                    }
                }
            });
            
            if (matches.length > 0) {
                groups.push({ league: leagueName, matches });
            }
        });
        
        // Also look for Upcoming Live if they are separated
        const upcomingLiveSection = document.querySelector('.m-live-upcoming');
        if (upcomingLiveSection) {
            const rows = upcomingLiveSection.querySelectorAll('.m-sports-row');
            let upcomingMatches = [];
            rows.forEach(row => {
                const preTimeNode = row.querySelector('.m-time');
                const gameIdNode = row.querySelector('.m-game-id');
                const lgNode = row.querySelector('.m-league-name');
                const teams = row.querySelectorAll('.m-info-cell .team');
                const oddsNodes = row.querySelectorAll('.m-odds-value');
                
                if (teams.length >= 2) {
                    upcomingMatches.push({
                        status: 'UPCOMING',
                        league: lgNode ? lgNode.innerText.trim() : 'Unknown',
                        time: preTimeNode ? preTimeNode.innerText.trim() : '',
                        code: gameIdNode ? gameIdNode.innerText.trim().replace('ID ', '') : '',
                        home: teams[0].innerText.trim(),
                        away: teams[1].innerText.trim(),
                        odds: Array.from(oddsNodes).map(n => n.innerText.trim()).join(' ')
                    });
                }
            });
            
            // Group them by league
            const map = {};
            upcomingMatches.forEach(m => {
                if (!map[m.league]) map[m.league] = [];
                map[m.league].push(m);
            });
            
            Object.keys(map).forEach(lg => {
                groups.push({ league: lg + ' (Upcoming)', matches: map[lg] });
            });
        }
        
        return groups;
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
}
main();
