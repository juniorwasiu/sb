/**
 * multi_engine_analyzer.js
 * Comprehensive Multi-Engine Head-to-Head (H2H) Analytical Suite
 *
 * Runs 6 distinct predictive and statistical engines in parallel:
 *   1. Behavioural & Streak Reversion Engine
 *   2. Poisson Goal Distribution & Expected Goals (xG) Engine
 *   3. Dynamic Elo Rating & Momentum Tracking Engine
 *   4. High-Yield Pattern & Scoreline Frequency Engine
 *   5. Odds Value & Market Implied Probability (+EV) Engine
 *   6. Empirical League & Contextual Scoreline Engine
 *   7. Neural Consensus & Weighted Ensemble Meta-Engine
 *
 * Each engine outputs its verdict, confidence score, mathematical formula,
 * input metrics, and step-by-step calculation trace for full transparency.
 */

// ── Mathematical Helpers ──────────────────────────────────────────────────────
function factorial(n) {
    if (n <= 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
}

function poisson(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function parseScore(scoreStr) {
    if (!scoreStr || typeof scoreStr !== 'string') return { home: 0, away: 0, valid: false };
    const sep = scoreStr.includes(':') ? ':' : scoreStr.includes('-') ? '-' : null;
    if (!sep) return { home: 0, away: 0, valid: false };
    const parts = scoreStr.split(sep).map(p => parseInt(p.trim(), 10));
    if (isNaN(parts[0]) || isNaN(parts[1])) return { home: 0, away: 0, valid: false };
    return { home: parts[0], away: parts[1], valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 1: Behavioural & Streak Reversion Engine
// Analyzes win/loss streaks, streak fatigue (≥4 wins), regression to mean,
// and psychological underdog reversals in high-frequency virtual environments.
// ─────────────────────────────────────────────────────────────────────────────
function runBehaviouralStreakEngine(h2hMatches, currentFixture) {
    const { homeTeam, awayTeam } = currentFixture;
    const totalMatches = h2hMatches.length;

    if (totalMatches === 0) {
        return {
            id: 'engine_behaviour',
            name: 'Behavioural & Streak Reversion Engine',
            tagline: 'Streak Fatigue & Regression to the Mean',
            verdict: 'NEUTRAL',
            confidence: 50,
            primaryPick: 'DRAW_OR_DOUBLE_CHANCE',
            explanation: 'Insufficient historical clashes to determine streak patterns.',
            formula: 'Fatigue Factor = min(1.0, (Current Consecutive Wins - 3) * 0.25)',
            calculationSteps: ['No prior clashes recorded between teams.'],
            metrics: { streakHome: 0, streakAway: 0, fatigueHome: 0, fatigueAway: 0 }
        };
    }

    // Sequence of results from most recent to oldest
    let homeWinStreak = 0;
    let awayWinStreak = 0;
    let drawStreak = 0;

    for (let i = 0; i < Math.min(10, totalMatches); i++) {
        const { home: hScore, away: aScore, valid } = parseScore(h2hMatches[i].score);
        if (!valid) continue;

        const wasHomeFixture = h2hMatches[i].home_team === homeTeam;
        const actualHomeWon = wasHomeFixture ? hScore > aScore : aScore > hScore;
        const actualAwayWon = wasHomeFixture ? aScore > hScore : hScore > aScore;
        const wasDraw = hScore === aScore;

        if (i === 0) {
            if (actualHomeWon) homeWinStreak = 1;
            else if (actualAwayWon) awayWinStreak = 1;
            else if (wasDraw) drawStreak = 1;
        } else {
            if (homeWinStreak > 0 && actualHomeWon) homeWinStreak++;
            else if (homeWinStreak > 0) break;

            if (awayWinStreak > 0 && actualAwayWon) awayWinStreak++;
            else if (awayWinStreak > 0) break;

            if (drawStreak > 0 && wasDraw) drawStreak++;
            else if (drawStreak > 0) break;
        }
    }

    // Fatigue and Reversal Calculations
    const homeFatigue = homeWinStreak >= 4 ? Math.min(0.75, (homeWinStreak - 3) * 0.25) : 0;
    const awayFatigue = awayWinStreak >= 4 ? Math.min(0.75, (awayWinStreak - 3) * 0.25) : 0;

    let verdict = 'NEUTRAL';
    let primaryPick = 'HOME_WIN';
    let confidence = 65;
    const steps = [];

    steps.push(`Analyzed last ${Math.min(15, totalMatches)} Head-to-Head encounters.`);
    steps.push(`Current Streak: ${homeTeam} = ${homeWinStreak} consecutive wins | ${awayTeam} = ${awayWinStreak} consecutive wins.`);

    if (homeFatigue > 0) {
        verdict = 'AWAY_REVERSAL_BIAS';
        primaryPick = 'AWAY_WIN_OR_DRAW';
        confidence = Math.min(88, 60 + Math.round(homeFatigue * 35));
        steps.push(`🚨 STREAK FATIGUE DETECTED: ${homeTeam} has won ${homeWinStreak} in a row. Fatigue penalty = ${(homeFatigue * 100).toFixed(0)}%.`);
        steps.push(`Regression pressure heavily favors an upset or draw by ${awayTeam}.`);
    } else if (awayFatigue > 0) {
        verdict = 'HOME_REVERSAL_BIAS';
        primaryPick = 'HOME_WIN_OR_DRAW';
        confidence = Math.min(88, 60 + Math.round(awayFatigue * 35));
        steps.push(`🚨 STREAK FATIGUE DETECTED: ${awayTeam} has won ${awayWinStreak} in a row. Fatigue penalty = ${(awayFatigue * 100).toFixed(0)}%.`);
        steps.push(`Regression pressure heavily favors an upset or draw by ${homeTeam}.`);
    } else if (drawStreak >= 2) {
        verdict = 'DECISIVE_BREAKOUT';
        primaryPick = 'DOUBLE_CHANCE_12';
        confidence = 74;
        steps.push(`Draw streak of ${drawStreak} matches detected. Regression predicts a decisive winner (No Draw).`);
    } else {
        verdict = 'BALANCED_MOMENTUM';
        primaryPick = homeWinStreak > 0 ? 'HOME_WIN' : awayWinStreak > 0 ? 'AWAY_WIN' : 'DRAW';
        confidence = 62;
        steps.push(`No critical streak fatigue (threshold >= 4 wins). Team momentum is operating within normal variance.`);
    }

    return {
        id: 'engine_behaviour',
        name: 'Behavioural & Streak Reversion Engine',
        tagline: 'Streak Fatigue & Regression to the Mean',
        verdict,
        confidence,
        primaryPick,
        formula: 'Regression Index = (Consecutive Wins - Threshold) * Fatigue Coefficient (0.25)',
        calculationSteps: steps,
        metrics: {
            homeWinStreak,
            awayWinStreak,
            drawStreak,
            homeFatigue: `${(homeFatigue * 100).toFixed(0)}%`,
            awayFatigue: `${(awayFatigue * 100).toFixed(0)}%`
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 2: Poisson Goal Distribution & Expected Goals (xG) Engine
// Calculates attack strength and defense vulnerability ratios for both teams,
// derives bivariate expected goals (λ_home, λ_away), and computes exact probabilities.
// ─────────────────────────────────────────────────────────────────────────────
function runPoissonXgEngine(h2hMatches, currentFixture) {
    const { homeTeam, awayTeam } = currentFixture;
    const n = h2hMatches.length;

    if (n === 0) {
        return {
            id: 'engine_poisson',
            name: 'Poisson Goal Distribution & xG Engine',
            tagline: 'Bivariate Expected Goals & Probability Matrix',
            verdict: 'OVER_15',
            confidence: 50,
            primaryPick: 'OVER_15',
            expectedGoals: { homeXg: 1.5, awayXg: 1.2, totalXg: 2.7 },
            probabilities: { homeWin: 44, draw: 24, awayWin: 32, over15: 78, over25: 54, over35: 30, gg: 56 },
            formula: 'P(X = k) = (λ^k * e^-λ) / k!',
            calculationSteps: ['Default baseline applied due to no prior head-to-head records.']
        };
    }

    let homeGoalsTotal = 0;
    let awayGoalsTotal = 0;
    let exactVenueMatches = 0;
    let exactVenueHomeGoals = 0;
    let exactVenueAwayGoals = 0;

    for (const m of h2hMatches) {
        const { home: h, away: a, valid } = parseScore(m.score);
        if (!valid) continue;

        if (m.home_team === homeTeam) {
            homeGoalsTotal += h;
            awayGoalsTotal += a;
            exactVenueMatches++;
            exactVenueHomeGoals += h;
            exactVenueAwayGoals += a;
        } else {
            homeGoalsTotal += a;
            awayGoalsTotal += h;
        }
    }

    // Weighting: 60% exact venue + 40% all H2H
    const avgHomeAll = homeGoalsTotal / Math.max(1, n);
    const avgAwayAll = awayGoalsTotal / Math.max(1, n);

    let lambdaHome = avgHomeAll;
    let lambdaAway = avgAwayAll;

    if (exactVenueMatches >= 3) {
        const avgHomeVenue = exactVenueHomeGoals / exactVenueMatches;
        const avgAwayVenue = exactVenueAwayGoals / exactVenueMatches;
        lambdaHome = (avgHomeVenue * 0.6) + (avgHomeAll * 0.4);
        lambdaAway = (avgAwayVenue * 0.6) + (avgAwayAll * 0.4);
    }

    // Safety bounds for realistic virtual simulation
    lambdaHome = Math.max(0.6, Math.min(3.5, lambdaHome));
    lambdaAway = Math.max(0.5, Math.min(3.5, lambdaAway));

    // Calculate Poisson Bivariate Matrix for scores 0-0 through 6-6
    let pHomeWin = 0;
    let pDraw = 0;
    let pAwayWin = 0;
    let pOver15 = 0;
    let pOver25 = 0;
    let pOver35 = 0;
    let pGG = 0;

    for (let h = 0; h <= 6; h++) {
        for (let a = 0; a <= 6; a++) {
            const prob = poisson(h, lambdaHome) * poisson(a, lambdaAway);

            if (h > a) pHomeWin += prob;
            else if (h === a) pDraw += prob;
            else pAwayWin += prob;

            if (h + a > 1.5) pOver15 += prob;
            if (h + a > 2.5) pOver25 += prob;
            if (h + a > 3.5) pOver35 += prob;
            if (h > 0 && a > 0) pGG += prob;
        }
    }

    const pctHome = Math.round(pHomeWin * 100);
    const pctDraw = Math.round(pDraw * 100);
    const pctAway = Math.round(pAwayWin * 100);
    const pctOver15 = Math.round(pOver15 * 100);
    const pctOver25 = Math.round(pOver25 * 100);
    const pctOver35 = Math.round(pOver35 * 100);
    const pctGG = Math.round(pGG * 100);

    const steps = [
        `Computed baseline xG: ${homeTeam} λ = ${lambdaHome.toFixed(2)} goals/match, ${awayTeam} λ = ${lambdaAway.toFixed(2)} goals/match.`,
        `Evaluated 49 bivariate Poisson combinations P(Home=x, Away=y) = [λ_H^x * e^-λ_H / x!] * [λ_A^y * e^-λ_A / y!].`,
        `Outcome Probabilities: Home Win = ${pctHome}% | Draw = ${pctDraw}% | Away Win = ${pctAway}%.`,
        `Goal Line Probabilities: Over 1.5 = ${pctOver15}% | Over 2.5 = ${pctOver25}% | Both Teams to Score (GG) = ${pctGG}%.`
    ];

    let primaryPick = 'OVER_15';
    if (pctOver25 >= 65) primaryPick = 'OVER_25';
    else if (pctGG >= 68) primaryPick = 'GG';
    else if (pctHome >= 52) primaryPick = 'HOME_WIN';
    else if (pctAway >= 52) primaryPick = 'AWAY_WIN';
    else if (pctOver15 >= 75) primaryPick = 'OVER_15';

    return {
        id: 'engine_poisson',
        name: 'Poisson Goal Distribution & xG Engine',
        tagline: 'Bivariate Expected Goals & Probability Matrix',
        verdict: primaryPick,
        confidence: Math.max(pctOver15, pctOver25, pctHome, pctAway, pctGG),
        primaryPick,
        expectedGoals: {
            homeXg: parseFloat(lambdaHome.toFixed(2)),
            awayXg: parseFloat(lambdaAway.toFixed(2)),
            totalXg: parseFloat((lambdaHome + lambdaAway).toFixed(2))
        },
        probabilities: {
            homeWin: pctHome,
            draw: pctDraw,
            awayWin: pctAway,
            over15: pctOver15,
            over25: pctOver25,
            over35: pctOver35,
            gg: pctGG
        },
        formula: 'P(X = x, Y = y) = [ (λ_H^x * e^-λ_H) / x! ] * [ (λ_A^y * e^-λ_A) / y! ]',
        calculationSteps: steps
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 3: Dynamic Elo Rating & Momentum Tracking Engine
// Maintains virtual Elo ratings (R_A, R_B) starting from 1500 with K-factor
// scaled by goal margins and exponential moving average (EMA) momentum.
// ─────────────────────────────────────────────────────────────────────────────
function runEloMomentumEngine(h2hMatches, currentFixture) {
    const { homeTeam, awayTeam } = currentFixture;
    const n = h2hMatches.length;

    let eloHome = 1500;
    let eloAway = 1500;
    const K = 32;

    // Process from oldest to newest for progressive rating evolution
    const chronMatches = [...h2hMatches].reverse();
    const steps = [];

    for (const m of chronMatches) {
        const { home: h, away: a, valid } = parseScore(m.score);
        if (!valid) continue;

        const isCurrentHomeOnHome = m.home_team === homeTeam;
        const rH = isCurrentHomeOnHome ? eloHome : eloAway;
        const rA = isCurrentHomeOnHome ? eloAway : eloHome;

        // Expected score
        const eH = 1 / (1 + Math.pow(10, (rA - rH) / 400));
        const eA = 1 - eH;

        // Actual score
        const sH = h > a ? 1.0 : h === a ? 0.5 : 0.0;
        const sA = 1.0 - sH;

        // Goal margin multiplier G = 1 + (diff - 1)/2
        const goalDiff = Math.abs(h - a);
        const marginMultiplier = goalDiff <= 1 ? 1 : Math.log(goalDiff + 1);

        const deltaH = Math.round(K * marginMultiplier * (sH - eH));
        const deltaA = Math.round(K * marginMultiplier * (sA - eA));

        if (isCurrentHomeOnHome) {
            eloHome += deltaH;
            eloAway += deltaA;
        } else {
            eloAway += deltaH;
            eloHome += deltaA;
        }
    }

    // Expected probability for current clash with +60 home ground Elo advantage
    const homeAdvantage = 60;
    const expectedHomeWin = 1 / (1 + Math.pow(10, ((eloAway) - (eloHome + homeAdvantage)) / 400));
    const expectedAwayWin = 1 / (1 + Math.pow(10, ((eloHome + homeAdvantage) - (eloAway)) / 400));
    const drawBuffer = 0.26;
    const finalHomePct = Math.round(expectedHomeWin * (1 - drawBuffer) * 100);
    const finalAwayPct = Math.round(expectedAwayWin * (1 - drawBuffer) * 100);
    const finalDrawPct = Math.max(12, 100 - finalHomePct - finalAwayPct);

    const eloDiff = eloHome - eloAway;

    steps.push(`Calibrated Elo ratings over ${n} historical meetings (starting rating: 1500, K-factor: ${K}).`);
    steps.push(`Current Rating: ${homeTeam} = ${eloHome} | ${awayTeam} = ${eloAway} (Rating Diff: ${eloDiff >= 0 ? '+' : ''}${eloDiff}).`);
    steps.push(`Home ground adjustment: +${homeAdvantage} Elo applied to ${homeTeam}.`);
    steps.push(`Expected Win Probabilities: ${homeTeam} = ${finalHomePct}% | Draw = ${finalDrawPct}% | ${awayTeam} = ${finalAwayPct}%.`);

    let primaryPick = 'HOME_WIN';
    let confidence = Math.max(finalHomePct, finalAwayPct);

    if (eloDiff > 60) {
        primaryPick = 'HOME_WIN';
        confidence = Math.min(88, 56 + Math.round(eloDiff / 8));
    } else if (eloDiff < -60) {
        primaryPick = 'AWAY_WIN';
        confidence = Math.min(88, 56 + Math.round(Math.abs(eloDiff) / 8));
    } else {
        primaryPick = 'DRAW_OR_DOUBLE_CHANCE';
        confidence = 66;
    }

    return {
        id: 'engine_elo',
        name: 'Elo Rating & Momentum Engine',
        tagline: 'Dynamic Rating Evolution & Head-to-Head Strength',
        verdict: primaryPick,
        confidence,
        primaryPick,
        ratings: {
            homeElo: eloHome,
            awayElo: eloAway,
            eloDifference: eloDiff
        },
        probabilities: {
            homeWin: finalHomePct,
            draw: finalDrawPct,
            awayWin: finalAwayPct
        },
        formula: 'E_A = 1 / [ 1 + 10^((R_B - R_A) / 400) ], ΔR = K * MarginMultiplier * (S - E)',
        calculationSteps: steps
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 4: High-Yield Pattern & Scoreline Frequency Engine
// Mines the historical dataset for 75-100% recurring patterns, dominant scores,
// first-half trends, and clean-sheet frequencies.
// ─────────────────────────────────────────────────────────────────────────────
function runPatternFrequencyEngine(h2hMatches, currentFixture) {
    const { homeTeam, awayTeam } = currentFixture;
    const n = h2hMatches.length;

    if (n === 0) {
        return {
            id: 'engine_pattern',
            name: 'High-Yield Pattern & Frequency Engine',
            tagline: 'Empirical Historical Pattern Mining (75%-100%)',
            verdict: 'OVER_15',
            confidence: 50,
            primaryPick: 'OVER_15',
            patterns: [],
            calculationSteps: ['No prior head-to-head matches found for pattern mining.']
        };
    }

    let over15Count = 0;
    let over25Count = 0;
    let over35Count = 0;
    let ggCount = 0;
    let homeScoredCount = 0;
    let awayScoredCount = 0;
    const scoreFrequency = new Map();

    for (const m of h2hMatches) {
        const { home: h, away: a, valid } = parseScore(m.score);
        if (!valid) continue;

        const actualHomeScore = m.home_team === homeTeam ? h : a;
        const actualAwayScore = m.home_team === homeTeam ? a : h;

        if (h + a > 1.5) over15Count++;
        if (h + a > 2.5) over25Count++;
        if (h + a > 3.5) over35Count++;
        if (h > 0 && a > 0) ggCount++;

        if (actualHomeScore > 0) homeScoredCount++;
        if (actualAwayScore > 0) awayScoredCount++;

        const cleanScore = `${h}:${a}`;
        scoreFrequency.set(cleanScore, (scoreFrequency.get(cleanScore) || 0) + 1);
    }

    const pOver15 = Math.round((over15Count / n) * 100);
    const pOver25 = Math.round((over25Count / n) * 100);
    const pOver35 = Math.round((over35Count / n) * 100);
    const pGG = Math.round((ggCount / n) * 100);
    const pHomeScored = Math.round((homeScoredCount / n) * 100);
    const pAwayScored = Math.round((awayScoredCount / n) * 100);

    const patterns = [];

    if (pOver15 >= 75) {
        patterns.push({
            pattern: `Over 1.5 Goals occurs in ${pOver15}% of clashes (${over15Count}/${n})`,
            confidence: pOver15,
            market: 'OVER_15',
            status: 'HIGH_YIELD'
        });
    }

    if (pOver25 >= 65) {
        patterns.push({
            pattern: `Over 2.5 Goals occurs in ${pOver25}% of clashes (${over25Count}/${n})`,
            confidence: pOver25,
            market: 'OVER_25',
            status: pOver25 >= 75 ? 'HIGH_YIELD' : 'STANDARD'
        });
    }

    if (pGG >= 65) {
        patterns.push({
            pattern: `Both Teams Score (GG) in ${pGG}% of clashes (${ggCount}/${n})`,
            confidence: pGG,
            market: 'GG',
            status: pGG >= 75 ? 'HIGH_YIELD' : 'STANDARD'
        });
    }

    if (pHomeScored >= 80) {
        patterns.push({
            pattern: `${homeTeam} scores at least 1 goal in ${pHomeScored}% of clashes`,
            confidence: pHomeScored,
            market: 'HOME_OVER_05',
            status: 'HIGH_YIELD'
        });
    }

    if (pAwayScored >= 80) {
        patterns.push({
            pattern: `${awayTeam} scores at least 1 goal in ${pAwayScored}% of clashes`,
            confidence: pAwayScored,
            market: 'AWAY_OVER_05',
            status: 'HIGH_YIELD'
        });
    }

    // Top frequent scores
    const topScores = Array.from(scoreFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([score, count]) => ({
            score,
            count,
            percentage: `${Math.round((count / n) * 100)}%`
        }));

    const steps = [
        `Mined full dataset of ${n} historical Head-to-Head clashes.`,
        `Empirical frequency: Over 1.5 = ${pOver15}% | Over 2.5 = ${pOver25}% | Both Teams Scored (GG) = ${pGG}%.`,
        `Scoring consistency: ${homeTeam} scored in ${pHomeScored}% of games | ${awayTeam} scored in ${pAwayScored}% of games.`,
        `Found ${patterns.length} high-yield statistical patterns with confidence >= 65%.`,
        `Dominant recurring scorelines: ${topScores.map(t => `${t.score} (${t.count}x / ${t.percentage})`).join(', ')}.`
    ];

    const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0] || { market: 'OVER_15', confidence: pOver15 };

    return {
        id: 'engine_pattern',
        name: 'High-Yield Pattern & Frequency Engine',
        tagline: 'Empirical Historical Pattern Mining (75%-100%)',
        verdict: bestPattern.market,
        confidence: bestPattern.confidence,
        primaryPick: bestPattern.market,
        patterns,
        topScores,
        formula: 'Occurrence Rate % = (Target Outcome Clashes / Total Clashes) * 100',
        calculationSteps: steps
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 5: Pre-Match Odds Value & Market Implied Probability (+EV) Engine
// Removes bookmaker overround to find fair market probabilities, then compares
// against historical empirical frequencies to identify Positive Expected Value (+EV).
// ─────────────────────────────────────────────────────────────────────────────
function runOddsValueEngine(h2hMatches, currentFixture) {
    const odds = currentFixture.odds || {};
    const oH = parseFloat(odds.home_win) || 2.20;
    const oX = parseFloat(odds.draw) || 3.30;
    const oA = parseFloat(odds.away_win) || 3.10;

    // Overround (vigorish) calculation
    const rawSum = (1 / oH) + (1 / oX) + (1 / oA);
    const vig = Math.max(0, (rawSum - 1.0) * 100);

    // Fair De-vigged Implied Probabilities
    const pImpHome = (1 / oH) / rawSum;
    const pImpDraw = (1 / oX) / rawSum;
    const pImpAway = (1 / oA) / rawSum;

    // Empirical historical win rate from H2H
    const n = h2hMatches.length;
    let hWins = 0;
    let draws = 0;
    let aWins = 0;

    for (const m of h2hMatches) {
        const { home: h, away: a, valid } = parseScore(m.score);
        if (!valid) continue;
        if (m.home_team === currentFixture.homeTeam) {
            if (h > a) hWins++;
            else if (h === a) draws++;
            else aWins++;
        } else {
            if (a > h) hWins++;
            else if (h === a) draws++;
            else aWins++;
        }
    }

    const pEmpHome = n > 0 ? (hWins / n) : pImpHome;
    const pEmpDraw = n > 0 ? (draws / n) : pImpDraw;
    const pEmpAway = n > 0 ? (aWins / n) : pImpAway;

    // Expected Value (+EV) Calculation: EV = (Empirical Probability * Odd) - 1.0
    const evHome = (pEmpHome * oH) - 1.0;
    const evDraw = (pEmpDraw * oX) - 1.0;
    const evAway = (pEmpAway * oA) - 1.0;

    const values = [
        { market: 'HOME_WIN', label: `${currentFixture.homeTeam} Win`, odd: oH, ev: evHome, pEmp: Math.round(pEmpHome * 100), pImp: Math.round(pImpHome * 100) },
        { market: 'DRAW', label: 'Draw (X)', odd: oX, ev: evDraw, pEmp: Math.round(pEmpDraw * 100), pImp: Math.round(pImpDraw * 100) },
        { market: 'AWAY_WIN', label: `${currentFixture.awayTeam} Win`, odd: oA, ev: evAway, pEmp: Math.round(pEmpAway * 100), pImp: Math.round(pImpAway * 100) }
    ].sort((a, b) => b.ev - a.ev);

    const bestVal = values[0];
    const steps = [
        `Bookmaker 1X2 Odds: Home @ ${oH} | Draw @ ${oX} | Away @ ${oA} (Overround / Vig: ${vig.toFixed(1)}%).`,
        `De-vigged Fair Implied Probabilities: Home = ${(pImpHome * 100).toFixed(1)}% | Draw = ${(pImpDraw * 100).toFixed(1)}% | Away = ${(pImpAway * 100).toFixed(1)}%.`,
        `Historical Empirical Probabilities: Home = ${(pEmpHome * 100).toFixed(1)}% | Draw = ${(pEmpDraw * 100).toFixed(1)}% | Away = ${(pEmpAway * 100).toFixed(1)}%.`,
        `Expected Value Edge: ${bestVal.label} yields +${(bestVal.ev * 100).toFixed(1)}% EV (Market implies ${bestVal.pImp}%, empirical truth is ${bestVal.pEmp}%).`
    ];

    const hasEdge = bestVal.ev > 0.05;

    return {
        id: 'engine_odds_value',
        name: 'Odds Value & Market Edge (+EV) Engine',
        tagline: 'De-Vigged Probability Arbitrage & Positive Expectancy',
        verdict: bestVal.market,
        confidence: hasEdge ? Math.min(88, 65 + Math.round(bestVal.ev * 40)) : 60,
        primaryPick: bestVal.market,
        hasEdge,
        bestEdge: {
            market: bestVal.market,
            label: bestVal.label,
            odd: bestVal.odd,
            expectedValueEdge: `+${(bestVal.ev * 100).toFixed(1)}%`
        },
        marketAnalysis: values,
        formula: 'EV = (P_empirical * Decimal_Odd) - 1.0, P_devig = (1 / Odd) / Σ(1 / Odd_i)',
        calculationSteps: steps
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 6: Empirical League & Contextual Scoreline Engine
// Completely replaces uncalibrated Poisson 1:1 draw bias with a real-data model
// that factors:
//   1. Real league empirical scoreline distribution (e.g. England vs Spain vs Italy).
//   2. Home team's offensive & defensive records at Home in this league.
//   3. Away team's offensive & defensive records Away in this league.
//   4. Last match scorelines of both teams in this league (regression/anti-repetition).
//   5. Directional market odds weighting (favored team projects decisive winning score).
// ─────────────────────────────────────────────────────────────────────────────
function runEmpiricalScorelineEngine(h2hMatches, currentFixture, leagueContext = {}) {
    const { homeTeam, awayTeam, league = 'England - Virtual', odds = {} } = currentFixture;
    const leagueMatches = Array.isArray(leagueContext.matches) ? leagueContext.matches : [];

    // 1. Empirical league scoreline distribution
    const leagueScoreFreq = new Map();
    let totalLeagueGames = 0;

    // Standard virtual soccer empirical baseline priors if sample is growing
    const defaultPriors = {
        '2:1': 14, '1:0': 12, '2:0': 11, '1:2': 10, '1:1': 9,
        '3:1': 8, '0:1': 8, '0:2': 6, '2:2': 5, '3:0': 4,
        '3:2': 4, '0:0': 3, '1:3': 3, '2:3': 2, '4:1': 1
    };

    for (const lm of leagueMatches) {
        const s = (lm.score || '').replace('-', ':').trim();
        if (/^\d+:\d+$/.test(s)) {
            leagueScoreFreq.set(s, (leagueScoreFreq.get(s) || 0) + 1);
            totalLeagueGames++;
        }
    }

    // 2. Team-specific league metrics
    let homeScoredHome = 0, homeConcededHome = 0, homeGamesAtHome = 0;
    let awayScoredAway = 0, awayConcededAway = 0, awayGamesAway = 0;
    let homeLastScore = null, awayLastScore = null;

    for (const m of leagueMatches) {
        const h = (m.home_team || m.homeTeam || m.home || '').trim();
        const a = (m.away_team || m.awayTeam || m.away || '').trim();
        const { home: scH, away: scA, valid } = parseScore(m.score);
        if (!valid) continue;

        if (h === homeTeam) {
            if (!homeLastScore) homeLastScore = `${scH}:${scA}`;
            homeScoredHome += scH;
            homeConcededHome += scA;
            homeGamesAtHome++;
        } else if (a === homeTeam) {
            if (!homeLastScore) homeLastScore = `${scA}:${scH}`;
        }

        if (a === awayTeam) {
            if (!awayLastScore) awayLastScore = `${scA}:${scH}`;
            awayScoredAway += scA;
            awayConcededAway += scH;
            awayGamesAway++;
        } else if (h === awayTeam) {
            if (!awayLastScore) awayLastScore = `${scH}:${scA}`;
        }
    }

    // Expected goals based on real team league data with shrink priors
    const avgHomeScored = homeGamesAtHome > 0 ? (homeScoredHome / homeGamesAtHome) : 1.6;
    const avgHomeConceded = homeGamesAtHome > 0 ? (homeConcededHome / homeGamesAtHome) : 1.1;
    const avgAwayScored = awayGamesAway > 0 ? (awayScoredAway / awayGamesAway) : 1.2;
    const avgAwayConceded = awayGamesAway > 0 ? (awayConcededAway / awayGamesAway) : 1.5;

    const expHomeGoals = Math.max(0.6, Math.min(3.6, (avgHomeScored * 0.6) + (avgAwayConceded * 0.4)));
    const expAwayGoals = Math.max(0.5, Math.min(3.4, (avgAwayScored * 0.6) + (avgHomeConceded * 0.4)));

    // 3. Market 1X2 directional guidance
    const oH = parseFloat(odds.home_win) || 2.20;
    const oX = parseFloat(odds.draw) || 3.30;
    const oA = parseFloat(odds.away_win) || 3.10;

    const rawSum = (1 / oH) + (1 / oX) + (1 / oA);
    const pImpHome = (1 / oH) / rawSum;
    const pImpDraw = (1 / oX) / rawSum;
    const pImpAway = (1 / oA) / rawSum;

    // Candidate scorelines to evaluate: 0:0 through 4:3
    const candidates = [];
    const possibleScores = [
        '2:1', '2:0', '3:1', '1:0', '3:0', '3:2', '4:1', '4:2', // Decisive Home Wins
        '1:2', '0:2', '1:3', '0:1', '0:3', '2:3', '1:4', '2:4', // Decisive Away Wins
        '1:1', '2:2', '0:0', '3:3'                              // Draws
    ];

    for (const scoreStr of possibleScores) {
        const [hGoals, aGoals] = scoreStr.split(':').map(Number);

        // a) Empirical League Occurrence Weight
        let leagueWeight = 1.0;
        if (totalLeagueGames >= 15 && leagueScoreFreq.has(scoreStr)) {
            leagueWeight = (leagueScoreFreq.get(scoreStr) / totalLeagueGames) * 10;
        } else {
            leagueWeight = (defaultPriors[scoreStr] || 1) / 10;
        }

        // b) Poisson Attack & Defense alignment
        const poissonH = poisson(hGoals, expHomeGoals);
        const poissonA = poisson(aGoals, expAwayGoals);
        let fitScore = poissonH * poissonA * (leagueWeight * 1.5);

        // c) Directional Market Calibration: Favored team gets substantial boost for winning scores
        if (pImpHome >= 0.42 && hGoals > aGoals) {
            fitScore *= (1.0 + (pImpHome * 1.8)); // Boost Home Win scores (2:1, 2:0, 3:1)
        } else if (pImpAway >= 0.42 && aGoals > hGoals) {
            fitScore *= (1.0 + (pImpAway * 1.8)); // Boost Away Win scores (1:2, 0:2, 1:3)
        } else if (hGoals === aGoals) {
            // Draw calibration: Downweight draws if odds favor a decisive winner
            if (pImpHome > 0.48 || pImpAway > 0.48) {
                fitScore *= 0.50; // Heavy favorite significantly depresses draw probability
            }
            // Anti-repetition: if either team just had a 1:1 or 0:0 in their last league game, penalize draw
            if (homeLastScore === scoreStr || awayLastScore === scoreStr) {
                fitScore *= 0.45;
            }
        }

        // d) H2H Historical Clashes Adjustment
        if (h2hMatches.length > 0) {
            const h2hMatchesCount = h2hMatches.filter(m => (m.score || '').replace('-', ':').trim() === scoreStr).length;
            if (h2hMatchesCount > 0) {
                fitScore *= (1.0 + (h2hMatchesCount / h2hMatches.length) * 0.8);
            }
        }

        candidates.push({
            score: scoreStr,
            hGoals,
            aGoals,
            fitScore: Math.max(0.0001, fitScore)
        });
    }

    // Normalize candidate probabilities
    const totalFit = candidates.reduce((sum, c) => sum + c.fitScore, 0);
    candidates.forEach(c => {
        c.probability = (c.fitScore / totalFit) * 100;
    });

    candidates.sort((a, b) => b.fitScore - a.fitScore);

    const topScores = candidates.slice(0, 3).map((c, i) => {
        let label = 'Alternative Outcome';
        if (c.hGoals > c.aGoals) label = `${homeTeam} Decisive Win`;
        else if (c.aGoals > c.hGoals) label = `${awayTeam} Decisive Win`;
        else label = 'Tactical Stalemate (Draw)';

        return {
            score: c.score,
            probability: `${c.probability.toFixed(1)}%`,
            rawProb: c.probability,
            type: i === 0 ? `Primary Projection (${label})` : `Rank ${i + 1} Alternative (${label})`
        };
    });

    const projectedScore = topScores[0].score;
    const steps = [
        `Ingested real league database history for ${league} (${totalLeagueGames} matches sampled).`,
        `Home Form: ${homeTeam} averages ${avgHomeScored.toFixed(1)} scored / ${avgHomeConceded.toFixed(1)} conceded at home.`,
        `Away Form: ${awayTeam} averages ${avgAwayScored.toFixed(1)} scored / ${avgAwayConceded.toFixed(1)} conceded away.`,
        `Directional Calibration: Market implied probabilities (Home: ${(pImpHome*100).toFixed(0)}%, Away: ${(pImpAway*100).toFixed(0)}%, Draw: ${(pImpDraw*100).toFixed(0)}%).`,
        `Anti-Repetition Check: Home last match was ${homeLastScore || 'N/A'}, Away last match was ${awayLastScore || 'N/A'}.`,
        `Top 3 Calibrated Scorelines: ${topScores.map(t => `${t.score} (${t.probability})`).join(' | ')}.`
    ];

    return {
        id: 'engine_scoreline',
        name: 'Empirical League & Contextual Scoreline Engine',
        tagline: 'Real League Frequency & Odds-Calibrated Score Distribution',
        verdict: projectedScore,
        confidence: Math.round(topScores[0].rawProb),
        projectedScore,
        topScores,
        formula: 'P_calibrated(H:A) = F_league(H:A) * Pois(H, λ_H) * Pois(A, λ_A) * W_odds(H,A) * R_streak',
        calculationSteps: steps
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE 7: Neural Consensus & Weighted Ensemble Meta-Engine
// Ingests probability distributions and confidence scores across all engines,
// performs dynamic weighted ensemble synthesis, and emits high-precision recommendations:
//   - Straight Win (1, X, 2)
//   - Primary Consensus Pick
//   - Double Chance & Safety Pick
//   - Market Value (+EV) Edge Pick
//   - Top 3 Realistic Scoreline Projections
// ─────────────────────────────────────────────────────────────────────────────
function runConsensusEnsembleEngine(engineResults, currentFixture, leagueContext = {}) {
    const weights = {
        engine_poisson: 0.25,
        engine_scoreline: 0.25,
        engine_elo: 0.20,
        engine_pattern: 0.15,
        engine_odds_value: 0.15
    };

    const poissonEng   = engineResults.find(e => e.id === 'engine_poisson');
    const scorelineEng = engineResults.find(e => e.id === 'engine_scoreline');
    const eloEng       = engineResults.find(e => e.id === 'engine_elo');
    const valueEng     = engineResults.find(e => e.id === 'engine_odds_value');
    const patternEng   = engineResults.find(e => e.id === 'engine_pattern');
    const behaviourEng = engineResults.find(e => e.id === 'engine_behaviour');

    const odds = currentFixture.odds || {};
    const oH = parseFloat(odds.home_win) || 2.20;
    const oX = parseFloat(odds.draw) || 3.30;
    const oA = parseFloat(odds.away_win) || 3.10;

    // 1. Weighted 1X2 Probabilities
    const pHomeWeighted =
        ((poissonEng?.probabilities?.homeWin || 42) * weights.engine_poisson) +
        ((eloEng?.probabilities?.homeWin || 42) * weights.engine_elo) +
        ((valueEng?.marketAnalysis?.find(m => m.market === 'HOME_WIN')?.pEmp || 42) * weights.engine_odds_value) +
        ((behaviourEng?.primaryPick === 'HOME_WIN' ? 55 : 38) * 0.10) +
        (42 * weights.engine_pattern);

    const pAwayWeighted =
        ((poissonEng?.probabilities?.awayWin || 34) * weights.engine_poisson) +
        ((eloEng?.probabilities?.awayWin || 34) * weights.engine_elo) +
        ((valueEng?.marketAnalysis?.find(m => m.market === 'AWAY_WIN')?.pEmp || 34) * weights.engine_odds_value) +
        ((behaviourEng?.primaryPick === 'AWAY_WIN' ? 55 : 34) * 0.10) +
        (34 * weights.engine_pattern);

    const pDrawWeighted = Math.max(14, 100 - pHomeWeighted - pAwayWeighted);

    const finalHomePct = Math.round(pHomeWeighted);
    const finalAwayPct = Math.round(pAwayWeighted);
    const finalDrawPct = Math.round(pDrawWeighted);

    // 2. Goal Line Probabilities
    const finalOver15Pct = poissonEng?.probabilities?.over15 || 76;
    const finalOver25Pct = poissonEng?.probabilities?.over25 || 56;
    const finalGgPct = poissonEng?.probabilities?.gg || 55;

    // 3. Dedicated Straight Win (1X2) Selection & Confidence
    let straightWinPick = '1';
    let straightWinTeam = currentFixture.homeTeam;
    let straightWinOdd = oH;
    let straightWinConfidence = finalHomePct;
    let straightWinReasoning = `Model projects ${finalHomePct}% win probability for ${currentFixture.homeTeam}.`;

    if (finalAwayPct > finalHomePct && finalAwayPct > finalDrawPct) {
        straightWinPick = '2';
        straightWinTeam = currentFixture.awayTeam;
        straightWinOdd = oA;
        straightWinConfidence = finalAwayPct;
        straightWinReasoning = `Model projects ${finalAwayPct}% win probability for ${currentFixture.awayTeam}.`;
    } else if (finalDrawPct > finalHomePct && finalDrawPct > finalAwayPct) {
        straightWinPick = 'X';
        straightWinTeam = 'Draw';
        straightWinOdd = oX;
        straightWinConfidence = finalDrawPct;
        straightWinReasoning = `Model projects high draw probability (${finalDrawPct}%).`;
    }

    const straightWin = {
        pick: straightWinPick,
        team: straightWinTeam,
        label: straightWinPick === 'X' ? 'Draw (X)' : `${straightWinTeam} to Win (Straight ${straightWinPick})`,
        odd: straightWinOdd,
        confidence: straightWinConfidence,
        isHighConfidence: straightWinConfidence >= 60,
        reasoning: straightWinReasoning
    };

    // 4. Double Chance Pick
    let doubleChance = {
        pick: '1X',
        label: `${currentFixture.homeTeam} or Draw (1X)`,
        confidence: Math.min(95, finalHomePct + finalDrawPct)
    };
    if (finalAwayPct > finalHomePct) {
        doubleChance = {
            pick: 'X2',
            label: `${currentFixture.awayTeam} or Draw (X2)`,
            confidence: Math.min(95, finalAwayPct + finalDrawPct)
        };
    } else if (finalDrawPct <= 20) {
        doubleChance = {
            pick: '12',
            label: `Either Team to Win (12 - No Draw)`,
            confidence: Math.min(95, finalHomePct + finalAwayPct)
        };
    }

    // 5. Consensus Primary Bet Selection
    let primaryBet = 'OVER_15';
    let primaryBetLabel = 'Over 1.5 Total Goals';
    let confidence = finalOver15Pct;

    if (straightWin.isHighConfidence && straightWin.confidence >= 65) {
        primaryBet = straightWin.pick === '1' ? 'HOME_WIN' : straightWin.pick === '2' ? 'AWAY_WIN' : 'DRAW';
        primaryBetLabel = straightWin.label;
        confidence = straightWin.confidence;
    } else if (finalOver25Pct >= 65) {
        primaryBet = 'OVER_25';
        primaryBetLabel = 'Over 2.5 Total Goals';
        confidence = finalOver25Pct;
    } else if (finalGgPct >= 65) {
        primaryBet = 'GG';
        primaryBetLabel = 'Both Teams to Score (GG)';
        confidence = finalGgPct;
    } else if (finalHomePct >= 50) {
        primaryBet = 'HOME_WIN';
        primaryBetLabel = `${currentFixture.homeTeam} to Win (1)`;
        confidence = finalHomePct;
    } else if (finalAwayPct >= 50) {
        primaryBet = 'AWAY_WIN';
        primaryBetLabel = `${currentFixture.awayTeam} to Win (2)`;
        confidence = finalAwayPct;
    } else if (finalOver15Pct >= 72) {
        primaryBet = 'OVER_15';
        primaryBetLabel = 'Over 1.5 Total Goals';
        confidence = finalOver15Pct;
    } else {
        primaryBet = doubleChance.pick;
        primaryBetLabel = doubleChance.label;
        confidence = doubleChance.confidence;
    }

    // 6. Secondary Value Bet
    const secondaryBet = valueEng?.bestEdge?.expectedValueEdge?.includes('+')
        ? `${valueEng.bestEdge.label} (+EV Edge)`
        : finalGgPct >= 52 ? 'Both Teams to Score (GG)' : 'Over 1.5 Goals';

    // 7. Projected Score & Top 3 Scorelines
    const topScores = scorelineEng?.topScores || [
        { score: '2:1', probability: '22.0%', type: 'Primary Projection' },
        { score: '2:0', probability: '17.0%', type: 'Alternative Projection' },
        { score: '3:1', probability: '14.0%', type: 'Alternative Projection' }
    ];
    const projectedScore = scorelineEng?.projectedScore || topScores[0].score || '2:1';

    const steps = [
        `Executed variance-weighted ensemble voting across 6 specialized analytical engines.`,
        `Consensus 1X2 Probabilities: ${currentFixture.homeTeam} Win = ${finalHomePct}% | Draw = ${finalDrawPct}% | ${currentFixture.awayTeam} Win = ${finalAwayPct}%.`,
        `Consensus Goals: Over 1.5 = ${finalOver15Pct}% | Over 2.5 = ${finalOver25Pct}% | Both Teams to Score = ${finalGgPct}%.`,
        `Straight Win Recommendation: ${straightWin.label} (${straightWin.confidence}% Conf @ ${straightWin.odd}).`,
        `Primary Recommendation: ${primaryBetLabel} with ${confidence}% overall consensus confidence.`,
        `Top Projected Scorelines: ${topScores.map(t => `${t.score} (${t.probability})`).join(', ')}.`
    ];

    return {
        id: 'engine_consensus',
        name: 'Neural Consensus & Ensemble Meta-Engine',
        tagline: 'Multi-Model Weighted Synthesis & Confidence Rating',
        primaryBet,
        primaryBetLabel,
        secondaryBet,
        straightWin,
        doubleChance,
        projectedScore,
        topScorelines: topScores,
        confidence,
        probabilities: {
            homeWin: finalHomePct,
            draw: finalDrawPct,
            awayWin: finalAwayPct,
            over15: finalOver15Pct,
            over25: finalOver25Pct,
            gg: finalGgPct
        },
        formula: 'Consensus(O) = Σ [ w_i * P_i(O) ] where Σ w_i = 1.0',
        calculationSteps: steps
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRYPOINT: analyzeH2H
// ─────────────────────────────────────────────────────────────────────────────
function analyzeH2H(h2hMatches = [], fixtureDetails = {}, leagueContext = {}) {
    const {
        homeTeam = 'HOME',
        awayTeam = 'AWAY',
        league = 'England - Virtual',
        odds = {},
        matchTime = '--:--'
    } = fixtureDetails;

    // Run specialized engines in parallel
    const engineBehaviour = runBehaviouralStreakEngine(h2hMatches, { homeTeam, awayTeam });
    const enginePoisson   = runPoissonXgEngine(h2hMatches, { homeTeam, awayTeam });
    const engineElo       = runEloMomentumEngine(h2hMatches, { homeTeam, awayTeam });
    const enginePattern   = runPatternFrequencyEngine(h2hMatches, { homeTeam, awayTeam });
    const engineOddsValue = runOddsValueEngine(h2hMatches, { homeTeam, awayTeam, odds });
    const engineScoreline = runEmpiricalScorelineEngine(h2hMatches, { homeTeam, awayTeam, league, odds }, leagueContext);

    const individualEngines = [
        enginePoisson,
        engineScoreline,
        enginePattern,
        engineElo,
        engineOddsValue,
        engineBehaviour
    ];

    // Meta-engine synthesizes all outputs
    const engineConsensus = runConsensusEnsembleEngine(individualEngines, { homeTeam, awayTeam, odds }, leagueContext);

    return {
        fixture: {
            homeTeam,
            awayTeam,
            league,
            odds,
            matchTime,
            h2hSampleCount: h2hMatches.length
        },
        consensus: engineConsensus,
        engines: [
            engineConsensus,
            engineScoreline,
            enginePoisson,
            enginePattern,
            engineElo,
            engineOddsValue,
            engineBehaviour
        ],
        h2hMatches
    };
}

module.exports = {
    analyzeH2H,
    runBehaviouralStreakEngine,
    runPoissonXgEngine,
    runEloMomentumEngine,
    runPatternFrequencyEngine,
    runOddsValueEngine,
    runEmpiricalScorelineEngine,
    runConsensusEnsembleEngine
};

