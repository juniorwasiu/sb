require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDb } = require('./db_init');
const { getCachedDocs, parseDDMMYYYY } = require('./db_reader');

async function run() {
    console.log('[Dump] Connecting to DB...');
    await connectDb();
    
    console.log('[Dump] Fetching all results...');
    const allResults = await getCachedDocs();
    console.log(`[Dump] Found ${allResults.length} total matches.`);

    // ── Step 1: Group and sort chronologically by team ─────────────────────
    const teamMatchMap = {};

    for (const m of allResults) {
        if (!m.score || !/^\d+[:\-]\d+$/.test(m.score.trim())) continue;
        const lg = m.league || 'Unknown';
        
        // Convert DD/MM/YYYY to actual Date object for strict chronological sorting
        let parsedDate = parseDDMMYYYY(m.date);
        parsedDate = parsedDate && !isNaN(parsedDate.getTime()) 
            ? new Date(parsedDate.getTime() + (m.time ? parseInt(m.time.split(':')[0])*60000*60 + parseInt(m.time.split(':')[1])*60000 : 0)) 
            : new Date(0);

        if (!teamMatchMap[lg]) teamMatchMap[lg] = {};

        const addEntry = (team, isHome) => {
            if (!team) return;
            if (!teamMatchMap[lg][team]) teamMatchMap[lg][team] = [];
            teamMatchMap[lg][team].push({ ...m, isHome, parsedDate });
        };
        addEntry(m.homeTeam, true);
        addEntry(m.awayTeam, false);
    }

    // Sort each team's matches chronologically
    for (const lg of Object.keys(teamMatchMap)) {
        for (const team of Object.keys(teamMatchMap[lg])) {
            teamMatchMap[lg][team].sort((a, b) => a.parsedDate - b.parsedDate);
        }
    }

    // ── Step 2: Compute pattern statistics ────────────────────────────────
    const patternStore = {};
    const flatPatterns = [];

    for (const lg of Object.keys(teamMatchMap)) {
        patternStore[lg] = {};
        for (const team of Object.keys(teamMatchMap[lg])) {
            const matches = teamMatchMap[lg][team];
            for (let i = 0; i < matches.length - 1; i++) {
                const cur = matches[i];
                const nxt = matches[i+1];
                const score = cur.score.replace('-', ':').trim();
                const role = cur.isHome ? 'Home' : 'Away';

                if (!patternStore[lg][score]) patternStore[lg][score] = {};
                if (!patternStore[lg][score][role]) patternStore[lg][score][role] = {};
                if (!patternStore[lg][score][role][team]) {
                    patternStore[lg][score][role][team] = {
                        total: 0, nextWin: 0, nextLoss: 0, nextDraw: 0,
                        nextOver15: 0, nextOver25: 0, nextGG: 0,
                        nextHomeOver05: 0, nextAwayOver05: 0
                    };
                }

                const st = patternStore[lg][score][role][team];
                st.total++;

                const np = nxt.score.replace('-', ':').split(':').map(Number);
                const ngf = nxt.isHome ? np[0] : np[1];
                const nga = nxt.isHome ? np[1] : np[0];
                const ntg = ngf + nga;

                if (ngf > nga) st.nextWin++;
                else if (ngf < nga) st.nextLoss++;
                else st.nextDraw++;
                if (ntg > 1.5) st.nextOver15++;
                if (ntg > 2.5) st.nextOver25++;
                if (ngf > 0 && nga > 0) st.nextGG++;
                if (np[0] > 0) st.nextHomeOver05++;
                if (np[1] > 0) st.nextAwayOver05++;
            }
        }
    }

    // ── Step 3: Flatten for easy CSV/JSON analysis ────────────────────────
    for (const lg of Object.keys(patternStore)) {
        for (const score of Object.keys(patternStore[lg])) {
            for (const role of Object.keys(patternStore[lg][score])) {
                for (const team of Object.keys(patternStore[lg][score][role])) {
                    const st = patternStore[lg][score][role][team];
                    
                    // Only include patterns that have happened at least 3 times
                    if (st.total >= 3) {
                        flatPatterns.push({
                            League: lg,
                            Team: team,
                            TriggerScore: score,
                            TriggerRole: role,
                            SampleSize: st.total,
                            NextWin_Pct: Math.round((st.nextWin / st.total) * 100),
                            NextLoss_Pct: Math.round((st.nextLoss / st.total) * 100),
                            NextDraw_Pct: Math.round((st.nextDraw / st.total) * 100),
                            NextOver15_Pct: Math.round((st.nextOver15 / st.total) * 100),
                            NextOver25_Pct: Math.round((st.nextOver25 / st.total) * 100),
                            NextGG_Pct: Math.round((st.nextGG / st.total) * 100),
                            NextHomeScore_Pct: Math.round((st.nextHomeOver05 / st.total) * 100),
                            NextAwayScore_Pct: Math.round((st.nextAwayOver05 / st.total) * 100),
                            
                            // Raw hits
                            Hits_NextWin: st.nextWin,
                            Hits_NextLoss: st.nextLoss,
                            Hits_NextDraw: st.nextDraw,
                            Hits_NextOver15: st.nextOver15,
                            Hits_NextOver25: st.nextOver25,
                            Hits_NextGG: st.nextGG,
                            Hits_NextHomeScore: st.nextHomeOver05,
                            Hits_NextAwayScore: st.nextAwayOver05
                        });
                    }
                }
            }
        }
    }

    // Sort by Sample Size descending, then by best probability (just for ordering)
    flatPatterns.sort((a, b) => b.SampleSize - a.SampleSize);

    const jsonPath = path.join(__dirname, 'all_pattern_stats.json');
    fs.writeFileSync(jsonPath, JSON.stringify(flatPatterns, null, 2));

    // Also write a CSV for easy Excel viewing
    const csvHeaders = Object.keys(flatPatterns[0] || {}).join(',');
    const csvRows = flatPatterns.map(p => Object.values(p).join(','));
    const csvPath = path.join(__dirname, 'all_pattern_stats.csv');
    fs.writeFileSync(csvPath, [csvHeaders, ...csvRows].join('\n'));

    console.log(`[Dump] ✅ Dumped ${flatPatterns.length} pattern profiles to ${jsonPath} and ${csvPath}`);

    // Print summary stats for analysis
    const totalPatterns = flatPatterns.length;
    const over80Count = flatPatterns.filter(p => 
        p.NextWin_Pct >= 80 || p.NextLoss_Pct >= 80 || p.NextDraw_Pct >= 80 ||
        p.NextOver15_Pct >= 80 || p.NextOver25_Pct >= 80 || p.NextGG_Pct >= 80 ||
        p.NextHomeScore_Pct >= 80 || p.NextAwayScore_Pct >= 80
    ).length;

    console.log(`\n=== SUMMARY OF PATTERNS (Min 3 Samples) ===`);
    console.log(`Total Unique Trigger Patterns Generated: ${totalPatterns}`);
    console.log(`Patterns that meet 'Elite' >= 80% threshold: ${over80Count} (${Math.round((over80Count/totalPatterns)*100)}%)`);
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
