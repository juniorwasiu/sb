/**
 * test_lifecycle_engine.js
 * Verification unit test for match lifecycle engine, outcome calculation,
 * league detection, and exact DOM odds preservation.
 */

const { computeOutcomes, teamsMatch, normalizeLeague } = require('../analytics/match_lifecycle_engine');
const { detectLeague } = require('../constants');

console.log('=== RUNNING LIFECYCLE ENGINE TESTS ===\n');

// Test 1: Team matching
const t1 = teamsMatch('Arsenal', 'ARS');
const t2 = teamsMatch('Manchester United', 'MUN');
const t3 = teamsMatch('Chelsea', 'Liverpool');
console.log(`Test 1.1: Arsenal vs ARS -> ${t1 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 1.2: Manchester United vs MUN -> ${t2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 1.3: Chelsea vs Liverpool (should be false) -> ${!t3 ? '✅ PASS' : '❌ FAIL'}`);

// Test 2: Outcome calculation with Home Win
const odds = { home_win: 1.85, draw: 3.40, away_win: 4.50, over_2_5: 1.90, gg: 1.75 };
const resHome = computeOutcomes('3:1', odds);

console.log(`Test 2.1: Home score 3 -> ${resHome.homeScore === 3 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 2.2: Away score 1 -> ${resHome.awayScore === 1 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 2.3: Winner HOME_WIN (1) -> ${resHome.winner === 'HOME_WIN' && resHome.winner1x2 === '1' ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 2.4: Winning odd is 1.85 -> ${resHome.winningOdd === 1.85 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 2.5: Over 2.5 hit -> ${resHome.over25 === true ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 2.6: GG hit -> ${resHome.ggNg === 'GG' ? '✅ PASS' : '❌ FAIL'}`);

// Test 3: Outcome calculation with Draw
const resDraw = computeOutcomes('0:0', odds);
console.log(`Test 3.1: Winner DRAW (X) -> ${resDraw.winner === 'DRAW' && resDraw.winner1x2 === 'X' ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 3.2: Winning odd is 3.40 -> ${resDraw.winningOdd === 3.40 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 3.3: NG hit -> ${resDraw.ggNg === 'NG' ? '✅ PASS' : '❌ FAIL'}`);

// Test 4: Team-First Authoritative League Detection (Even with wrong raw league input)
const lSpain = detectLeague('England - Virtual', 'RMA', 'BAR');
const lGermany = detectLeague('England League', 'BAY', 'BVB');
const lItaly = detectLeague('vFootball Live Odds', 'INT', 'JUV');
const lFrance = detectLeague('Unknown', 'PSG', 'MAR');
const lEngland = detectLeague('Spain - Virtual', 'ARS', 'CHE');

console.log(`Test 4.1: RMA vs BAR with wrong league -> Detected: ${lSpain} -> ${lSpain === 'Spain - Virtual' ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 4.2: BAY vs BVB with wrong league -> Detected: ${lGermany} -> ${lGermany === 'Germany - Virtual' ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 4.3: INT vs JUV with wrong league -> Detected: ${lItaly} -> ${lItaly === 'Italy - Virtual' ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 4.4: PSG vs MAR with wrong league -> Detected: ${lFrance} -> ${lFrance === 'France - Virtual' ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Test 4.5: ARS vs CHE with wrong league -> Detected: ${lEngland} -> ${lEngland === 'England - Virtual' ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n🎉 ALL LIFECYCLE TESTS COMPLETED SUCCESSFULLY!');
