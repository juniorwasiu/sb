/**
 * CHECK ALL CURRENT TRIGGERS ACROSS ALL LEAGUES
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches all recent completed match results from the DB and cross-checks
 * every team's LAST match score against all elite patterns.
 * Outputs: which patterns are currently triggered right now.
 *
 * RUN: node check_current_triggers.js
 */

require('dotenv').config();
const fs = require('fs');
const { connectDb } = require('./db_init');
const { getCachedDocs, parseDDMMYYYY } = require('./db_reader');

const MIN_SAMPLES = 20;
const MIN_PCT     = 70;

// ── STEP 1: Build elite patterns ──────────────────────────────────────────────
async function buildElitePatterns(allDocs) {
    const teamMatchMap = {};

    for (const m of allDocs) {
        if (!m.score || !/^\d+[:\-]\d+$/.test(m.score.trim())) continue;
        const lg = m.league || 'Unknown';
        let parsedDate = parseDDMMYYYY(m.date);
        if (!parsedDate) continue;

        const add = (team, isHome) => {
            if (!team) return;
            const key = `${lg}||${team}`;
            if (!teamMatchMap[key]) teamMatchMap[key] = [];
            teamMatchMap[key].push({ ...m, isHome, parsedDate });
        };
        add(m.homeTeam, true);
        add(m.awayTeam, false);
    }

    for (const key of Object.keys(teamMatchMap)) {
        teamMatchMap[key].sort((a, b) => a.parsedDate - b.parsedDate);
    }

    const OUTCOMES = [
        { key: 'nextWin',         label: '✅ Win',          field: 'nextWin' },
        { key: 'nextLoss',        label: '❌ Loss',         field: 'nextLoss' },
        { key: 'nextDraw',        label: '🤝 Draw',         field: 'nextDraw' },
        { key: 'nextOver15',      label: '⚽ Over 1.5',    field: 'nextOver15' },
        { key: 'nextOver25',      label: '🔥 Over 2.5',    field: 'nextOver25' },
        { key: 'nextGG',          label: '🎯 BTTS',        field: 'nextGG' },
        { key: 'nextHomeOver05',  label: '🏠 Home Scores', field: 'nextHomeOver05' },
        { key: 'nextAwayOver05',  label: '✈️ Away Scores', field: 'nextAwayOver05' },
    ];

    const patternStore = {};
    for (const [key, matches] of Object.entries(teamMatchMap)) {
        const [lg, team] = key.split('||');
        for (let i = 0; i < matches.length - 1; i++) {
            const cur = matches[i];
            const nxt = matches[i + 1];
            const score = cur.score.replace('-', ':').trim();
            const role  = cur.isHome ? 'Home' : 'Away';
            const pKey  = `${lg}||${score}||${role}||${team}`;

            if (!patternStore[pKey]) {
                patternStore[pKey] = { league: lg, team, score, role, total: 0,
                    nextWin: 0, nextLoss: 0, nextDraw: 0, nextOver15: 0,
                    nextOver25: 0, nextGG: 0, nextHomeOver05: 0, nextAwayOver05: 0,
                    mostRecentTrigger: null };
            }

            const st = patternStore[pKey];
            st.total++;
            const np  = nxt.score.replace('-', ':').split(':').map(Number);
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

            st.mostRecentTrigger = {
                date: cur.date, homeTeam: cur.homeTeam,
                awayTeam: cur.awayTeam, score: cur.score, isHome: cur.isHome
            };
        }
    }

    const elite = [];
    for (const [, st] of Object.entries(patternStore)) {
        if (st.total < MIN_SAMPLES) continue;
        const eliteOutcomes = OUTCOMES
            .map(o => ({ ...o, pct: Math.round((st[o.key] / st.total) * 100), hits: st[o.key] }))
            .filter(o => o.pct >= MIN_PCT);
        if (eliteOutcomes.length === 0) continue;
        elite.push({ ...st, sampleSize: st.total, eliteOutcomes,
            maxPct: Math.max(...eliteOutcomes.map(o => o.pct)) });
    }

    elite.sort((a, b) => b.maxPct - a.maxPct);
    return elite;
}

// ── STEP 2: Get the most recent result for every team in every league ─────────
function getLastResultPerTeam(allDocs) {
    // lastResultMap: key = "league||team" → { score, role, date, homeTeam, awayTeam }
    const lastResultMap = {};

    const validDocs = allDocs.filter(m =>
        m.score && /^\d+[:\-]\d+$/.test(m.score.trim()) && m.league && m.date
    );

    // Sort ALL docs newest first
    validDocs.sort((a, b) => {
        const pa = parseDDMMYYYY(a.date) || new Date(0);
        const pb = parseDDMMYYYY(b.date) || new Date(0);
        return pb - pa;
    });

    for (const m of validDocs) {
        const score = m.score.replace('-', ':').trim();
        const lg    = m.league;

        const setIfFirst = (team, role) => {
            if (!team) return;
            const k = `${lg}||${team}`;
            if (!lastResultMap[k]) {
                lastResultMap[k] = { score, role, date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam };
            }
        };
        setIfFirst(m.homeTeam, 'Home');
        setIfFirst(m.awayTeam, 'Away');
    }

    return lastResultMap;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' CURRENT TRIGGERS CHECK — ALL LEAGUES');
    console.log(`   Criteria: >= ${MIN_SAMPLES} samples | >= ${MIN_PCT}% probability`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    await connectDb();
    const allDocs = await getCachedDocs();
    console.log(`[DB] Loaded ${allDocs.length} historical match records\n`);

    // Build all elite patterns
    console.log('[Step 1] Building elite patterns...');
    const elitePatterns = await buildElitePatterns(allDocs);
    console.log(`[Step 1] ✅ ${elitePatterns.length} elite patterns built\n`);

    // Get last result per team
    console.log('[Step 2] Getting most recent result per team in each league...');
    const lastResultMap = getLastResultPerTeam(allDocs);
    const teamCount = Object.keys(lastResultMap).length;
    console.log(`[Step 2] ✅ ${teamCount} unique team/league combinations tracked\n`);

    // Cross-reference
    console.log('[Step 3] Cross-referencing...\n');

    const triggered = [];
    const dormant   = [];

    for (const pattern of elitePatterns) {
        const key        = `${pattern.league}||${pattern.team}`;
        const lastResult = lastResultMap[key];

        if (!lastResult) {
            dormant.push({ pattern, reason: 'No recent result found in DB' });
            continue;
        }

        const isTrigger = lastResult.score === pattern.score && lastResult.role === pattern.role;

        if (isTrigger) {
            triggered.push({ pattern, lastResult });
        } else {
            dormant.push({ pattern, lastResult, reason: `Last: ${lastResult.score} as ${lastResult.role}` });
        }
    }

    // ── GROUP TRIGGERED BY LEAGUE ─────────────────────────────────────────────
    const byLeague = {};
    for (const hit of triggered) {
        const lg = hit.pattern.league;
        if (!byLeague[lg]) byLeague[lg] = [];
        byLeague[lg].push(hit);
    }

    // ── CONSOLE OUTPUT ────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(` TRIGGERED PATTERNS: ${triggered.length} / ${elitePatterns.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (triggered.length === 0) {
        console.log('❌ No patterns currently triggered across any league.\n');
        console.log('   This usually means the DB has not received new results yet.');
        console.log('   Recent results available:');
        const recentDates = [...new Set(allDocs.map(d => d.date))].slice(0, 5);
        recentDates.forEach(d => console.log(`     → ${d}`));
    } else {
        for (const [lg, hits] of Object.entries(byLeague).sort()) {
            console.log(`\n─── ${lg} (${hits.length} triggered) ─────────────────────`);
            hits.forEach((hit, i) => {
                const { pattern, lastResult } = hit;
                console.log(`\n  ${i+1}. ${pattern.team}`);
                console.log(`     Last result:  ${lastResult.homeTeam} ${lastResult.score} ${lastResult.awayTeam}  (${lastResult.date})`);
                console.log(`     Role played:  ${lastResult.role}`);
                console.log(`     Trigger:      Score ${pattern.score} as ${pattern.role} ✅ MATCH`);
                console.log(`     Samples:      ${pattern.sampleSize} historical matches`);
                console.log(`     Predictions:`);
                pattern.eliteOutcomes.forEach(o => {
                    console.log(`       → ${o.label}: ${o.pct}%  (${o.hits}/${pattern.sampleSize})`);
                });
            });
        }
    }

    // ── SAVE TO FILE ──────────────────────────────────────────────────────────
    const report = {
        generatedAt: new Date().toISOString(),
        totalElitePatterns: elitePatterns.length,
        totalTriggered: triggered.length,
        totalDormant: dormant.length,
        triggeredPatterns: triggered.map(({ pattern, lastResult }) => ({
            league: pattern.league,
            team: pattern.team,
            triggerScore: pattern.score,
            triggerRole: pattern.role,
            sampleSize: pattern.sampleSize,
            lastResult,
            predictions: pattern.eliteOutcomes.map(o => ({
                outcome: o.label,
                probability: `${o.pct}%`,
                hits: `${o.hits}/${pattern.sampleSize}`
            }))
        })),
        dormantPatterns: dormant.slice(0, 30).map(({ pattern, lastResult, reason }) => ({
            league: pattern.league,
            team: pattern.team,
            triggerScore: pattern.score,
            triggerRole: pattern.role,
            lastResult: lastResult || null,
            reason
        }))
    };

    const outFile = './current_triggers_report.json';
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

    console.log(`\n\n═══════════════════════════════════════════════════════════════`);
    console.log(` Full report saved → ${outFile}`);
    console.log(`   Triggered: ${triggered.length}`);
    console.log(`   Dormant:   ${dormant.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
});
