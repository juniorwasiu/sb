/**
 * TEST SCRIPT: Pattern-triggered Next Match Finder
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Simulate the FULL logic for finding "Elite Pattern" teams whose NEXT match
 *   is currently:
 *     (A) IN-PLAY in minutes 0–9 (very early — prediction is still useful)
 *     (B) UPCOMING in any league's "next game" queue
 *
 * HOW IT WORKS (Step-by-step):
 *   1. Load all recent DB results and compute elite patterns (minSamples >= 20, minPct >= 70%)
 *   2. For each elite-pattern team, find their MOST RECENT completed match (the trigger)
 *   3. Scrape the live_list for ALL leagues (in-play 0–9 min + upcoming)
 *   4. Cross-reference: does any live/upcoming match feature that team?
 *   5. Report all hits with full details
 *
 * RUN: node test_next_match_finder.js
 */

require('dotenv').config();

const { connectDb } = require('./db_init');
const { getCachedDocs, parseDDMMYYYY } = require('./db_reader');
const { scrapeLiveListOnDemand } = require('./scraper');

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const MIN_SAMPLES = 20;
const MIN_PCT     = 70;
const MAX_INPLAY_MINUTE = 9; // Only include in-play matches in minute 0–9
const TOP_PATTERNS = 30;     // How many top patterns to cross-reference

// ── HELPERS ───────────────────────────────────────────────────────────────────

function parseScore(score) {
    if (!score) return null;
    const cleaned = score.replace('-', ':').trim();
    const parts = cleaned.split(':').map(s => parseInt(s.trim(), 10));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return { home: parts[0], away: parts[1] };
}

function getInPlayMinute(timeStr) {
    // Time strings from live_list: "06'", "3'", "12'" or just a number
    if (!timeStr) return null;
    const match = String(timeStr).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

function isInPlayEarly(timeStr) {
    const min = getInPlayMinute(timeStr);
    return min !== null && min <= MAX_INPLAY_MINUTE;
}

function teamMatch(patternTeam, fixtureTeam) {
    if (!patternTeam || !fixtureTeam) return false;
    const a = patternTeam.toLowerCase().trim();
    const b = fixtureTeam.toLowerCase().trim();
    return a === b || a.includes(b) || b.includes(a);
}

// ── STEP 1 & 2: Build Elite Patterns from DB ──────────────────────────────────

async function buildElitePatterns(allDocs) {
    console.log('\n[Step 1] 🧮 Building elite patterns from DB...');

    // Group each team's matches chronologically per league
    const teamMatchMap = {};

    for (const m of allDocs) {
        if (!m.score || !/^\d+[:\-]\d+$/.test(m.score.trim())) continue;
        const lg = m.league || 'Unknown';
        let parsedDate = parseDDMMYYYY(m.date);
        if (!parsedDate) continue;

        const addEntry = (team, isHome) => {
            if (!team) return;
            const key = `${lg}||${team}`;
            if (!teamMatchMap[key]) teamMatchMap[key] = [];
            teamMatchMap[key].push({ ...m, isHome, parsedDate });
        };
        addEntry(m.homeTeam, true);
        addEntry(m.awayTeam, false);
    }

    // Sort each team's matches chronologically (oldest → newest)
    for (const key of Object.keys(teamMatchMap)) {
        teamMatchMap[key].sort((a, b) => a.parsedDate - b.parsedDate);
    }

    // Compute pattern statistics
    const patternStore = {}; // key: `${lg}||${score}||${role}||${team}`
    for (const [key, matches] of Object.entries(teamMatchMap)) {
        const [lg, team] = key.split('||');
        for (let i = 0; i < matches.length - 1; i++) {
            const cur = matches[i];
            const nxt = matches[i + 1];
            const score = cur.score.replace('-', ':').trim();
            const role = cur.isHome ? 'Home' : 'Away';
            const pKey = `${lg}||${score}||${role}||${team}`;

            if (!patternStore[pKey]) {
                patternStore[pKey] = {
                    league: lg, team, score, role,
                    total: 0, nextWin: 0, nextLoss: 0, nextDraw: 0,
                    nextOver15: 0, nextOver25: 0, nextGG: 0,
                    nextHomeOver05: 0, nextAwayOver05: 0,
                    mostRecentTrigger: null
                };
            }

            const st = patternStore[pKey];
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

            // Track the most recent trigger match
            st.mostRecentTrigger = {
                date: cur.date,
                homeTeam: cur.homeTeam,
                awayTeam: cur.awayTeam,
                score: cur.score,
                isHome: cur.isHome
            };
        }
    }

    // Filter elite patterns
    const OUTCOME_KEYS = ['nextWin', 'nextLoss', 'nextDraw', 'nextOver15', 'nextOver25', 'nextGG', 'nextHomeOver05', 'nextAwayOver05'];
    const OUTCOME_LABELS = {
        nextWin: '✅ Win', nextLoss: '❌ Loss', nextDraw: '🤝 Draw',
        nextOver15: '⚽ Over 1.5', nextOver25: '🔥 Over 2.5', nextGG: '🎯 BTTS',
        nextHomeOver05: '🏠 Home Scores', nextAwayOver05: '✈️ Away Scores'
    };

    const elitePatterns = [];
    for (const [pKey, st] of Object.entries(patternStore)) {
        if (st.total < MIN_SAMPLES) continue;

        const eliteOutcomes = OUTCOME_KEYS
            .map(k => ({ key: k, label: OUTCOME_LABELS[k], pct: Math.round((st[k] / st.total) * 100), hits: st[k] }))
            .filter(o => o.pct >= MIN_PCT);

        if (eliteOutcomes.length === 0) continue;

        elitePatterns.push({
            league: st.league, team: st.team, score: st.score, role: st.role,
            sampleSize: st.total,
            eliteOutcomes,
            maxPct: Math.max(...eliteOutcomes.map(o => o.pct)),
            mostRecentTrigger: st.mostRecentTrigger
        });
    }

    // Sort by strongest probability
    elitePatterns.sort((a, b) => b.maxPct - a.maxPct);

    console.log(`[Step 1] ✅ Found ${elitePatterns.length} elite patterns (>= ${MIN_SAMPLES} samples, >= ${MIN_PCT}% prob)`);
    return elitePatterns;
}

// ── STEP 3: Find the most recent completed match to confirm trigger is active ─

function isTriggerActive(pattern, allDocs) {
    // Get all matches for this team in this league sorted newest-first
    const teamMatches = allDocs.filter(m =>
        m.league === pattern.league &&
        (m.homeTeam === pattern.team || m.awayTeam === pattern.team) &&
        m.score && /^\d+[:\-]\d+$/.test(m.score.trim())
    );
    teamMatches.sort((a, b) => {
        const pa = parseDDMMYYYY(a.date) || new Date(0);
        const pb = parseDDMMYYYY(b.date) || new Date(0);
        return pb - pa;
    });

    if (teamMatches.length === 0) return false;

    const lastMatch = teamMatches[0];
    const lastScore = lastMatch.score.replace('-', ':').trim();
    const lastRole  = lastMatch.homeTeam === pattern.team ? 'Home' : 'Away';

    // The trigger is "active" if the team's most recent result matches the pattern trigger
    return lastScore === pattern.score && lastRole === pattern.role;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' PATTERN INTELLIGENCE — NEXT MATCH FINDER TEST');
    console.log(`   Criteria: >= ${MIN_SAMPLES} samples | >= ${MIN_PCT}% probability`);
    console.log(`   In-Play window: Minutes 0–${MAX_INPLAY_MINUTE} only`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    await connectDb();
    const allDocs = await getCachedDocs();
    console.log(`[DB] Loaded ${allDocs.length} historical match records\n`);

    // STEP 1: Build elite patterns
    const elitePatterns = await buildElitePatterns(allDocs);

    // STEP 2: Check which patterns have their trigger ACTIVE (most recent match = trigger score)
    console.log('\n[Step 2] 🔍 Checking which patterns have an active trigger...');
    const activePatterns = elitePatterns.filter(p => isTriggerActive(p, allDocs));
    console.log(`[Step 2] ✅ ${activePatterns.length} / ${elitePatterns.length} patterns have an active trigger`);

    if (activePatterns.length === 0) {
        console.log('\n⚠️  No patterns currently triggered. All teams\' last results did not match any elite trigger score.');
        console.log('   Top patterns for reference (not currently triggered):');
        elitePatterns.slice(0, 10).forEach((p, i) => {
            const t = p.mostRecentTrigger;
            console.log(`   ${i+1}. ${p.team} (${p.league}) — Trigger: ${p.score} as ${p.role} | Best: ${p.eliteOutcomes[0].label} ${p.eliteOutcomes[0].pct}% | Last game: ${t ? `${t.homeTeam} ${t.score} ${t.awayTeam} on ${t.date}` : 'Unknown'}`);
        });
    } else {
        console.log('\n📋 Active triggered patterns:');
        activePatterns.slice(0, TOP_PATTERNS).forEach((p, i) => {
            console.log(`   ${i+1}. ${p.team} (${p.league}) — Trigger: ${p.score} as ${p.role} | Outcomes: ${p.eliteOutcomes.map(o => `${o.label} ${o.pct}%`).join(', ')} | Samples: ${p.sampleSize}`);
        });
    }

    // STEP 3: Scrape the live list
    console.log('\n[Step 3] 🌐 Scraping live list (IN-PLAY + UPCOMING)...');
    const liveListGames = await scrapeLiveListOnDemand();

    const totalMatches = liveListGames.reduce((acc, g) => acc + (g.matches?.length || 0), 0);
    console.log(`[Step 3] ✅ Live list: ${liveListGames.length} league groups, ${totalMatches} total matches`);

    if (totalMatches === 0) {
        console.log('\n⚠️  Live list is empty. The scraper may need a moment to load, or there are no live matches right now.');
        console.log('   Run: node debug_live_list.js to debug the live list scraper.');
        process.exit(0);
    }

    console.log('\n📺 Current live/upcoming matches found:');
    for (const group of liveListGames) {
        console.log(`\n  League: "${group.league}" (${group.matches.length} matches)`);
        group.matches.forEach(m => {
            const inPlayMin = m.status === 'IN-PLAY' ? getInPlayMinute(m.time) : null;
            const timeDisplay = m.status === 'IN-PLAY'
                ? `IN-PLAY ${m.time || '?'} min` + (inPlayMin !== null && inPlayMin > MAX_INPLAY_MINUTE ? ' ⚠️ too late' : ' ✅ early')
                : `UPCOMING ${m.time || ''}`;
            console.log(`    → ${m.home} vs ${m.away} | ${timeDisplay}`);
        });
    }

    // STEP 4: Cross-reference active patterns with live/upcoming matches
    console.log('\n[Step 4] 🔗 Cross-referencing active patterns with live/upcoming matches...');

    const patternsToCheck = (activePatterns.length > 0 ? activePatterns : elitePatterns).slice(0, TOP_PATTERNS);
    const hits = [];

    for (const pattern of patternsToCheck) {
        for (const group of liveListGames) {
            const pCountry = pattern.league.split(' ')[0];
            // Check league match
            const leagueMatch =
                group.league === pattern.league ||
                group.league.includes(pCountry) ||
                group.league.includes('vFootball') ||
                group.league.replace(' (Upcoming)', '') === pattern.league;

            if (!leagueMatch) continue;

            for (const fixture of group.matches) {
                const homeMatch = teamMatch(pattern.team, fixture.home);
                const awayMatch = teamMatch(pattern.team, fixture.away);

                if (!homeMatch && !awayMatch) continue;

                const status = fixture.status;
                const inPlayMin = status === 'IN-PLAY' ? getInPlayMinute(fixture.time) : null;

                // Filter: only accept IN-PLAY 0–9 min or UPCOMING
                if (status === 'IN-PLAY' && (inPlayMin === null || inPlayMin > MAX_INPLAY_MINUTE)) {
                    console.log(`  ⏩ Skipping ${fixture.home} vs ${fixture.away} — IN-PLAY minute ${inPlayMin} > ${MAX_INPLAY_MINUTE} (too late)`);
                    continue;
                }

                hits.push({
                    pattern,
                    fixture: {
                        league: group.league,
                        home: fixture.home,
                        away: fixture.away,
                        time: fixture.time,
                        status,
                        inPlayMin,
                        teamRole: homeMatch ? 'Home' : 'Away'
                    }
                });
            }
        }
    }

    // STEP 5: Output results
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(` RESULTS: ${hits.length} pattern matches found`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (hits.length === 0) {
        console.log('❌ No matches found that satisfy the criteria:');
        console.log(`   - Pattern trigger active (team\'s last match = trigger scoreline)`);
        console.log(`   - Fixture is IN-PLAY (min 0–${MAX_INPLAY_MINUTE}) OR UPCOMING`);
        console.log('\n   This is normal between match rounds. Try again in 2-5 minutes when the next round starts.');
    } else {
        hits.forEach((hit, i) => {
            const { pattern, fixture } = hit;
            console.log(`\n─── HIT #${i+1} ───────────────────────────────────────────────`);
            console.log(`  Team:      ${pattern.team} (${pattern.league})`);
            console.log(`  Trigger:   Scored ${pattern.score} as ${pattern.role} → PATTERN ACTIVE`);
            console.log(`  Sample:    ${pattern.sampleSize} historical matches`);
            console.log(`  Fixture:   ${fixture.home} vs ${fixture.away}`);
            console.log(`  Status:    ${fixture.status} | Time: ${fixture.time || 'N/A'}${fixture.inPlayMin !== null ? ` (min ${fixture.inPlayMin})` : ''}`);
            console.log(`  Role:      ${pattern.team} playing ${fixture.teamRole}`);
            console.log(`  Predictions:`);
            pattern.eliteOutcomes.forEach(o => {
                console.log(`    → ${o.label}: ${o.pct}% (${o.hits}/${pattern.sampleSize} matches)`);
            });
        });
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' TEST COMPLETE — results above show what the AI would receive');
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
});
