// ─────────────────────────────────────────────────────────────────────────────
// ai_memory.js
//
// Persistent memory and log system for the DeepSeek AI analysis engine.
// Migrated to use MongoDB via Mongoose.
// ─────────────────────────────────────────────────────────────────────────────

const { 
    AnalysisLog, 
    SystemStrategy, 
    StrategyHistory, 
    LeagueIntelligence,
    DailyTip 
} = require('./db_init');

// ── Strategy Management ────────────────────────────────────────────────────
async function getStrategy() {
    try {
        const doc = await SystemStrategy.findById('strategy').lean();
        if (!doc) {
            const def = {
                _id: 'strategy',
                currentStrategy: "Use home/away venue split statistics as the primary prediction signal. Draw is only valid when both teams have similar form and draw rates above 30%. Prioritise HomeWin% over overall form strings.",
                activeRules: [
                    "DRAW GUARD: Only predict Draw if BOTH teams have draw rate >30% AND H2H shows balanced results AND home/away win% difference < 15pts",
                    "HOME ADVANTAGE: If home team HomeWin% > 55% AND away team AwayWin% < 30% → ALWAYS predict Home Win, never Draw",
                    "AWAY WIN: Only predict Away if away team AwayWin% > 40% OR H2H clearly favours away team",
                    "NEVER use betting odds as a predictor — odds are unreliable in vFootball, favourites regularly lose",
                    "Track wrong draws: if you predicted Draw and it ended Home or Away, add avoid_draw_default rule immediately",
                    "Acknowledge recent defensive form overriding historical h2h only when form sample is >5 games"
                ],
                timesUsed: 0,
                successfulHits: 0,
                failures: 0
            };
            await SystemStrategy.create(def);
            return def;
        }
        return doc;
    } catch (err) {
        console.error('[AI Memory] getStrategy Error:', err);
        return { currentStrategy: "Database error.", activeRules: [], timesUsed: 0, successfulHits: 0, failures: 0 };
    }
}

async function updateStrategy(newStrategyObj, successDelta = 0, failDelta = 0) {
    const current = await getStrategy();
    const isReset = newStrategyObj.action === 'pivot';
    const isUpdate = newStrategyObj.action === 'update_rules';
    
    let nextRules = [...(current.activeRules || [])];
    let removedRules = [];
    let monitoredRules = current.monitoredRules || [];

    if (isReset) {
        nextRules = newStrategyObj.newRules || [];
    } else if (isUpdate) {
        if (newStrategyObj.remove_rules && Array.isArray(newStrategyObj.remove_rules)) {
            removedRules = newStrategyObj.remove_rules;
            nextRules = nextRules.filter(r => !removedRules.includes(r));
        }
        if (newStrategyObj.add_rules && Array.isArray(newStrategyObj.add_rules)) {
            const newAdditions = newStrategyObj.add_rules.filter(r => !nextRules.includes(r));
            nextRules = [...nextRules, ...newAdditions];
        }
        if (newStrategyObj.monitor_rules && Array.isArray(newStrategyObj.monitor_rules)) {
            monitoredRules = [...new Set([...monitoredRules, ...newStrategyObj.monitor_rules])];
        }
    }

    const updated = {
        currentStrategy: isReset && newStrategyObj.newStrategy ? newStrategyObj.newStrategy : current.currentStrategy,
        activeRules: nextRules,
        monitoredRules: monitoredRules,
        timesUsed: isReset ? 1 : current.timesUsed + 1,
        successfulHits: isReset ? 0 : Math.max(0, current.successfulHits + successDelta),
        failures: isReset ? 0 : Math.max(0, current.failures + failDelta),
        updatedAt: new Date()
    };

    try {
        await SystemStrategy.findByIdAndUpdate('strategy', { $set: updated }, { upsert: true });
        console.log('[AI Memory] ✅ Strategy Updated:', isReset ? 'PIVOTED' : isUpdate ? 'RULES UPDATED' : 'MAINTAINED');
        
        if (isUpdate || isReset) {
            await StrategyHistory.create({
                _id: Date.now().toString(),
                date: updated.updatedAt,
                action: newStrategyObj.action,
                added: isReset ? nextRules : (newStrategyObj.add_rules || []),
                removed: removedRules || [],
                monitored: isReset ? [] : (newStrategyObj.monitor_rules || [])
            });
        }
    } catch(err) {
        console.error('[AI Memory] Failed to write strategy:', err);
    }
    return updated;
}

// ── Save a new analysis entry ──────────────────────────────────────────────
async function saveAnalysis(entry) {
    const id  = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full = { _id: id, createdAt: new Date(), ...entry };
    try {
        await AnalysisLog.create(full);
        console.log(`[AI Memory] ✅ Saved analysis entry ${id} to Database`);
        full.id = id;
        return full;
    } catch (err) {
        console.error('[AI Memory] Failed to save analysis log:', err);
        return null;
    }
}

// ── Get recent entries for context injection ────────────────────────────────
async function getRecentContext(n = 5) {
    try {
        console.log(`[AI Memory] 🔍 Fetching last ${n} analysis entries for AI memory context...`);
        const recent = await AnalysisLog.find({}).sort({ createdAt: -1 }).limit(n).lean();
        
        if (recent.length === 0) {
            console.log('[AI Memory] ℹ️ No past analysis entries found — AI will run without memory context.');
            return '';
        }

        const lines = recent.map((entry, i) => {
            const a = entry.analysis;
            return [
                `[Memory ${i + 1}] ${entry.dateLabel} (${entry.scope}) — League: ${entry.league || 'All'}`,
                `  Summary: ${a?.summary?.slice(0, 150) || 'N/A'}`,
                `  Predictions Given: O1.5(${a?.bettingPredictions?.over1_5 || '?'}), O2.5(${a?.bettingPredictions?.over2_5 || '?'}), GG(${a?.bettingPredictions?.GG || '?'})`,
                `  Previous Self-Reflection: ${a?.reflection?.slice(0, 200) || 'N/A'}`,
            ].join('\n');
        });

        const strategy = await getStrategy();
        let currentStrategyText = `
=== YOUR CURRENT ACTIVE STRATEGY & RULES ===
Strategy: ${strategy.currentStrategy}
Rules: ${strategy.activeRules.join(', ')}
Times Used: ${strategy.timesUsed} (You must reach at least 3 uses before you are allowed to pivot)
===========================================`;

        console.log(`[AI Memory] ✅ Memory context built: ${recent.length} past sessions loaded.`);
        return `\n\n=== YOUR PAST ANALYSIS MEMORY (last ${recent.length} sessions) ===\n${lines.join('\n\n')}\n==========================================\nUse this memory to explicitly evaluate if your previous Predictions Given were successful based on the new matches provided today.\n${currentStrategyText}`;
    } catch(err) {
        console.error('[AI Memory] Error fetching context:', err.message);
        return '';
    }
}

// ── Get full log for UI history panel ─────────────────────────────────────
async function getLog(limit = 50) {
    try {
        const recent = await AnalysisLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
        
        return recent.map(entry => ({
            id:         entry._id || entry.id,
            createdAt:  entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
            scope:      entry.scope,
            dateLabel:  entry.dateLabel,
            dateFrom:   entry.dateFrom,
            dateTo:     entry.dateTo,
            league:     entry.league,
            matchCount: entry.matchCount,
            tokensUsed: entry.tokensUsed,
            summary:    entry.analysis?.summary?.slice(0, 200) || '',
            reflection: entry.analysis?.reflection?.slice(0, 150) || '',
            strategyCommand: entry.analysis?.strategyCommand || null,
        }));
    } catch(err) {
        console.error('[AI Memory] Error fetching log:', err.message);
        return [];
    }
}

// ── Helper API: Check if an analysis already exists to prevent duplicate runs
async function getAnalysisByScopeAndDate(scope, dateLabel, league = '') {
    try {
        console.log(`[AI Memory] 🔍 Checking cache for scope=${scope} label=${dateLabel} league=${league || 'ALL'}`);
        let query = { scope, dateLabel };
        if (league) {
            query.league = league;
        }
        
        const existing = await AnalysisLog.findOne(query).lean();
        if (!existing) {
            console.log('[AI Memory] ℹ️ No existing cached analysis found — proceeding with fresh AI call.');
            return null;
        }
        console.log('[AI Memory] ✅ Cache hit — returning existing analysis to save API tokens.');
        return existing;
    } catch(err) {
        console.error('[AI Memory] Error checking existing analysis:', err.message);
        return null;
    }
}

// ── Delete an entry by id ──────────────────────────────────────────────────
async function deleteEntry(id) {
    try {
        await AnalysisLog.findByIdAndDelete(id);
        return 1;
    } catch (err) {
        console.error('[AI Memory] Delete error:', err);
        return 0;
    }
}

// ── Get a single entry by id (for full detail view) ───────────────────────
async function getEntryById(id) {
    try {
        return await AnalysisLog.findById(id).lean();
    } catch (err) { return null; }
}

// ── Clear entire log ───────────────────────────────────────────────────────
async function clearLog() {
    try {
        await AnalysisLog.deleteMany({});
        console.log('[AI Memory] 🗑️ Log cleared on Database.');
    } catch (err) {
        console.error('[AI Memory] Clear error:', err);
    }
}

// ── League Intelligence Management (Deep Learning) ──────────────────────
async function getLeagueIntelligence(league = null) {
    try {
        if (league) {
            return await LeagueIntelligence.findById(league).lean();
        } else {
            const allDocs = await LeagueIntelligence.find({}).lean();
            let all = {};
            allDocs.forEach(doc => { all[doc._id] = doc; });
            return all;
        }
    } catch (err) {
        console.error('[AI Memory] Failed to read league intelligence:', err);
        return null;
    }
}

async function updateLeagueIntelligence(league, targetDate, intelligenceProfile) {
    const dateKey = targetDate.replace(/\//g, '-'); 
    try {
        const docRef = await LeagueIntelligence.findById(league).lean();
        const current = docRef || {};

        const history = current.history || {};
        history[dateKey] = intelligenceProfile;

        const sortedKeys = Object.keys(history).sort((a, b) => {
            return b.localeCompare(a);
        });
        if (sortedKeys.length > 30) {
            const keysToRemove = sortedKeys.slice(30);
            keysToRemove.forEach(k => delete history[k]);
        }

        const last7Keys = sortedKeys.slice(0, 7);
        const merged = buildMergedProfile(last7Keys.map(k => history[k]).filter(Boolean));

        const data = {
            lastTrainedDate: targetDate,
            trainedAt: new Date().toISOString(),
            profile: intelligenceProfile,  
            history,
            merged,
            daysInMerge: last7Keys.length
        };

        await LeagueIntelligence.findByIdAndUpdate(league, { $set: data }, { upsert: true });
        console.log(`[AI Memory] ✅ Updated League Intelligence for ${league} — date ${dateKey} stored, merged over last ${last7Keys.length} days.`);
        return data;
    } catch(err) {
        console.error('[AI Memory] Failed to write intelligence:', err);
        return null;
    }
}

function buildMergedProfile(profiles) {
    if (!profiles || profiles.length === 0) return null;
    if (profiles.length === 1) return profiles[0];

    const allRules = [...new Set(profiles.flatMap(p => p.recurringRules || []))];

    const topTeamsMap = {};
    for (const p of profiles) {
        for (const t of (p.topPerformingTeams || [])) {
            if (!topTeamsMap[t.team]) topTeamsMap[t.team] = { ...t, mentions: 0 };
            topTeamsMap[t.team].mentions++;
        }
    }
    const topTeams = Object.values(topTeamsMap)
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 8)
        .map(({ mentions: _m, ...rest }) => rest);

    const worstTeamsMap = {};
    for (const p of profiles) {
        for (const t of (p.worstPerformingTeams || [])) {
            if (!worstTeamsMap[t.team]) worstTeamsMap[t.team] = { ...t, mentions: 0 };
            worstTeamsMap[t.team].mentions++;
        }
    }
    const worstTeams = Object.values(worstTeamsMap)
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 8)
        .map(({ mentions: _m, ...rest }) => rest);

    const mergedTeamStats = {};
    for (const p of profiles) {
        for (const [team, stats] of Object.entries(p.teamStats || {})) {
            if (!mergedTeamStats[team]) mergedTeamStats[team] = { count: 0, homeWinPct: 0, awayWinPct: 0, avgGoals: 0 };
            const s = mergedTeamStats[team];
            s.count++;
            s.homeWinPct += stats.homeWinPct || 0;
            s.awayWinPct += stats.awayWinPct || 0;
            s.avgGoals   += stats.avgGoals   || 0;
        }
    }
    const finalTeamStats = {};
    for (const [team, s] of Object.entries(mergedTeamStats)) {
        finalTeamStats[team] = {
            homeWinPct: Math.round(s.homeWinPct / s.count),
            awayWinPct: Math.round(s.awayWinPct / s.count),
            avgGoals:   Math.round((s.avgGoals   / s.count) * 10) / 10
        };
    }

    const latest = profiles[0];

    return {
        leagueVibe:            latest.leagueVibe,
        venueEffect:           latest.venueEffect,
        drawTendency:          latest.drawTendency,
        topPerformingTeams:    topTeams,
        worstPerformingTeams:  worstTeams,
        recurringRules:        allRules.slice(0, 15),  
        teamStats:             finalTeamStats,
        mergedFromDays:        profiles.length,
        mergedAt:              new Date().toISOString()
    };
}


// ── Daily Tips Management ───────────────────────────────────────────────────
async function saveDailyTip(date, league, tipData) {
    const docId = `${date}_${league}`.replace(/ /g, '_');
    const full = {
        _id: docId, // explicitly setting the _id
        date,
        league,
        tipData,
        updatedAt: new Date(),
    };
    try {
        await DailyTip.findByIdAndUpdate(docId, { $set: full }, { upsert: true });
        console.log(`[AI Memory] ✅ Saved Daily Tip for ${date} (${league}) to Database`);
        full.id = docId;
        return full;
    } catch (err) {
        console.error('[AI Memory] Failed to save daily tip:', err);
        return null;
    }
}

async function getDailyTip(date, league) {
    const docId = `${date}_${league}`.replace(/ /g, '_');
    try {
        console.log(`[AI Memory] 🔍 Fetching daily tip for ${date} (${league})...`);
        const doc = await DailyTip.findById(docId).lean();
        if (doc) {
            console.log(`[AI Memory] ✅ Daily tip cache hit for ${date} (${league}).`);
        } else {
            console.log(`[AI Memory] ℹ️ No cached daily tip found for ${date} (${league}).`);
        }
        return doc || null;
    } catch (err) {
        console.error('[AI Memory] Failed to read daily tip:', err.message);
        return null;
    }
}

async function getAllDailyTips(league) {
    try {
        let query = {};
        if (league) query.league = league;
        
        const tips = await DailyTip.find(query).sort({ updatedAt: -1 }).limit(20).lean();
        console.log(`[AI Memory] ✅ getAllDailyTips: found ${tips.length} tips for league=${league || 'ALL'}`);
        return tips.map(t => ({ id: t._id, ...t }));
    } catch (err) {
        console.error('[AI Memory] Failed to read all daily tips:', err.message);
        return [];
    }
}

async function fetchStrategyHistory() {
    try {
        const history = await StrategyHistory.find({}).sort({ date: -1 }).limit(50).lean();
        return history.map(doc => ({ id: doc._id, ...doc }));
    } catch (err) {
        console.error('[AI Memory] Failed to fetch strategy history:', err);
        return [];
    }
}

module.exports = { 
    saveAnalysis, getRecentContext, getLog, deleteEntry, getEntryById, clearLog, 
    getStrategy, updateStrategy, fetchStrategyHistory, getLeagueIntelligence, updateLeagueIntelligence,
    getAnalysisByScopeAndDate, saveDailyTip, getDailyTip, getAllDailyTips
};
