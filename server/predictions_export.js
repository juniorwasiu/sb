const express = require('express');
const router = express.Router();
const { toDbLeague } = require('./constants');
const {
    getPredictionsHistoryFromDb,
    getMatchesFromDb,
    resolvePredictionOutcomes
} = require('./supabase');
const { getAllDailyTips } = require('./ai_memory');

// Helper for mapping league names to emojis for Telegram
function getLeagueEmoji(leagueName) {
    if (!leagueName) return '⚽';
    const lower = leagueName.toLowerCase();
    if (lower.includes('england')) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
    if (lower.includes('spain')) return '🇪🇸';
    if (lower.includes('italy')) return '🇮🇹';
    if (lower.includes('germany')) return '🇩🇪';
    if (lower.includes('france')) return '🇫🇷';
    return '⚽';
}

// Helper for formatting predictions to Telegram/markdown format
function formatPredictionsForTelegram(data, type) {
    console.log(`[DEBUG] [predictions_export] Formatting predictions data for type: ${type}`);
    if (!data) return '⚠️ No predictions found to export.';
    
    let text = '';
    if (type === 'live') {
        const leagueEmoji = getLeagueEmoji(data.league);
        text += `🔮 *AI LIVE PREDICTIONS* 🔮\n`;
        text += `🏆 *League:* ${data.league} ${leagueEmoji}\n`;
        text += `📅 *Date:* ${data.date} | 🕒 *Time:* ${data.time}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (data.predictions && data.predictions.length > 0) {
            data.predictions.forEach((pred, index) => {
                const matchName = pred.match || `${pred.homeTeam} vs ${pred.awayTeam}`;
                text += `⚽ *${index + 1}. ${matchName}*\n`;
                text += `🎯 *Winner:* ${pred.predictedOutcome === 'H' ? 'Home' : pred.predictedOutcome === 'A' ? 'Away' : 'Draw'} (${pred.predictedOutcomeProb || 0}%)\n`;
                if (pred.predictedHomeOrAwayProb !== undefined) {
                    text += `🤝 *Double Chance (12):* Home or Away (${pred.predictedHomeOrAwayProb || 0}%)\n`;
                }
                if (pred.predictedHomeTip) {
                    text += `🏠 *Home Single Tip:* ${pred.predictedHomeTip} (${pred.predictedHomeTipProb || 0}%)\n`;
                }
                if (pred.predictedAwayTip) {
                    text += `✈️ *Away Single Tip:* ${pred.predictedAwayTip} (${pred.predictedAwayTipProb || 0}%)\n`;
                }
                text += `🥅 *BTTS (GG/NG):* ${pred.predictedBtts || 'N/A'} (${pred.predictedBttsProb || 0}%)\n`;
                if (pred.predictedOver15) {
                    text += `📈 *Over 1.5:* ${pred.predictedOver15} (${pred.predictedOver15Prob || 0}%)\n`;
                }
                if (pred.predictedOver25) {
                    text += `📈 *Over 2.5:* ${pred.predictedOver25} (${pred.predictedOver25Prob || 0}%)\n`;
                }
                text += `🛡️ *Confidence:* ${pred.confidence || 0}%\n`;
                if (pred.resolved) {
                    text += `📊 *Result:* ${pred.actualScore || '?'}\n`;
                    text += `✅ *Winner Outcome:* ${pred.outcomeCorrect ? 'WON 🎉' : 'LOST ❌'}\n`;
                    if (pred.homeOrAwayCorrect !== undefined) {
                        text += `🤝 *Double Chance (12):* ${pred.homeOrAwayCorrect ? 'WON 🎉' : 'LOST ❌'}\n`;
                    }
                    if (pred.homeTipCorrect !== undefined) {
                        text += `🏠 *Home Tip Result:* ${pred.homeTipCorrect ? 'WON 🎉' : 'LOST ❌'}\n`;
                    }
                    if (pred.awayTipCorrect !== undefined) {
                        text += `✈️ *Away Tip Result:* ${pred.awayTipCorrect ? 'WON 🎉' : 'LOST ❌'}\n`;
                    }
                }
                if (pred.reasoning) {
                    text += `🧠 *Analysis:* _${pred.reasoning}_\n`;
                }
                text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            });
        } else {
            text += `No predictions in this round.\n`;
        }
    } else { // daily
        const leagueEmoji = getLeagueEmoji(data.league);
        text += `📅 *AI DAILY TIPS* 📅\n`;
        text += `🏆 *League:* ${data.league} ${leagueEmoji}\n`;
        text += `📅 *Date:* ${data.date}\n`;
        if (data.tipData?.context) {
            text += `📝 *Vibe:* _${data.tipData.context}_\n`;
        }
        text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        const matches = data.tipData?.upcoming_matches || data.tipData?.predictions || [];
        if (matches.length > 0) {
            matches.forEach((pred, index) => {
                text += `⚽ *${index + 1}. ${pred.fixture}*\n`;
                if (pred.game_time) text += `🕒 *Time:* ${pred.game_time}\n`;
                text += `🎯 *Winner:* ${pred.match_winner} (${pred.match_winner_pct || 0}%)\n`;
                text += `🥅 *BTTS (GG):* ${pred.gg || 'N/A'} (${pred.gg_pct || 0}%)\n`;
                text += `📈 *Over 1.5:* ${pred.over_1_5 || 'N/A'} (${pred.over_1_5_pct || 0}%)\n`;
                text += `📈 *Over 2.5:* ${pred.over_2_5 || 'N/A'} (${pred.over_2_5_pct || 0}%)\n`;
                if (pred.exact_score) text += `🎯 *Exact Score:* ${pred.exact_score}\n`;
                if (pred.prediction_reasoning) {
                    text += `🧠 *Analysis:* _${pred.prediction_reasoning}_\n`;
                }
                text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            });
        } else {
            text += `No daily tips matches found.\n`;
        }
    }
    
    text += `🤖 _Generated by Mango AI Assistant_`;
    console.log('[DEBUG] [predictions_export] Done formatting markdown text.');
    return text;
}

// GET public endpoint for predictions export (Telegram, etc.)
// Accessible via: /api/public/predictions/export
router.get('/', async (req, res) => {
    console.log('[DEBUG] [predictions_export] GET /api/public/predictions/export requested with query params:', req.query);
    const type = req.query.type || 'live'; // 'live' or 'daily'
    const league = req.query.league; // e.g. "England League" or undefined
    const format = req.query.format || 'text'; // 'text' or 'json'

    try {
        console.log(`[DEBUG] [predictions_export] Step 1: Fetching predictions data for type: ${type}`);
        if (type === 'live') {
            const history = await getPredictionsHistoryFromDb();
            let filtered = history;
            if (league) {
                const targetDbLeague = toDbLeague(league);
                console.log(`[DEBUG] [predictions_export] Step 2: Filtering predictions by league: ${league} (${targetDbLeague})`);
                filtered = history.filter(h => toDbLeague(h.league) === targetDbLeague);
            }
            
            if (!filtered || filtered.length === 0) {
                console.log('[DEBUG] [predictions_export] No live predictions history found.');
                if (format === 'json') {
                    return res.json({ success: false, error: 'No live predictions found.' });
                } else {
                    return res.send('⚠️ No live predictions found to export.');
                }
            }

            // Return deep copy so we don't mutate cachedDB arrays in memory
            const latestRound = JSON.parse(JSON.stringify(filtered[0]));
            console.log(`[DEBUG] [predictions_export] Step 3: Latest round found: ${latestRound.id}. Fetching finished matches to resolve outcomes.`);
            
            const finishedMatches = await getMatchesFromDb();
            latestRound.predictions = resolvePredictionOutcomes(latestRound.predictions, latestRound.date, finishedMatches);
            
            if (format === 'json') {
                console.log('[DEBUG] [predictions_export] Returning live predictions in JSON format.');
                return res.json({ success: true, data: latestRound });
            } else {
                console.log('[DEBUG] [predictions_export] Formatting live predictions as Telegram markdown.');
                const formattedText = formatPredictionsForTelegram(latestRound, 'live');
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.send(formattedText);
            }
        } else if (type === 'daily') {
            console.log(`[DEBUG] [predictions_export] Step 2: Fetching daily tips for league: ${league || 'All Leagues'}`);
            const dailyTips = await getAllDailyTips(league);
            
            if (!dailyTips || dailyTips.length === 0) {
                console.log('[DEBUG] [predictions_export] No daily tips found.');
                if (format === 'json') {
                    return res.json({ success: false, error: 'No daily tips found.' });
                } else {
                    return res.send('⚠️ No daily tips found to export.');
                }
            }

            const latestTip = dailyTips[0];
            console.log(`[DEBUG] [predictions_export] Step 3: Latest daily tip found for date: ${latestTip.date}, league: ${latestTip.league}`);
            
            if (format === 'json') {
                console.log('[DEBUG] [predictions_export] Returning daily tips in JSON format.');
                return res.json({ success: true, data: latestTip });
            } else {
                console.log('[DEBUG] [predictions_export] Formatting daily tips as Telegram markdown.');
                const formattedText = formatPredictionsForTelegram(latestTip, 'daily');
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.send(formattedText);
            }
        } else {
            console.log(`[DEBUG] [predictions_export] Invalid type parameter provided: ${type}`);
            return res.status(400).json({ success: false, error: 'Invalid type. Use "live" or "daily".' });
        }
    } catch (err) {
        console.error('[DEBUG] [predictions_export] Error processing predictions export:', err.message);
        res.status(500).json({ success: false, error: `Export failed: ${err.message}` });
    }
});

module.exports = router;
