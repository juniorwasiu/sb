const { Result, LeagueIntelligence, DailyTip, HistoryLog, AnalysisLog } = require('./db_init');

/**
 * Performs a deep-wipe of documents associated with a specific league.
 * If targetDate (DD/MM/YYYY) is provided, only deletes data for that date.
 * 
 * @param {string} leagueName 
 * @param {string|null} targetDate - "DD/MM/YYYY"
 * @returns {Promise<{results: number, logs: number, intelligence: number, tips: number, analysis: number}>}
 */
async function deleteLeagueData(leagueName, targetDate = null) {
    const stats = { results: 0, logs: 0, intelligence: 0, tips: 0, analysis: 0 };
    
    console.log(`[DB Admin] 🗑️ Initiating delete for league: "${leagueName}"${targetDate ? ` on date: ${targetDate}` : ' (FULL WIPE)'}`);

    // Helpers for date formats
    let logKeyDate = null;
    if (targetDate) {
        const [d, m, y] = targetDate.split('/');
        logKeyDate = `${y}-${m}-${d}`; // "2026-04-17"
    }

    try {
        // 1. Delete matches in results
        let resultsQuery = { league: leagueName };
        if (targetDate) resultsQuery.date = targetDate;
        const resultsRes = await Result.deleteMany(resultsQuery);
        stats.results = resultsRes.deletedCount || 0;
        console.log(`[DB Admin]  - Deleted ${stats.results} match results.`);

        // 2. Delete AI intelligence profile (ONLY on full wipe)
        if (!targetDate) {
            const intelRes = await LeagueIntelligence.deleteOne({ _id: leagueName });
            stats.intelligence = intelRes.deletedCount || 0;
            if (stats.intelligence > 0) console.log(`[DB Admin]  - Deleted AI intelligence profile.`);
        }

        // 3. Delete Daily Tips
        let tipsQuery = { league: leagueName };
        if (targetDate) tipsQuery.date = targetDate;
        const tipsRes = await DailyTip.deleteMany(tipsQuery);
        stats.tips = tipsRes.deletedCount || 0;
        console.log(`[DB Admin]  - Deleted ${stats.tips} daily tips.`);

        // 4. Delete Sync Logs
        if (targetDate) {
            const logDocId = `${leagueName}_${logKeyDate}`;
            const logRes = await HistoryLog.deleteOne({ _id: logDocId });
            stats.logs = logRes.deletedCount || 0;
            if (stats.logs > 0) console.log(`[DB Admin]  - Deleted history log for ${targetDate}.`);
        } else {
            const logsRes = await HistoryLog.deleteMany({ _id: new RegExp(`^${leagueName}_`) });
            stats.logs = logsRes.deletedCount || 0;
            console.log(`[DB Admin]  - Deleted ${stats.logs} history logs.`);
        }

        // 5. Delete AI Analysis Logs
        let analysisQuery = { league: leagueName };
        if (targetDate) analysisQuery.dateLabel = targetDate;
        const analysisRes = await AnalysisLog.deleteMany(analysisQuery);
        stats.analysis = analysisRes.deletedCount || 0;
        console.log(`[DB Admin]  - Deleted ${stats.analysis} analysis logs.`);

        // Invalidate the cache
        try {
            const { invalidateReaderCache } = require('./db_uploader');
            invalidateReaderCache();
        } catch (e) {
            // Might fail if circle dep or something, handle gracefully
        }

    } catch (err) {
        console.error('[DB Admin] ❌ Failed to delete league data:', err);
    }

    return stats;
}

module.exports = { deleteLeagueData };
