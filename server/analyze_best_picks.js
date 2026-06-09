// analyze_best_picks.js
const { getPredictionsHistoryFromDb, getMatchesFromDb, resolvePredictionOutcomes } = require('./supabase');
const fs = require('fs');
const path = require('path');

async function runAnalysis() {
    console.log('[Analyzer] Starting prediction history performance check...');
    try {
        // 1. Fetch data
        const history = await getPredictionsHistoryFromDb();
        const matches = await getMatchesFromDb();
        
        console.log(`[Analyzer] Fetched ${history.length} prediction rounds.`);
        console.log(`[Analyzer] Fetched ${matches.length} completed match results.`);

        // 2. Resolve outcomes
        const resolvedRounds = history.map(round => ({
            ...round,
            predictions: resolvePredictionOutcomes(round.predictions, round.date, matches)
        }));

        // Flatten all predictions across all rounds
        const allPredictions = [];
        resolvedRounds.forEach(round => {
            if (round.predictions) {
                round.predictions.forEach(p => {
                    allPredictions.push({
                        ...p,
                        league: round.league,
                        date: round.date,
                        time: round.time,
                        capturedAt: round.capturedAt
                    });
                });
            }
        });

        const resolvedPredictions = allPredictions.filter(p => p.resolved);
        console.log(`[Analyzer] Total predictions resolved: ${resolvedPredictions.length} / ${allPredictions.length}`);

        if (resolvedPredictions.length === 0) {
            console.log('[Analyzer] ⚠️ No resolved predictions available in database to analyze yet.');
            // Write a dummy / placeholder analysis if database is empty
            const emptyResult = {
                summary: "No resolved prediction history found in database yet. Scrape results and check outcomes to resolve predictions first.",
                bestStraightWinPicks: [],
                marketsStats: {}
            };
            fs.writeFileSync(path.join(__dirname, 'data', 'best_performing_picks_sample.json'), JSON.stringify(emptyResult, null, 2));
            return;
        }

        // 3. Performance Analysis
        // Group by Market/Tip type and evaluate different probability thresholds
        const stats = {
            outcome: { total: 0, correct: 0 },
            straightWin: { total: 0, correct: 0 }, // H or A outcomes
            draw: { total: 0, correct: 0 }, // D outcomes
            over15: { total: 0, correct: 0 },
            over25: { total: 0, correct: 0 },
            btts: { total: 0, correct: 0 },
            homeTip: { total: 0, correct: 0 },
            awayTip: { total: 0, correct: 0 },
            doubleChance: { total: 0, correct: 0 }
        };

        const probabilityBuckets = {}; // e.g. "outcome_70": { total, correct }

        const addBucket = (key, prob, isCorrect) => {
            if (prob === undefined || prob === null) return;
            const threshold = Math.floor(prob / 5) * 5; // group in 5% increments (e.g. 70, 75, 80...)
            const bucketKey = `${key}_ge_${threshold}`;
            if (!probabilityBuckets[bucketKey]) {
                probabilityBuckets[bucketKey] = { total: 0, correct: 0, threshold, key };
            }
            probabilityBuckets[bucketKey].total++;
            if (isCorrect) probabilityBuckets[bucketKey].correct++;
        };

        resolvedPredictions.forEach(p => {
            // Outcome (Overall H/D/A)
            stats.outcome.total++;
            if (p.outcomeCorrect) stats.outcome.correct++;
            addBucket('outcome', p.predictedOutcomeProb, p.outcomeCorrect);

            // Straight Win (H or A only, no D)
            if (p.predictedOutcome === 'H' || p.predictedOutcome === 'A') {
                stats.straightWin.total++;
                if (p.outcomeCorrect) stats.straightWin.correct++;
                addBucket('straightWin', p.predictedOutcomeProb, p.outcomeCorrect);
            } else if (p.predictedOutcome === 'D') {
                stats.draw.total++;
                if (p.outcomeCorrect) stats.draw.correct++;
                addBucket('draw', p.predictedOutcomeProb, p.outcomeCorrect);
            }

            // Over 1.5 Goals
            if (p.predictedOver15Prob !== undefined) {
                stats.over15.total++;
                if (p.over15Correct) stats.over15.correct++;
                addBucket('over15', p.predictedOver15Prob, p.over15Correct);
            }

            // Over 2.5 Goals
            if (p.predictedOver25Prob !== undefined) {
                stats.over25.total++;
                if (p.over25Correct) stats.over25.correct++;
                addBucket('over25', p.predictedOver25Prob, p.over25Correct);
            }

            // BTTS
            if (p.predictedBttsProb !== undefined) {
                stats.btts.total++;
                if (p.bttsCorrect) stats.btts.correct++;
                addBucket('btts', p.predictedBttsProb, p.bttsCorrect);
            }

            // Home Tip
            if (p.predictedHomeTip && p.predictedHomeTipProb !== undefined) {
                stats.homeTip.total++;
                if (p.homeTipCorrect) stats.homeTip.correct++;
                addBucket('homeTip', p.predictedHomeTipProb, p.homeTipCorrect);
            }

            // Away Tip
            if (p.predictedAwayTip && p.predictedAwayTipProb !== undefined) {
                stats.awayTip.total++;
                if (p.awayTipCorrect) stats.awayTip.correct++;
                addBucket('awayTip', p.predictedAwayTipProb, p.awayTipCorrect);
            }

            // Double Chance
            if (p.predictedHomeOrAwayProb !== undefined) {
                stats.doubleChance.total++;
                if (p.homeOrAwayCorrect) stats.doubleChance.correct++;
                addBucket('doubleChance', p.predictedHomeOrAwayProb, p.homeOrAwayCorrect);
            }
        });

        // 4. Summarize and find thresholds with highest performance (e.g. accuracy >= 75% or 80%)
        const processedBuckets = Object.keys(probabilityBuckets).map(k => {
            const b = probabilityBuckets[k];
            const accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
            return {
                bucketKey: k,
                market: b.key,
                threshold: b.threshold,
                total: b.total,
                correct: b.correct,
                accuracy
            };
        }).sort((a, b) => {
            // Sort by accuracy desc, then total desc
            if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
            return b.total - a.total;
        });

        // Calculate performance stats per market
        const marketPerformance = {};
        Object.keys(stats).forEach(k => {
            const item = stats[k];
            marketPerformance[k] = {
                total: item.total,
                correct: item.correct,
                accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0
            };
        });

        // Filter out prediction samples that meet the best performing criteria
        // Criteria for "Best Performing Picks":
        // 1. Straight Win predictions (H or A) with predictedOutcomeProb >= 75%
        // 2. Over 1.5 Goals predictions with predictedOver15 === 'Over' and predictedOver15Prob >= 80%
        // 3. Double Chance (H or A) with predictedHomeOrAwayProb >= 80%
        // 4. Home/Away tips with prob >= 78%
        
        const bestPerformingPicks = resolvedPredictions.filter(p => {
            const isBestStraight = (p.predictedOutcome === 'H' || p.predictedOutcome === 'A') && (p.predictedOutcomeProb >= 75);
            const isBestOver15 = (p.predictedOver15 === 'Over') && (p.predictedOver15Prob >= 80);
            const isBestDoubleChance = (p.predictedHomeOrAwayProb >= 80);
            const isBestHomeTip = p.predictedHomeTip && (p.predictedHomeTipProb >= 78);
            const isBestAwayTip = p.predictedAwayTip && (p.predictedAwayTipProb >= 78);
            
            return isBestStraight || isBestOver15 || isBestDoubleChance || isBestHomeTip || isBestAwayTip;
        }).map(p => {
            const reasons = [];
            if ((p.predictedOutcome === 'H' || p.predictedOutcome === 'A') && p.predictedOutcomeProb >= 75) {
                reasons.push(`Straight Win (${p.predictedOutcome}) with high probability ${p.predictedOutcomeProb}%`);
            }
            if (p.predictedOver15 === 'Over' && p.predictedOver15Prob >= 80) {
                reasons.push(`Over 1.5 Goals with high probability ${p.predictedOver15Prob}%`);
            }
            if (p.predictedHomeOrAwayProb >= 80) {
                reasons.push(`Double Chance with high probability ${p.predictedHomeOrAwayProb}%`);
            }
            if (p.predictedHomeTip && p.predictedHomeTipProb >= 78) {
                reasons.push(`Home Tip (${p.predictedHomeTip}) with high probability ${p.predictedHomeTipProb}%`);
            }
            if (p.predictedAwayTip && p.predictedAwayTipProb >= 78) {
                reasons.push(`Away Tip (${p.predictedAwayTip}) with high probability ${p.predictedAwayTipProb}%`);
            }
            
            return {
                id: p.id,
                date: p.date,
                time: p.time,
                league: p.league,
                match: p.match,
                confidence: p.confidence,
                prediction: {
                    outcome: p.predictedOutcome,
                    outcomeProb: p.predictedOutcomeProb,
                    over15: p.predictedOver15,
                    over15Prob: p.predictedOver15Prob,
                    doubleChanceProb: p.predictedHomeOrAwayProb,
                    homeTip: p.predictedHomeTip,
                    homeTipProb: p.predictedHomeTipProb,
                    awayTip: p.predictedAwayTip,
                    awayTipProb: p.predictedAwayTipProb,
                    btts: p.predictedBtts,
                    bttsProb: p.predictedBttsProb
                },
                result: {
                    score: p.actualScore,
                    outcome: p.actualOutcome,
                    btts: p.actualBtts,
                    over15: p.actualOver15,
                    isOutcomeCorrect: p.outcomeCorrect,
                    isOver15Correct: p.over15Correct,
                    isDoubleChanceCorrect: p.homeOrAwayCorrect,
                    isHomeTipCorrect: p.homeTipCorrect,
                    isAwayTipCorrect: p.awayTipCorrect
                },
                bestPerformingReason: reasons.join(', ')
            };
        });

        // 5. Generate final JSON analysis
        const finalAnalysis = {
            metadata: {
                analyzedAt: new Date().toISOString(),
                totalRoundsAnalyzed: resolvedRounds.length,
                totalPredictionsResolved: resolvedPredictions.length
            },
            marketPerformance,
            probabilityThresholds: processedBuckets.filter(b => b.total >= 3), // only show buckets with at least 3 samples
            bestPerformingPicksSample: bestPerformingPicks
        };

        const targetFilePath = path.join(__dirname, 'data', 'best_performing_picks_sample.json');
        fs.writeFileSync(targetFilePath, JSON.stringify(finalAnalysis, null, 2));
        console.log(`[Analyzer] ✅ Analysis complete. Best performing picks sample saved to: ${targetFilePath}`);
        console.log(`[Analyzer] Total Best Performing Pick Samples identified: ${bestPerformingPicks.length}`);
    } catch (err) {
        console.error('[Analyzer] ❌ Critical error during analysis run:', err);
    }
}

runAnalysis();
