import React, { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Link } from 'react-router-dom';

export default function PredictionsDashboard() {
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [activeView, setActiveView] = useState('live'); // 'live' | 'history'
  
  // Predictor states
  const [predicting, setPredicting] = useState(false);
  const [predictionResults, setPredictionResults] = useState(null);
  const [predictionError, setPredictionError] = useState(null);
  const predictionsRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [resolvingPending, setResolvingPending] = useState(false);
  const [resolveStatus, setResolveStatus] = useState(''); // Human-readable status during resolve
  const [caseStudyStats, setCaseStudyStats] = useState(null);

  const fetchLastPrediction = useCallback(async (league) => {
    const targetLeague = league || selectedLeague;
    console.log(`[PredictionsDashboard] [DEBUG] 📡 Fetching last prediction round for league: "${targetLeague}"...`);
    try {
      const response = await fetch(`/api/local-vfootball/predictions-history?league=${encodeURIComponent(targetLeague)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.history && data.history.length > 0) {
          const lastRound = data.history[0];
          console.log(`[PredictionsDashboard] [DEBUG] ✅ Found last prediction round from ${lastRound.capturedAt}. Loading into display.`);
          setPredictionResults({
            success: true,
            provider: lastRound.provider || 'deepseek',
            league: lastRound.league,
            predictions: lastRound.predictions,
            isLoadedFromHistory: true
          });
        } else {
          console.log('[PredictionsDashboard] [DEBUG] ℹ️ No historical predictions found for this league.');
          setPredictionResults(null);
        }
      }
    } catch (err) {
      console.warn('[PredictionsDashboard] [DEBUG] ⚠️ Failed to fetch last prediction:', err.message);
    }
  }, [selectedLeague]);

  // Fetch last prediction on mount and when selected league changes
  useEffect(() => {
    if (activeView === 'live') {
      fetchLastPrediction(selectedLeague);
    }
  }, [activeView, selectedLeague, fetchLastPrediction]);

  // Sub-tabs states
  // 'all' | 'best' | 'beststraightwin' | 'bestperforming' | 'best15' | 'singlehome' | 'singleaway' | 'besthomeaway' | 'bestsingle'
  const [liveSubTab, setLiveSubTab] = useState('all');
  const [historySubTab, setHistorySubTab] = useState('all');

  // Helper to extract the single highest-probability tip for a match
  const getBestSingleTip = (pred) => {
    const options = [];
    
    if (pred.predictedOutcomeProb !== undefined && pred.predictedOutcomeProb !== null) {
      const label = pred.predictedOutcome === 'H' ? 'Home Win' : pred.predictedOutcome === 'A' ? 'Away Win' : 'Draw';
      options.push({
        market: 'Outcome',
        prediction: label,
        prob: pred.predictedOutcomeProb,
        color: 'var(--accent-neon)'
      });
    }
    if (pred.predictedHomeOrAwayProb !== undefined && pred.predictedHomeOrAwayProb !== null) {
      options.push({
        market: 'Double Chance',
        prediction: 'Home or Away',
        prob: pred.predictedHomeOrAwayProb,
        color: '#F43F5E' // rose/pink color
      });
    }
    if (pred.predictedHomeTipProb !== undefined && pred.predictedHomeTipProb !== null && pred.predictedHomeTip) {
      options.push({
        market: 'Home Tip',
        prediction: pred.predictedHomeTip,
        prob: pred.predictedHomeTipProb,
        color: '#3B82F6' // blue color
      });
    }
    if (pred.predictedAwayTipProb !== undefined && pred.predictedAwayTipProb !== null && pred.predictedAwayTip) {
      options.push({
        market: 'Away Tip',
        prediction: pred.predictedAwayTip,
        prob: pred.predictedAwayTipProb,
        color: '#EC4899' // pink/magenta color
      });
    }
    if (pred.predictedBttsProb !== undefined && pred.predictedBttsProb !== null) {
      options.push({
        market: 'BTTS',
        prediction: pred.predictedBtts,
        prob: pred.predictedBttsProb,
        color: pred.predictedBtts === 'GG' ? '#00FF88' : '#FFD700'
      });
    }
    if (pred.predictedOver15Prob !== undefined && pred.predictedOver15Prob !== null && pred.predictedOver15) {
      options.push({
        market: 'O/U 1.5',
        prediction: `${pred.predictedOver15} 1.5`,
        prob: pred.predictedOver15Prob,
        color: '#00E5FF'
      });
    }
    if (pred.predictedOver25Prob !== undefined && pred.predictedOver25Prob !== null && pred.predictedOver25) {
      options.push({
        market: 'O/U 2.5',
        prediction: `${pred.predictedOver25} 2.5`,
        prob: pred.predictedOver25Prob,
        color: '#A78BFA'
      });
    }
    
    // Sort descending by probability
    options.sort((a, b) => b.prob - a.prob);
    return options[0] || null;
  };

  const getHistoryReliabilityScore = useCallback((pred) => {
    // We learn from history:
    // Some tips have high historical accuracy even with moderate probability.
    // Confidence alone is sometimes unreliable.
    // We compute a weighted score based on the historical success rate of each prediction component.
    // The components are: Outcome, Double Chance, Home Tip, Away Tip, Over 1.5 Goals.
    // We use caseStudyStats (dynamic) if available with sufficient sample size (say, >= 5 entries),
    // otherwise we use the baseline historical accuracies (from 1,093 picks):
    //   Double Chance: 77%
    //   Home Tip: 77%
    //   Over 1.5 Goals: 74%
    //   Straight Win (>=80%): 83%
    //   Straight Win (<80%): 59% (unreliable!)
    //   Away Tip: 68% (default baseline if not specified)
    
    let scores = [];
    
    // 1. Outcome / Straight Win component
    const outcomeProb = pred.predictedOutcomeProb || 0;
    const isStraightWin = pred.predictedOutcome === 'H' || pred.predictedOutcome === 'A';
    if (isStraightWin) {
      if (outcomeProb >= 80) {
        const histAcc = (caseStudyStats?.straightWin80?.total >= 5) ? caseStudyStats.straightWin80.accuracy : 83;
        scores.push({ weight: 0.35, val: histAcc });
      } else {
        // Less than 80% straight win is historically risky! (hits at 59% overall)
        const histAcc = (caseStudyStats && caseStudyStats.highConf?.total >= 5) ? Math.min(caseStudyStats.highConf.accuracy, 59) : 59;
        scores.push({ weight: 0.3, val: histAcc });
      }
    } else {
      // Draw outcome
      scores.push({ weight: 0.1, val: 30 }); // Draws are extremely hard to hit (30% accuracy baseline)
    }
    
    // 2. Double Chance component
    if (pred.predictedHomeOrAwayProb !== undefined && pred.predictedHomeOrAwayProb !== null) {
      const dcProb = pred.predictedHomeOrAwayProb;
      if (dcProb >= 65) {
        const histAcc = (caseStudyStats?.doubleChance?.total >= 5) ? caseStudyStats.doubleChance.accuracy : 77;
        scores.push({ weight: 0.35, val: histAcc });
      }
    }
    
    // 3. Home/Away Tips component
    if (pred.predictedHomeTip && pred.predictedHomeTipProb >= 65) {
      const histAcc = (caseStudyStats?.homeTip?.total >= 5) ? caseStudyStats.homeTip.accuracy : 77;
      scores.push({ weight: 0.25, val: histAcc });
    }
    if (pred.predictedAwayTip && pred.predictedAwayTipProb >= 65) {
      const histAcc = (caseStudyStats?.awayTip?.total >= 5) ? caseStudyStats.awayTip.accuracy : 68;
      scores.push({ weight: 0.25, val: histAcc });
    }
    
    // 4. Goals Over 1.5 component
    if (pred.predictedOver15 === 'Over' && pred.predictedOver15Prob >= 65) {
      const histAcc = (caseStudyStats?.over15?.total >= 5) ? caseStudyStats.over15.accuracy : 74;
      scores.push({ weight: 0.3, val: histAcc });
    }
    
    if (scores.length === 0) {
      return pred.confidence || 50; // Fallback to general confidence
    }
    
    // Calculate weighted average
    const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = scores.reduce((sum, s) => sum + (s.val * s.weight), 0);
    const reliabilityScore = Math.round(weightedSum / totalWeight);
    
    return reliabilityScore;
  }, [caseStudyStats]);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA-DRIVEN THRESHOLDS from historical analysis of 1,093 resolved picks:
  //   doubleChance ≥65%  → 77% historical accuracy
  //   homeTip ≥65%       → 77% historical accuracy
  //   over15 ≥65%        → 74% historical accuracy
  //   straightWin ≥65%   → 59% historical accuracy (non-draw outcomes)
  //   straightWin ≥80%   → 83% historical accuracy (elite)
  // ─────────────────────────────────────────────────────────────────────────

  // Helper to filter predictions dynamically based on selected sub-tab
  const getFilteredPredictions = (predictions, subTab) => {
    if (!predictions || predictions.length === 0) return [];
    console.log(`[PredictionsDashboard] [DEBUG] 🔽 Filtering ${predictions.length} predictions for sub-tab: "${subTab}"`);

    if (subTab === 'all') {
      return predictions;
    }
    if (subTab === 'historyelite') {
      console.log('[PredictionsDashboard] [DEBUG] 🧬 Filtering and sorting by History Elite reliability score...');
      const filtered = predictions
        .map(p => {
          const score = getHistoryReliabilityScore(p);
          return { ...p, reliabilityScore: score };
        })
        .filter(p => p.reliabilityScore >= 74);
      
      // Sort descending by reliability score
      return filtered.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    }
    if (subTab === 'best') {
      // High-confidence picks (≥75% confidence score)
      return predictions.filter(p => p.confidence >= 75);
    }
    if (subTab === 'beststraightwin') {
      // BEST STRAIGHT WIN: straight/home/away outcome predicted, NOT a draw, prob ≥65%
      // Data shows straightWin≥65% hits at 59% overall, and ≥80% hits at 83%.
      // We filter non-draw outcomes with meaningful probability.
      const filtered = predictions.filter(p => {
        const isNotDraw = p.predictedOutcome === 'H' || p.predictedOutcome === 'A';
        const hasHighProb = (p.predictedOutcomeProb || 0) >= 65;
        return isNotDraw && hasHighProb;
      });
      // Sort by outcome probability descending for best first
      return filtered.sort((a, b) => (b.predictedOutcomeProb || 0) - (a.predictedOutcomeProb || 0));
    }
    if (subTab === 'bestperforming') {
      // BEST PERFORMING — composite filter: must meet AT LEAST ONE proven high-accuracy threshold
      // doubleChance≥65% (77% acc) OR homeTip≥65% (77% acc) OR over15≥65% (74% acc)
      const filtered = predictions.filter(p => {
        const dcGood = (p.predictedHomeOrAwayProb || 0) >= 65;
        const htGood = (p.predictedHomeTipProb || 0) >= 65;
        const o15Good = p.predictedOver15 === 'Over' && (p.predictedOver15Prob || 0) >= 65;
        return dcGood || htGood || o15Good;
      });
      // Sort by best composite score
      return filtered.sort((a, b) => {
        const scoreA = Math.max(
          a.predictedHomeOrAwayProb || 0,
          a.predictedHomeTipProb || 0,
          a.predictedOver15 === 'Over' ? (a.predictedOver15Prob || 0) : 0
        );
        const scoreB = Math.max(
          b.predictedHomeOrAwayProb || 0,
          b.predictedHomeTipProb || 0,
          b.predictedOver15 === 'Over' ? (b.predictedOver15Prob || 0) : 0
        );
        return scoreB - scoreA;
      });
    }
    if (subTab === 'best15') {
      // Over 1.5 goals — 74% accuracy when prob≥65% per history
      return predictions.filter(p => p.predictedOver15 === 'Over' && (p.predictedOver15Prob || 0) >= 65);
    }
    if (subTab === 'singlehome' || subTab === 'singleaway') {
      return predictions; // Render handles single tip display
    }
    if (subTab === 'besthomeaway') {
      // Double Chance: 77% accuracy at ≥65% threshold per database case study
      return predictions.filter(p => (p.predictedHomeOrAwayProb || 0) >= 65);
    }
    if (subTab === 'bestsingle') {
      let topPred = null;
      let topTipVal = -1;

      predictions.forEach(p => {
        const bestTip = getBestSingleTip(p);
        if (bestTip && bestTip.prob > topTipVal) {
          topTipVal = bestTip.prob;
          topPred = p;
        }
      });

      return topPred ? [topPred] : [];
    }
    return predictions;
  };

  
  // History states
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const leagueTabs = [
    { id: 'all',              label: 'All Leagues', emoji: '🌍' },
    { id: 'England League',   label: 'England',   emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'Spain League',     label: 'Spain',     emoji: '🇪🇸' },
    { id: 'Italy League',     label: 'Italy',     emoji: '🇮🇹' },
    { id: 'Germany League',   label: 'Germany',   emoji: '🇩🇪' },
    { id: 'France League',    label: 'France',    emoji: '🇫🇷' }
  ];

  // Historical accuracy stats from 1,093 resolved picks — used to show users what's proven
  const HISTORY_ACCURACY_STATS = [
    { market: 'Double Chance ≥65%', accuracy: 77, color: '#F43F5E', emoji: '🤝', note: '184 picks' },
    { market: 'Home Tip ≥65%',      accuracy: 77, color: '#3B82F6', emoji: '🏠', note: '100 picks' },
    { market: 'Over 1.5 ≥65%',      accuracy: 74, color: '#00E5FF', emoji: '⚽', note: '147 picks' },
    { market: 'Straight Win ≥80%',  accuracy: 83, color: '#00FF88', emoji: '🏆', note: '6 elite picks' },
    { market: 'Double Chance ≥85%', accuracy: 80, color: '#FF6B35', emoji: '🔥', note: '119 picks' },
  ];

  // Fetch prediction history logs — stabilized with useCallback to prevent re-render loops
  const fetchPredictionsHistory = useCallback(async (league) => {
    const targetLeague = league || selectedLeague;
    setLoadingHistory(true);
    setHistoryError(null);
    console.log(`[PredictionsDashboard] [DEBUG] 📜 Querying prediction history logs for league: "${targetLeague}"`);
    
    try {
      const response = await fetch(`/api/local-vfootball/predictions-history?league=${encodeURIComponent(targetLeague)}`);
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status} (${response.statusText})`);
      }
      
      const data = await response.json();
      console.log(`[PredictionsDashboard] [DEBUG] 📡 Received API response:`, data);
      
      if (data.success) {
        setHistoryList(data.history || []);
        console.log(`[PredictionsDashboard] [DEBUG] ✅ Successfully loaded ${data.history?.length || 0} history records.`);
      } else {
        throw new Error(data.error || 'Failed to fetch predictions history from database');
      }
    } catch (err) {
      console.error('[PredictionsDashboard] [DEBUG] ❌ History Fetch Error:', err);
      setHistoryError(`We couldn't load the prediction logs: ${err.message}. Please verify your server connection and Supabase configuration.`);
    } finally {
      setLoadingHistory(false);
    }
  // selectedLeague used as fallback — stable ref via useCallback
  }, [selectedLeague]);

  // ── Resolve Pending for a SPECIFIC league: scrapes only that league then resolves ──
  const handleResolvePending = async (leagueToCheck) => {
    if (resolvingPending) return;
    setResolvingPending(true);
    setResolveStatus(`🔄 Step 1/3: Scraping fresh results for ${leagueToCheck}...`);
    console.log(`[PredictionsDashboard] [DEBUG] ⚙️ Check Outcomes for league: "${leagueToCheck}"`);
    
    try {
      // Step 1: Scrape only this league
      setResolveStatus(`🔍 Scraping: ${leagueToCheck}...`);
      try {
        const scrapeRes = await fetch(`/api/local-vfootball/sync-league?league=${encodeURIComponent(leagueToCheck)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          console.log(`[PredictionsDashboard] [DEBUG] ✅ Scraped "${leagueToCheck}": added ${scrapeData.added || 0} new results.`);
        } else {
          console.warn(`[PredictionsDashboard] [DEBUG] ⚠️ Scrape returned ${scrapeRes.status} for "${leagueToCheck}" — continuing...`);
        }
      } catch (scrapeErr) {
        console.warn(`[PredictionsDashboard] [DEBUG] ⚠️ Scrape error for "${leagueToCheck}": ${scrapeErr.message} — continuing...`);
      }

      // Step 2: Resolve pending predictions
      setResolveStatus('⚙️ Step 2/3: Resolving pending outcomes...');
      console.log('[PredictionsDashboard] [DEBUG] ⚙️ Calling resolve-pending...');
      const res = await fetch('/api/predictions/resolve-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.success) {
        setResolveStatus('📥 Step 3/3: Refreshing history...');
        console.log('[PredictionsDashboard] [DEBUG] ✅ Resolve complete. Re-fetching updated history...');
        await fetchPredictionsHistory(selectedLeague);
        setResolveStatus(`✅ ${leagueToCheck} updated!`);
        setTimeout(() => setResolveStatus(''), 4000);
      } else {
        setResolveStatus(`❌ Resolve failed: ${data.error || 'Unknown error'}`);
        console.error('[PredictionsDashboard] [DEBUG] ❌ Resolve endpoint failed:', data.error);
        setTimeout(() => setResolveStatus(''), 5000);
      }
    } catch (err) {
      console.error('[PredictionsDashboard] [DEBUG] ❌ Error during resolve:', err);
      setResolveStatus(`❌ Error: ${err.message}`);
      setTimeout(() => setResolveStatus(''), 5000);
    } finally {
      setResolvingPending(false);
    }
  };

  // ── Resolve All: scrapes all 5 leagues then resolves pending outcomes ──
  const handleResolveAllPending = async () => {
    if (resolvingPending) return;
    setResolvingPending(true);
    setResolveStatus('🔄 Checking all leagues — Step 1/3: Scraping fresh results...');
    console.log('[PredictionsDashboard] [DEBUG] ⚙️ Check All Outcomes — scraping all 5 leagues...');

    const allLeagues = ['England League', 'Spain League', 'Italy League', 'Germany League', 'France League'];
    
    try {
      // Step 1: Scrape all leagues
      for (const league of allLeagues) {
        console.log(`[PredictionsDashboard] [DEBUG] 🔍 Scraping: ${league}`);
        setResolveStatus(`🔍 Scraping: ${league}...`);
        try {
          const scrapeRes = await fetch(`/api/local-vfootball/sync-league?league=${encodeURIComponent(league)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (scrapeRes.ok) {
            const d = await scrapeRes.json();
            console.log(`[PredictionsDashboard] [DEBUG] ✅ Scraped ${league}: +${d.added || 0} results.`);
          } else {
            console.warn(`[PredictionsDashboard] [DEBUG] ⚠️ Scrape ${scrapeRes.status} for ${league} — continuing...`);
          }
        } catch (e) {
          console.warn(`[PredictionsDashboard] [DEBUG] ⚠️ Scrape error for ${league}: ${e.message}`);
        }
      }

      // Step 2: Resolve all pending
      setResolveStatus('⚙️ Step 2/3: Resolving ALL pending outcomes...');
      const res = await fetch('/api/predictions/resolve-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.success) {
        setResolveStatus('📥 Step 3/3: Refreshing history...');
        await fetchPredictionsHistory(selectedLeague);
        setResolveStatus('✅ All leagues updated!');
        setTimeout(() => setResolveStatus(''), 4000);
      } else {
        setResolveStatus(`❌ Resolve failed: ${data.error || 'Unknown error'}`);
        setTimeout(() => setResolveStatus(''), 5000);
      }
    } catch (err) {
      console.error('[PredictionsDashboard] [DEBUG] ❌ Check All Outcomes error:', err);
      setResolveStatus(`❌ Error: ${err.message}`);
      setTimeout(() => setResolveStatus(''), 5000);
    } finally {
      setResolvingPending(false);
    }
  };

  // Fetch history when view is toggled to history or league changes
  // Uses a stable useCallback ref — no infinite re-render loop
  useEffect(() => {
    let intervalId;
    if (activeView === 'history') {
      fetchPredictionsHistory(selectedLeague);
      
      // Auto-refresh every 60s (not 30s to reduce server load) — only when on history tab
      console.log('[PredictionsDashboard] [DEBUG] 🔄 Initializing auto-refresh interval for predictions history (60s)...');
      intervalId = setInterval(() => {
        console.log('[PredictionsDashboard] [DEBUG] ⏱️ Auto-refresh triggered for history...');
        fetchPredictionsHistory(selectedLeague);
      }, 60000);
    }
    
    return () => {
      if (intervalId) {
        console.log('[PredictionsDashboard] [DEBUG] 🛑 Clearing predictions history auto-refresh interval.');
        clearInterval(intervalId);
      }
    };
  }, [activeView, selectedLeague, fetchPredictionsHistory]);

  // Effect to analyze prediction history for dynamic case studies
  useEffect(() => {
    if (historyList && historyList.length > 0) {
      console.log('[PredictionsDashboard] [DEBUG] 📊 Analyzing prediction history database for Case Study insights...');
      
      const resolvedPredictions = [];
      historyList.forEach(round => {
        if (round.predictions) {
          round.predictions.forEach(p => {
            if (p.resolved) {
              resolvedPredictions.push({
                ...p,
                league: round.league,
                date: round.date,
                time: round.time
              });
            }
          });
        }
      });
      
      console.log(`[PredictionsDashboard] [DEBUG] Found ${resolvedPredictions.length} resolved predictions in local database history.`);
      
      if (resolvedPredictions.length > 0) {
        // 1. Calculate accuracy of High Confidence (>=75%) picks
        const highConfPicks = resolvedPredictions.filter(p => p.confidence >= 75);
        const highConfCorrect = highConfPicks.filter(p => p.outcomeCorrect);
        const highConfAcc = highConfPicks.length > 0 ? Math.round((highConfCorrect.length / highConfPicks.length) * 100) : null;

        // 2. Calculate accuracy of Double Chance (>=65% predictedHomeOrAwayProb)
        const dcPicks = resolvedPredictions.filter(p => (p.predictedHomeOrAwayProb || 0) >= 65);
        const dcCorrect = dcPicks.filter(p => p.homeOrAwayCorrect);
        const dcAcc = dcPicks.length > 0 ? Math.round((dcCorrect.length / dcPicks.length) * 100) : null;

        // 3. Calculate accuracy of Home/Away Tip (>=65% prob)
        const homeTipPicks = resolvedPredictions.filter(p => p.predictedHomeTip && (p.predictedHomeTipProb || 0) >= 65);
        const homeTipCorrect = homeTipPicks.filter(p => p.homeTipCorrect);
        const homeTipAcc = homeTipPicks.length > 0 ? Math.round((homeTipCorrect.length / homeTipPicks.length) * 100) : null;

        const awayTipPicks = resolvedPredictions.filter(p => p.predictedAwayTip && (p.predictedAwayTipProb || 0) >= 65);
        const awayTipCorrect = awayTipPicks.filter(p => p.awayTipCorrect);
        const awayTipAcc = awayTipPicks.length > 0 ? Math.round((awayTipCorrect.length / awayTipPicks.length) * 100) : null;
        
        // 4. Calculate accuracy of Over 1.5 Goals (>=65% prob)
        const o15Picks = resolvedPredictions.filter(p => p.predictedOver15 === 'Over' && (p.predictedOver15Prob || 0) >= 65);
        const o15Correct = o15Picks.filter(p => p.over15Correct);
        const o15Acc = o15Picks.length > 0 ? Math.round((o15Correct.length / o15Picks.length) * 100) : null;

        // 5. Calculate accuracy of Straight Win >= 80% outcome probability
        const straightWin80Picks = resolvedPredictions.filter(p => (p.predictedOutcome === 'H' || p.predictedOutcome === 'A') && (p.predictedOutcomeProb || 0) >= 80);
        const straightWin80Correct = straightWin80Picks.filter(p => p.outcomeCorrect);
        const straightWin80Acc = straightWin80Picks.length > 0 ? Math.round((straightWin80Correct.length / straightWin80Picks.length) * 100) : null;

        // 6. Overall breakdown
        const stats = {
          totalResolved: resolvedPredictions.length,
          highConf: { total: highConfPicks.length, correct: highConfCorrect.length, accuracy: highConfAcc },
          doubleChance: { total: dcPicks.length, correct: dcCorrect.length, accuracy: dcAcc },
          homeTip: { total: homeTipPicks.length, correct: homeTipCorrect.length, accuracy: homeTipAcc },
          awayTip: { total: awayTipPicks.length, correct: awayTipCorrect.length, accuracy: awayTipAcc },
          over15: { total: o15Picks.length, correct: o15Correct.length, accuracy: o15Acc },
          straightWin80: { total: straightWin80Picks.length, correct: straightWin80Correct.length, accuracy: straightWin80Acc }
        };
        
        console.log('[PredictionsDashboard] [DEBUG] 📡 dynamic case study analysis complete:', stats);
        setCaseStudyStats(stats);
      }
    }
  }, [historyList]);

  // Trigger DeepSeek live predictions
  const handlePredictLiveList = async (predictAll = false) => {
    if (predicting) return;
    setPredicting(true);
    setPredictionError(null);
    setPredictionResults(null);
    
    const targetQuery = predictAll ? 'all' : selectedLeague;
    console.log(`[PredictionsDashboard] [DEBUG] 🔮 Triggering DeepSeek live list prediction for target: "${targetQuery}"`);
    
    try {
      const response = await fetch(`/api/local-vfootball/predict-live?league=${encodeURIComponent(targetQuery)}`);
      if (!response.ok) {
        throw new Error(`Live Predictor returned status ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[PredictionsDashboard] [DEBUG] 📡 Live predictor response:`, data);
      
      if (data.success) {
        if (data.predictions && data.predictions.length > 0) {
          setPredictionResults(data);
          console.log(`[PredictionsDashboard] [DEBUG] ✅ Successfully generated predictions for round:`, data.league || 'All');
        } else {
          setPredictionError(data.message || `No active virtual football matches were found for ${selectedLeague} on SportyBet right now.`);
        }
      } else {
        throw new Error(data.error || 'DeepSeek AI execution failed.');
      }
    } catch (err) {
      console.error('[PredictionsDashboard] [DEBUG] ❌ Prediction Error:', err);
      setPredictionError(`Live AI prediction failed: ${err.message}. Please check that your DEEPSEEK_API_KEY is configured in your server env.`);
    } finally {
      setPredicting(false);
    }
  };

  // Capture PNG screenshot of predictions element
  const handleCaptureScreenshot = async () => {
    if (!predictionsRef.current || capturing) return;
    setCapturing(true);
    console.log('[PredictionsDashboard] [DEBUG] 📸 Capturing high-resolution PNG screenshot...');
    
    try {
      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(predictionsRef.current, {
        useCORS: true,
        backgroundColor: '#0A0F1E',
        scale: 2,
        logging: false
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const filename = `predictions_${predictionResults?.league ? predictionResults.league.replace(/[^a-zA-Z0-9]/g, '_') : 'round'}.png`;
      link.download = filename;
      link.href = dataUrl;
      link.click();
      
      console.log(`[PredictionsDashboard] [DEBUG] ✅ Screenshot saved as: ${filename}`);
    } catch (err) {
      console.error('[PredictionsDashboard] [DEBUG] ❌ Screenshot Capture Failed:', err);
    } finally {
      setCapturing(false);
    }
  };

  // Capture professional PDF report of live predictions with Overview & Detailed Match breakdown
  const handleExportPDF = async () => {
    if (!predictionResults || exportingPDF) return;
    setExportingPDF(true);
    console.log('[PredictionsDashboard] [DEBUG] 📄 Starting professional PDF report generation...');

    try {
      const preds = predictionResults.predictions || [];
      console.log(`[PredictionsDashboard] [DEBUG] 📋 Predictions count: ${preds.length}`);
      console.log('[PredictionsDashboard] [DEBUG] 📊 Calculating stats: total matches, average confidence, high confidence picks...');

      // Calculate executive statistics
      const totalPredictions = preds.length;
      const avgConfidence = totalPredictions > 0
        ? Math.round(preds.reduce((acc, curr) => acc + (curr.confidence || 0), 0) / totalPredictions)
        : 0;
      const highConfidenceCount = preds.filter(p => p.confidence >= 75).length;
      const leagueName = predictionResults.league || 'All Leagues';
      const providerName = (predictionResults.provider || 'AI').toUpperCase();
      const timestamp = new Date().toLocaleString();

      console.log(`[PredictionsDashboard] [DEBUG] ⚡ Calculated stats: Avg Conf = ${avgConfidence}%, High Conf Count = ${highConfidenceCount}`);

      // Initialize landscape orientation A4 PDF (297mm x 210mm)
      console.log('[PredictionsDashboard] [DEBUG] 🖋️ Initializing jsPDF document...');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // ─────────────────────────────────────────────────────────────────────────
      // PAGE 1: HEADER & EXECUTIVE SUMMARY & OVERVIEW TABLE
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[PredictionsDashboard] [DEBUG] 🖋️ Drawing Page 1 components...');
      
      // 1. Header Bar
      pdf.setFillColor(15, 23, 42); // slate-900
      pdf.rect(10, 10, 277, 22, 'F');
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(255, 255, 255);
      pdf.text("MANGO LIVE SPORTS DASHBOARD", 15, 24);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(0, 229, 255); // Cyan neon accent
      pdf.text("🔮 AI LIVE PREDICTIONS REPORT", 210, 24);

      // 2. Info Cards (4 columns layout)
      const cardY = 37;
      const cardH = 18;
      const cardW = 64;
      const cardGap = 7;
      const cardLabels = [
        { title: "LEAGUE / ROUND", val: leagueName.substring(0, 28) },
        { title: "TOTAL MATCHES", val: `${totalPredictions}` },
        { title: "AVG CONFIDENCE", val: `${avgConfidence}%` },
        { title: "HIGH CONFIDENCE (>=75%)", val: `${highConfidenceCount} Picks` }
      ];

      cardLabels.forEach((c, i) => {
        const cardX = 10 + i * (cardW + cardGap);
        // Draw card background
        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.setLineWidth(0.25);
        pdf.rect(cardX, cardY, cardW, cardH, 'FD');

        // Draw top label
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139); // slate-500
        pdf.text(c.title, cardX + 4, cardY + 6);

        // Draw bottom value
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42); // slate-900
        pdf.text(c.val, cardX + 4, cardY + 13);
      });

      // 3. Draw Overview Table
      let currentY = 60;
      pdf.setFillColor(30, 41, 59); // slate-800
      pdf.rect(10, currentY, 277, 8, 'F');

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text("#", 12, currentY + 5.5);
      pdf.text("Match Fixture", 20, currentY + 5.5);
      pdf.text("Outcome Prediction", 94, currentY + 5.5);
      pdf.text("Goal Markets (BTTS / Over-Under)", 142, currentY + 5.5);
      pdf.text("Best Tips & Double Chance", 210, currentY + 5.5);
      pdf.text("Conf.", 274, currentY + 5.5);

      currentY += 8;

      preds.forEach((pred, idx) => {
        // Dynamic page-break inside overview table if we overflow page 1 height (192mm limit)
        if (currentY + 9 > 192) {
          pdf.addPage();
          
          // Draw continuation header bar
          pdf.setFillColor(15, 23, 42);
          pdf.rect(10, 10, 277, 8, 'F');
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          pdf.setTextColor(255, 255, 255);
          pdf.text(`Predictions Table (Continued) - League: ${leagueName}`, 14, 15.5);

          // Draw table header
          pdf.setFillColor(51, 65, 85);
          pdf.rect(10, 18, 277, 7, 'F');
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          pdf.text("#", 12, 23);
          pdf.text("Match Fixture", 20, 23);
          pdf.text("Outcome Prediction", 94, 23);
          pdf.text("Goal Markets (BTTS / Over-Under)", 142, 23);
          pdf.text("Best Tips & Double Chance", 210, 23);
          pdf.text("Conf.", 274, 23);

          currentY = 25;
        }

        // Zebra striping row background
        pdf.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
        pdf.rect(10, currentY, 277, 9, 'F');

        // Draw row bottom border line
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.15);
        pdf.line(10, currentY + 9, 277, currentY + 9);
        pdf.line(10, currentY, 10, currentY + 9);
        pdf.line(277, currentY, 277, currentY + 9);

        // Print row values
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(15, 23, 42);
        pdf.text(`${idx + 1}`, 12, currentY + 6);

        // Match Name
        pdf.text(pred.match || 'Unknown Match', 20, currentY + 6);

        // Core Outcome
        pdf.setFont("helvetica", "normal");
        const outcomeLabel = pred.predictedOutcome === 'H' ? 'Home Win' : pred.predictedOutcome === 'A' ? 'Away Win' : pred.predictedOutcome === 'D' ? 'Draw' : 'N/A';
        pdf.text(`${outcomeLabel} (${pred.predictedOutcomeProb || 0}%)`, 94, currentY + 6);

        // Goal Markets
        const bttsVal = `BTTS: ${pred.predictedBtts || 'N/A'} (${pred.predictedBttsProb || 0}%)`;
        const overVal = `O1.5: ${pred.predictedOver15 || 'N/A'} (${pred.predictedOver15Prob || 0}%)`;
        pdf.text(`${bttsVal}  |  ${overVal}`, 142, currentY + 6);

        // Best Single Tip & DC
        const dcVal = `DC: ${pred.predictedHomeOrAwayProb || 0}%`;
        const bestTip = getBestSingleTip(pred);
        const bestTipText = bestTip ? `Tip: ${bestTip.prediction} (${bestTip.prob}%)` : 'N/A';
        pdf.text(`${dcVal}  |  ${bestTipText}`, 210, currentY + 6);

        // Confidence
        pdf.setFont("helvetica", "bold");
        const conf = pred.confidence || 0;
        if (conf >= 75) {
          pdf.setTextColor(16, 185, 129); // emerald-500 (green)
        } else if (conf >= 55) {
          pdf.setTextColor(245, 158, 11); // amber-500
        } else {
          pdf.setTextColor(99, 102, 241); // indigo-500
        }
        pdf.text(`${conf}%`, 274, currentY + 6);

        currentY += 9;
      });

      // ─────────────────────────────────────────────────────────────────────────
      // PAGE 2+: DETAILED BREAKDOWN (ONE MATCH PER PAGE)
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[PredictionsDashboard] [DEBUG] 📄 Drawing Detailed AI Breakdown (1 match per page)...');

      preds.forEach((pred, idx) => {
        console.log(`[PredictionsDashboard] [DEBUG] 🏟️ Drawing Match detailed page: "${pred.match}" (${idx + 1}/${preds.length})...`);
        pdf.addPage();

        // Top Section Bar
        pdf.setFillColor(30, 41, 59); // slate-800
        pdf.rect(10, 10, 277, 10, 'F');
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(255, 255, 255);
        pdf.text(`MATCH DETAILED AI ANALYSIS (${idx + 1} OF ${preds.length})`, 15, 16.5);

        // Main Detailed Card boundary
        const boxHeight = 168;
        const boxWidth = 277;
        const startX = 10;
        const startY = 24;

        const conf = pred.confidence || 0;
        let accentColor = [99, 102, 241]; // Indigo-500
        if (conf >= 75) {
          accentColor = [16, 185, 129]; // Emerald-500
        } else if (conf >= 55) {
          accentColor = [245, 158, 11]; // Amber-500
        }

        // Draw Card border & fill
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.setLineWidth(0.3);
        pdf.rect(startX, startY, boxWidth, boxHeight, 'FD');

        // Draw left highlight bar
        pdf.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        pdf.rect(startX, startY, 3.5, boxHeight, 'F');

        // 1. Title block inside card
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14.5);
        pdf.setTextColor(15, 23, 42); // slate-900
        pdf.text(pred.match || 'Unknown Match', startX + 8, startY + 12);

        // Subtitle: league, time
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 116, 139); // slate-500
        pdf.text(`${pred.league || leagueName}  |  Kickoff Time: ${pred.time || 'N/A'}  |  Round Status: ${pred.status || 'UPCOMING'}`, startX + 8, startY + 18);

        // Right-aligned Confidence Badge inside card
        pdf.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        pdf.rect(startX + boxWidth - 50, startY + 5, 42, 16, 'F');
        
        pdf.setFontSize(7.5);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.text("CONFIDENCE", startX + boxWidth - 48, startY + 11);
        
        pdf.setFontSize(12);
        pdf.text(`${conf}%`, startX + boxWidth - 48, startY + 19);

        // Separator line
        pdf.setDrawColor(241, 245, 249);
        pdf.setLineWidth(0.25);
        pdf.line(startX + 8, startY + 23, startX + boxWidth - 8, startY + 23);

        // 2. Metrics Grid (3 columns cards layout)
        const gridY = startY + 28;
        const gridH = 34;
        const gridW = 78;
        const gridGap = 8;

        // Card A: Outcome probabilities
        const cardAX = startX + 8;
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.rect(cardAX, gridY, gridW, gridH, 'FD');

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text("CORE OUTCOMES", cardAX + 4, gridY + 6);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(51, 65, 85);
        const outcomeLabel = pred.predictedOutcome === 'H' ? 'Home Win' : pred.predictedOutcome === 'A' ? 'Away Win' : 'Draw';
        pdf.text(`Outcome: ${outcomeLabel} (${pred.predictedOutcomeProb || 0}%)`, cardAX + 4, gridY + 14);
        pdf.text(`Double Chance: H/A (${pred.predictedHomeOrAwayProb || 0}%)`, cardAX + 4, gridY + 21);
        pdf.text(`BTTS GG: ${pred.predictedBttsProb || 0}% (${pred.predictedBtts})`, cardAX + 4, gridY + 28);

        // Card B: Goal Markets
        const cardBX = cardAX + gridW + gridGap;
        pdf.setFillColor(248, 250, 252);
        pdf.rect(cardBX, gridY, gridW, gridH, 'FD');

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text("GOAL MARKETS", cardBX + 4, gridY + 6);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(51, 65, 85);
        pdf.text(`Over 1.5 Goals: ${pred.predictedOver15 === 'Over' ? 'Over' : 'Under'} (${pred.predictedOver15Prob || 0}%)`, cardBX + 4, gridY + 14);
        pdf.text(`Over 2.5 Goals: ${pred.predictedOver25 === 'Over' ? 'Over' : 'Under'} (${pred.predictedOver25Prob || 0}%)`, cardBX + 4, gridY + 21);
        pdf.text(`BTTS NG: ${100 - (pred.predictedBttsProb || 0)}%`, cardBX + 4, gridY + 28);

        // Card C: Algorithmic tips
        const cardCX = cardBX + gridW + gridGap;
        pdf.setFillColor(248, 250, 252);
        pdf.rect(cardCX, gridY, gridW, gridH, 'FD');

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text("ALGORITHMIC TIPS", cardCX + 4, gridY + 6);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(51, 65, 85);
        pdf.text(`Home Tip: ${pred.predictedHomeTip || 'N/A'} (${pred.predictedHomeTipProb || 0}%)`, cardCX + 4, gridY + 14);
        pdf.text(`Away Tip: ${pred.predictedAwayTip || 'N/A'} (${pred.predictedAwayTipProb || 0}%)`, cardCX + 4, gridY + 21);
        const bestTip = getBestSingleTip(pred);
        const bestTipLabel = bestTip ? `Best Single: ${bestTip.prediction} (${bestTip.prob}%)` : 'Best Single: N/A';
        pdf.text(bestTipLabel, cardCX + 4, gridY + 28);

        // Separator line
        pdf.setDrawColor(241, 245, 249);
        pdf.setLineWidth(0.25);
        pdf.line(startX + 8, gridY + gridH + 5, startX + boxWidth - 8, gridY + gridH + 5);

        // 3. AI Reasoning Box
        const reasoningY = gridY + gridH + 10;
        const reasoningH = 82;
        pdf.setFillColor(248, 250, 252); // slate-50 background
        pdf.rect(startX + 8, reasoningY, boxWidth - 16, reasoningH, 'FD');

        // Blockquote accent line
        pdf.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        pdf.rect(startX + 11, reasoningY + 4, 2, reasoningH - 8, 'F');

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text("🧠 AI RECOMMENDATION CONTEXT & LOGICAL REASONING", startX + 18, reasoningY + 8);

        // Split text and wrap
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(51, 65, 85); // slate-700
        const reasoningText = pred.reasoning || "No detailed reasoning analysis provided by the AI for this match.";
        
        const splitLines = pdf.splitTextToSize(reasoningText, boxWidth - 36);
        let textY = reasoningY + 16;
        for (let lineIdx = 0; lineIdx < Math.min(splitLines.length, 11); lineIdx++) {
          pdf.text(splitLines[lineIdx], startX + 18, textY);
          textY += 5.5; // line spacing
        }
      });

      // ─────────────────────────────────────────────────────────────────────────
      // STITCH FOOTERS & PAGE NUMBERS (TWO-PASS DRAW)
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[PredictionsDashboard] [DEBUG] 📑 Drawing unified footers and page numbers...');
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // Footer line
        pdf.setDrawColor(241, 245, 249);
        pdf.setLineWidth(0.25);
        pdf.line(10, 202, 287, 202);

        // Footer Text
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(148, 163, 184); // slate-400
        pdf.text("Mango Live Sports Dashboard  |  AI Live Predictions Report", 10, 206);
        pdf.text(`Generated: ${timestamp}  |  AI Provider: ${providerName}`, 95, 206);
        pdf.text(`Page ${i} of ${totalPages}`, 266, 206);
      }

      // Save the generated document
      const leagueFileName = predictionResults?.league ? predictionResults.league.replace(/[^a-zA-Z0-9]/g, '_') : 'round';
      const filename = `predictions_report_${leagueFileName}.pdf`;
      pdf.save(filename);

      console.log(`[PredictionsDashboard] [DEBUG] ✅ PDF export complete! Saved as: ${filename}`);
    } catch (err) {
      console.error('[PredictionsDashboard] [DEBUG] ❌ PDF Export Failed:', err);
    } finally {
      setExportingPDF(false);
    }
  };

  const getOutcomeColor = (out) => {
    if (out === 'H') return '#00FF88'; // success green
    if (out === 'A') return '#A78BFA'; // purple
    return '#FFD700'; // gold
  };

  const getLeagueBadge = (lg) => {
    if (!lg) return null;
    const lower = lg.toLowerCase();
    if (lower.includes('england')) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿 ENG';
    if (lower.includes('spain')) return '🇪🇸 ESP';
    if (lower.includes('italy')) return '🇮🇹 ITA';
    if (lower.includes('germany')) return '🇩🇪 GER';
    if (lower.includes('france')) return '🇫🇷 FRA';
    return lg.substring(0, 3).toUpperCase();
  };

  const renderPredictionCard = (pred, subTab = 'all') => {
    const matchStatus = pred.status || 'UPCOMING';
    const cardLeague = pred.league || predictionResults?.league || '';
    const isSingleHomeView = subTab === 'singlehome';
    const isSingleAwayView = subTab === 'singleaway';
    const isBestHomeAwayView = subTab === 'besthomeaway';
    const isBestSingleView = subTab === 'bestsingle';
    const isBest15View = subTab === 'best15';
    const isBestStraightWin = subTab === 'beststraightwin';
    const isBestPerforming = subTab === 'bestperforming';
    const isHistoryElite = subTab === 'historyelite';

    let borderLeftColor = 'var(--accent-neon)';
    if (isHistoryElite) {
      borderLeftColor = '#FFD700';
    } else if (isBestStraightWin) {
      borderLeftColor = '#00FF88';
    } else if (isBestPerforming) {
      // Use the best-scoring market color
      const dcGood = (pred.predictedHomeOrAwayProb || 0) >= 65;
      const htGood = (pred.predictedHomeTipProb || 0) >= 65;
      const o15Good = pred.predictedOver15 === 'Over' && (pred.predictedOver15Prob || 0) >= 65;
      if (dcGood && (pred.predictedHomeOrAwayProb || 0) >= (pred.predictedHomeTipProb || 0)) {
        borderLeftColor = '#F43F5E';
      } else if (htGood) {
        borderLeftColor = '#3B82F6';
      } else if (o15Good) {
        borderLeftColor = '#00E5FF';
      } else {
        borderLeftColor = '#A78BFA';
      }
    } else if (isBest15View) {
      borderLeftColor = '#00E5FF';
    } else if (isSingleHomeView) {
      borderLeftColor = '#3B82F6';
    } else if (isSingleAwayView) {
      borderLeftColor = '#EC4899';
    } else if (isBestHomeAwayView) {
      borderLeftColor = '#F43F5E';
    } else if (isBestSingleView) {
      const bestTip = getBestSingleTip(pred);
      borderLeftColor = bestTip?.color || 'var(--accent-neon)';
    } else {
      borderLeftColor = pred.color || 'var(--accent-neon)';
    }
    
    return (
      <div 
        key={`${cardLeague}_${pred.position}`} 
        className="glass-panel hover-lift" 
        style={{ 
          padding: '16px', 
          border: '1px solid rgba(255,255,255,0.06)',
          borderLeft: `4px solid ${borderLeftColor}`,
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px',
          background: 'rgba(0,0,0,0.15)',
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
          width: '100%'
        }}
      >
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              background: `${borderLeftColor}15`, 
              color: borderLeftColor, 
              width: '24px', 
              height: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '50%', 
              fontWeight: 800, 
              border: `1px solid ${borderLeftColor}30`,
              fontSize: '0.74rem'
            }}>
              {pred.position + 1}
            </span>
            
            {cardLeague && (
              <span style={{
                fontSize: '0.62rem',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.1)',
                fontWeight: 'bold'
              }}>
                {getLeagueBadge(cardLeague)}
              </span>
            )}

            <span style={{ 
              fontSize: '0.62rem', 
              background: matchStatus === 'IN-PLAY' ? 'rgba(255, 51, 85, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
              color: matchStatus === 'IN-PLAY' ? 'var(--accent-live)' : 'var(--text-secondary)',
              padding: '2px 6px', 
              borderRadius: '4px',
              fontWeight: 'bold',
              border: matchStatus === 'IN-PLAY' ? '1px solid rgba(255, 51, 85, 0.2)' : '1px solid rgba(255,255,255,0.05)'
            }}>
              {matchStatus}
            </span>
            {pred.time && (
              <span style={{
                fontSize: '0.62rem',
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--accent-neon)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                fontFamily: 'monospace',
                fontWeight: 'bold'
              }}>
                🕒 {pred.time}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Confidence:</span>
              <strong style={{ 
                fontSize: '0.85rem', 
                color: pred.confidence >= 75 ? '#00FF88' : pred.confidence >= 55 ? '#FFD700' : '#A78BFA'
              }}>{pred.confidence}%</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Reliability:</span>
              <strong style={{ 
                fontSize: '0.8rem', 
                color: getHistoryReliabilityScore(pred) >= 75 ? '#FFD700' : getHistoryReliabilityScore(pred) >= 65 ? '#00E5FF' : '#A78BFA'
              }}>🧠 {getHistoryReliabilityScore(pred)}%</strong>
            </div>
          </div>
        </div>

        {/* Match Name */}
        <strong style={{ color: 'white', fontSize: '0.94rem' }}>
          {pred.match}
        </strong>

        {/* Badges */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isHistoryElite && (
            <div style={{
              background: 'rgba(255, 215, 0, 0.12)',
              border: '2px solid #FFD700',
              color: '#FFD700',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 10px rgba(255, 215, 0, 0.15)'
            }}>
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🧠 HISTORY ELITE:</span>
              <span>Reliability Score: {getHistoryReliabilityScore(pred)}%</span>
            </div>
          )}
          {isBestStraightWin ? (
            <div style={{
              background: 'rgba(0, 255, 136, 0.12)',
              border: '2px solid #00FF88',
              color: '#00FF88',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 10px rgba(0, 255, 136, 0.15)'
            }}>
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🏆 STRAIGHT WIN:</span>
              <span>{pred.predictedOutcome === 'H' ? 'Home Win' : 'Away Win'} ({pred.predictedOutcomeProb}%)</span>
            </div>
          ) : isBestPerforming ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(pred.predictedHomeOrAwayProb || 0) >= 65 && (
                <div style={{ background: 'rgba(244,63,94,0.12)', border: '2px solid #F43F5E', color: '#F43F5E', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.58rem', opacity: 0.8, textTransform: 'uppercase' }}>🤝 DC (77% hist acc):</span>
                  <span>H or A ({pred.predictedHomeOrAwayProb}%)</span>
                </div>
              )}
              {(pred.predictedHomeTipProb || 0) >= 65 && (
                <div style={{ background: 'rgba(59,130,246,0.12)', border: '2px solid #3B82F6', color: '#3B82F6', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.58rem', opacity: 0.8, textTransform: 'uppercase' }}>🏠 HomeTip (77% hist acc):</span>
                  <span>{pred.predictedHomeTip} ({pred.predictedHomeTipProb}%)</span>
                </div>
              )}
              {pred.predictedOver15 === 'Over' && (pred.predictedOver15Prob || 0) >= 65 && (
                <div style={{ background: 'rgba(0,229,255,0.12)', border: '2px solid #00E5FF', color: '#00E5FF', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.58rem', opacity: 0.8, textTransform: 'uppercase' }}>⚽ O1.5 (74% hist acc):</span>
                  <span>Over 1.5 ({pred.predictedOver15Prob}%)</span>
                </div>
              )}
            </div>
          ) : isBestSingleView ? (
            (() => {
              const bestTip = getBestSingleTip(pred);
              return bestTip ? (
                <div style={{ 
                  background: `${bestTip.color}12`,
                  border: `2px solid ${bestTip.color}`,
                  color: bestTip.color,
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: `0 0 10px ${bestTip.color}15`
                }}>
                  <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🔥 BEST SINGLE TIP ({bestTip.market}):</span>
                  <span>{bestTip.prediction} ({bestTip.prob}%)</span>
                </div>
              ) : null;
            })()
          ) : isSingleHomeView ? (
            <div style={{ 
              background: 'rgba(59, 130, 246, 0.12)',
              border: `2px solid #3B82F6`,
              color: '#3B82F6',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 10px rgba(59, 130, 246, 0.15)'
            }}>
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🏠 HOME SINGLE TIP:</span>
              <span>{pred.predictedHomeTip || 'N/A'} ({pred.predictedHomeTipProb || 0}%)</span>
            </div>
          ) : isSingleAwayView ? (
            <div style={{ 
              background: 'rgba(236, 72, 153, 0.12)',
              border: `2px solid #EC4899`,
              color: '#EC4899',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 10px rgba(236, 72, 153, 0.15)'
            }}>
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>✈️ AWAY SINGLE TIP:</span>
              <span>{pred.predictedAwayTip || 'N/A'} ({pred.predictedAwayTipProb || 0}%)</span>
            </div>
          ) : isBestHomeAwayView ? (
            <div style={{ 
              background: 'rgba(244, 63, 94, 0.12)',
              border: `2px solid #F43F5E`,
              color: '#F43F5E',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 10px rgba(244, 63, 94, 0.15)'
            }}>
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🤝 DOUBLE CHANCE TIP:</span>
              <span>Home or Away ({pred.predictedHomeOrAwayProb || 0}%)</span>
            </div>
          ) : isBest15View ? (
            <div style={{ 
              background: 'rgba(0, 229, 255, 0.12)',
              border: '2px solid #00E5FF',
              color: '#00E5FF',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 10px rgba(0, 229, 255, 0.15)'
            }}>
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🎯 BEST 1.5 TIP:</span>
              <span>Over 1.5 ({pred.predictedOver15Prob}%)</span>
            </div>
          ) : (
            <>
              <div style={{ 
                background: `${pred.color || 'var(--accent-neon)'}10`,
                border: `1px solid ${pred.color || 'var(--accent-neon)'}40`,
                color: pred.color || 'var(--accent-neon)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 'bold'
              }}>
                Outcome: {pred.predictedOutcome === 'H' ? 'H' : pred.predictedOutcome === 'A' ? 'A' : 'D'}{pred.predictedOutcomeProb !== undefined ? ` (${pred.predictedOutcomeProb}%)` : ''}
              </div>

              {pred.predictedHomeOrAwayProb !== undefined && pred.predictedHomeOrAwayProb !== null && (
                <div style={{ 
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  color: '#F43F5E',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  Double Chance: Home or Away ({pred.predictedHomeOrAwayProb}%)
                </div>
              )}

              {pred.predictedHomeTip && (
                <div style={{ 
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  color: '#3B82F6',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  Home Tip: {pred.predictedHomeTip} ({pred.predictedHomeTipProb}%)
                </div>
              )}

              {pred.predictedAwayTip && (
                <div style={{ 
                  background: 'rgba(236, 72, 153, 0.1)',
                  border: '1px solid rgba(236, 72, 153, 0.4)',
                  color: '#EC4899',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  Away Tip: {pred.predictedAwayTip} ({pred.predictedAwayTipProb}%)
                </div>
              )}

              <div style={{ 
                background: pred.predictedBtts === 'GG' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                border: pred.predictedBtts === 'GG' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                color: pred.predictedBtts === 'GG' ? '#00FF88' : 'white',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 'bold'
              }}>
                BTTS: {pred.predictedBtts}{pred.predictedBttsProb !== undefined ? ` (${pred.predictedBttsProb}%)` : ''}
              </div>

              {pred.predictedOver15 && (
                <div style={{ 
                  background: pred.predictedOver15 === 'Over' ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                  border: pred.predictedOver15 === 'Over' ? '1px solid #00E5FF' : '1px solid rgba(255,255,255,0.08)',
                  color: pred.predictedOver15 === 'Over' ? '#00E5FF' : 'white',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  O/U 1.5: {pred.predictedOver15}{pred.predictedOver15Prob !== undefined ? ` (${pred.predictedOver15Prob}%)` : ''}
                </div>
              )}

              {pred.predictedOver25 && (
                <div style={{ 
                  background: pred.predictedOver25 === 'Over' ? 'rgba(167, 139, 250, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                  border: pred.predictedOver25 === 'Over' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.08)',
                  color: pred.predictedOver25 === 'Over' ? '#A78BFA' : 'white',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  O/U 2.5: {pred.predictedOver25}{pred.predictedOver25Prob !== undefined ? ` (${pred.predictedOver25Prob}%)` : ''}
                </div>
              )}
            </>
          )}
        </div>

        {/* AI Analysis */}
        <div style={{ 
          background: 'rgba(255,255,255,0.02)', 
          padding: '8px 10px', 
          borderRadius: '6px', 
          fontSize: '0.74rem', 
          color: 'var(--text-secondary)',
          lineHeight: '1.4',
          border: '1px solid rgba(255,255,255,0.03)',
          fontStyle: 'italic'
        }}>
          🧠 <strong>Analysis:</strong> "{pred.reasoning}"
        </div>

        {/* Resolved Results Checkmarks (Visible if loaded round is historically resolved) */}
        {pred.resolved && (
          <div style={{ 
            background: 'rgba(255,255,255,0.02)', 
            padding: '8px 10px', 
            borderRadius: '6px', 
            border: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '4px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Result: <strong style={{ color: 'white' }}>{pred.actualScore || 'N/A'}</strong> (Winner: {pred.actualOutcome || 'N/A'})
              </span>
              <span style={{ 
                fontSize: '0.74rem', 
                color: pred.outcomeCorrect ? 'var(--accent-success)' : 'var(--accent-live)',
                fontWeight: 'bold'
              }}>
                {pred.outcomeCorrect ? 'Outcome Won ✅' : 'Outcome Lost ❌'}
              </span>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.68rem' }}>
              <span style={{ color: pred.bttsCorrect ? 'var(--accent-success)' : 'var(--accent-live)' }}>
                BTTS: {pred.bttsCorrect ? '✓' : '✗'}
              </span>
              <span style={{ color: pred.over15Correct ? 'var(--accent-success)' : 'var(--accent-live)' }}>
                O/U 1.5: {pred.over15Correct ? '✓' : '✗'}
              </span>
              <span style={{ color: pred.over25Correct ? 'var(--accent-success)' : 'var(--accent-live)' }}>
                O/U 2.5: {pred.over25Correct ? '✓' : '✗'}
              </span>
              {pred.predictedHomeTip && (
                <span style={{ color: pred.homeTipCorrect ? 'var(--accent-success)' : 'var(--accent-live)' }}>
                  Home Tip: {pred.homeTipCorrect ? '✓' : '✗'}
                </span>
              )}
              {pred.predictedAwayTip && (
                <span style={{ color: pred.awayTipCorrect ? 'var(--accent-success)' : 'var(--accent-live)' }}>
                  Away Tip: {pred.awayTipCorrect ? '✓' : '✗'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderHistoryCaseStudyWidget = () => {
    const isDynamic = caseStudyStats && caseStudyStats.totalResolved >= 5;
    const totalCount = isDynamic ? caseStudyStats.totalResolved : 1093;
    
    const dcAcc = isDynamic ? caseStudyStats.doubleChance.accuracy : 77;
    const o15Acc = isDynamic ? caseStudyStats.over15.accuracy : 74;
    const homeTipAcc = isDynamic ? caseStudyStats.homeTip.accuracy : 77;
    const straightWin80Acc = isDynamic ? caseStudyStats.straightWin80.accuracy : 83;
    const highConfAcc = isDynamic ? caseStudyStats.highConf.accuracy : 73;

    return (
      <div className="glass-panel ultra-glass" style={{
        padding: '18px 20px',
        border: '1px solid rgba(255, 215, 0, 0.15)',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(10,15,30,0.7), rgba(255, 215, 0, 0.02))',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h4 style={{ margin: 0, color: '#FFD700', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧠</span> Dynamic History Case Study & Reliability Model
          </h4>
          <span style={{
            fontSize: '0.66rem',
            background: isDynamic ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 255, 255, 0.04)',
            color: isDynamic ? '#00FF88' : 'var(--text-secondary)',
            padding: '3px 8px',
            borderRadius: '4px',
            border: isDynamic ? '1px solid rgba(0, 255, 136, 0.2)' : '1px solid rgba(255,255,255,0.06)',
            fontWeight: 'bold'
          }}>
            {isDynamic ? `📡 ACTIVE DYNAMIC FEEDBACK (Based on ${totalCount} database outcomes)` : `📚 BASELINE BENCHMARK (Based on ${totalCount} historical picks)`}
          </span>
        </div>
        
        <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
          <strong>The "Learn from History" Approach:</strong> While a prediction round might assign high general confidence (e.g. 75%+), history shows that straight outcomes often regress to the mean. Our reliability model weights predictions by the <em>actual historical success rate</em> of their component tips.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '4px' }}>
          {[
            { label: 'DC Tip (>=65%)', val: dcAcc, baselineVal: 77, color: '#F43F5E', emoji: '🤝' },
            { label: 'Home Tip (>=65%)', val: homeTipAcc, baselineVal: 77, color: '#3B82F6', emoji: '🏠' },
            { label: 'Over 1.5 Goals (>=65%)', val: o15Acc, baselineVal: 74, color: '#00E5FF', emoji: '⚽' },
            { label: 'Elite Win (>=80%)', val: straightWin80Acc, baselineVal: 83, color: '#00FF88', emoji: '🏆' },
            { label: 'General Conf (>=75%)', val: highConfAcc, baselineVal: 73, color: '#A78BFA', emoji: '⭐️', isConf: true }
          ].map(stat => {
            const hasData = stat.val !== null && stat.val !== undefined;
            const displayVal = hasData ? stat.val : stat.baselineVal;
            return (
              <div key={stat.label} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                borderLeft: `3px solid ${stat.color}`
              }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {stat.emoji} {stat.label}
                </span>
                <strong style={{ fontSize: '1.1rem', color: stat.color }}>{displayVal}%</strong>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                  {stat.isConf ? 'Failure Band Indicator' : 'Accuracy Rate'}
                </span>
              </div>
            );
          })}
        </div>

        {isDynamic && highConfAcc !== null && dcAcc !== null && highConfAcc < dcAcc && (
          <div style={{
            fontSize: '0.74rem',
            color: '#FFD700',
            background: 'rgba(255, 215, 0, 0.05)',
            border: '1px solid rgba(255, 215, 0, 0.2)',
            padding: '8px 10px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>💡</span>
            <span>
              <strong>Case Study Proof:</strong> In your actual results history, general high-confidence picks hit at <strong>{highConfAcc}%</strong>, while Double Chance picks hit at <strong>{dcAcc}%</strong>. Relying on Double Chance & Goals percentages is statistically safer!
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pattern-engine-root" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* HEADER SECTION */}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <Link to="/local-engine" className="hover-lift" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.target.style.color = 'var(--accent-neon)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}>🧠 Positional Trace Dashboard</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <span style={{ color: 'var(--accent-neon)', fontSize: '0.8rem', fontWeight: 700 }}>🔮 Live Predictor & History Log</span>
        </div>

        <h1 style={{ fontSize: '2.5rem', margin: '0 0 10px 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pulse-dot" style={{ backgroundColor: 'var(--accent-neon)', boxShadow: '0 0 10px var(--accent-neon)' }}></span>
          AI Live Predictor <span className="glow-text" style={{ marginLeft: '12px' }}>& History Database</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: 0 }}>
          <span style={{ color: 'var(--accent-success)', fontWeight: 700, background: 'rgba(0, 255, 136, 0.08)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0, 255, 136, 0.2)', fontSize: '0.82rem' }}>
            ⚡ SUPABASE POWERED
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Real-time visual row prediction engine resolved against finished virtual matches.
          </span>
        </p>
      </header>

      {/* ── HISTORICAL ACCURACY STATS BANNER (from 1,093 resolved picks) ── */}
      <section style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.3), rgba(0,229,255,0.04))', border: '1px solid rgba(0,229,255,0.12)', borderRadius: '12px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: 'var(--accent-neon)', fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 Proven Accuracy — Verified from 1,093 Historical Predictions
          </h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
            Source: 170 rounds analyzed · Best Performing & Best Straight Win tabs use these thresholds
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          {HISTORY_ACCURACY_STATS.map(stat => (
            <div
              key={stat.market}
              style={{
                background: `${stat.color}08`,
                border: `1px solid ${stat.color}25`,
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {stat.emoji} {stat.market}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <strong style={{ fontSize: '1.35rem', color: stat.color, lineHeight: 1 }}>{stat.accuracy}%</strong>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>accuracy</span>
              </div>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{stat.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* DETAILED "HOW IT WORKS" GUIDELINES SECTION */}
      <section className="glass-panel ultra-glass hud-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-neon)' }}>
        <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent-neon)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
          ⚙️ How Live AI Predictor & Supabase Database Works
        </h3>
        <p style={{ fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          This prediction engine maps virtual football matches into visual board row positions (1 to 10) and applies visual pattern transition algorithms:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', fontSize: '0.76rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>1. Real-Time Scraper</strong>
            The server scrapes sportybet's active virtual matches, sorting them alphabetically to align home teams with fixed row positions.
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>2. Supabase Pattern Retrieval</strong>
            Historical visual row streaks and Markov transitions are retrieved from Supabase to provide visual contexts.
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>3. DeepSeek AI Prediction</strong>
            DeepSeek analyzes the streaks and probabilities to generate outcome, BTTS, and Over/Under 1.5 & 2.5 tips.
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>4. Automatic Verification</strong>
            Predictions are logged to Supabase. As new results are scraped, predictions are resolved to verify accuracy percentages!
          </div>
        </div>
      </section>

      {/* LEAGUE SELECTOR AND VIEW TABS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
        
        {/* LEAGUE TABS */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 0' }}>
          {leagueTabs.map(tab => {
            const isSelected = selectedLeague === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedLeague(tab.id);
                  if (activeView === 'history') {
                    fetchPredictionsHistory(tab.id);
                  }
                }}
                className="hover-lift"
                style={{
                  background: isSelected ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  color: isSelected ? 'var(--accent-neon)' : 'var(--text-secondary)',
                  border: isSelected ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid var(--glass-border)',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? 800 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* VIEW MODE SELECTOR */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
          <button 
            onClick={() => setActiveView('live')}
            style={{
              background: activeView === 'live' ? 'linear-gradient(135deg, #00E5FF, #00FF88)' : 'transparent',
              color: activeView === 'live' ? '#000' : 'var(--text-secondary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '900',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            🔮 Live Predictor
          </button>
          <button 
            onClick={() => setActiveView('history')}
            style={{
              background: activeView === 'history' ? 'linear-gradient(135deg, #00E5FF, #00FF88)' : 'transparent',
              color: activeView === 'history' ? '#000' : 'var(--text-secondary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '900',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            📜 History Log
          </button>
        </div>
      </div>

      {/* VIEW PANEL */}
      <div style={{ width: '100%' }}>
        
        {/* --- LIVE PREDICTOR TAB --- */}
        {activeView === 'live' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Actions Panel */}
            <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: 'white' }}>
                  Analyze active sportybet round
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Triggers sportybet scrape and queries Supabase transitions to feed DeepSeek AI.
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handlePredictLiveList(false)}
                  disabled={predicting}
                  style={{
                    background: 'linear-gradient(135deg, #00E5FF, #00FF88)',
                    color: 'black',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    cursor: predicting ? 'default' : 'pointer',
                    opacity: predicting ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {predicting ? '🤖 Predicting...' : `🔮 Predict ${selectedLeague.replace(' League', '')}`}
                </button>

                <button
                  onClick={() => handlePredictLiveList(true)}
                  disabled={predicting}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'white',
                    border: '1px solid var(--glass-border)',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: predicting ? 'default' : 'pointer',
                    opacity: predicting ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  🤖 Predict All Leagues
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {predictionError && (
              <div className="glass-panel" style={{ background: 'rgba(255, 51, 85, 0.08)', border: '1px solid rgba(255, 51, 85, 0.3)', borderLeft: '4px solid var(--accent-live)', padding: '16px 20px' }}>
                <strong style={{ color: 'var(--accent-live)', display: 'block', fontSize: '0.9rem' }}>Scrape & Predict Warning</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{predictionError}</p>
              </div>
            )}

            {/* Loading State */}
            {predicting && (
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                <div className="spinner" />
                <strong style={{ color: 'var(--accent-neon)', fontSize: '1rem' }}>DeepSeek AI Prediction In Progress...</strong>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  1. Launching scraper to extract sportybet virtual lineups<br/>
                  2. Retrieving row transition matrices from Supabase database<br/>
                  3. Feeding visual trace pattern context to DeepSeek Chat API
                </p>
              </div>
            )}

            {/* Predictions Content */}
            {!predicting && predictionResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Generated predictions for round: <span className="glow-text">{predictionResults.league}</span>
                      {predictionResults.isLoadedFromHistory && (
                        <span style={{
                          fontSize: '0.62rem',
                          background: 'rgba(255, 215, 0, 0.1)',
                          border: '1px solid rgba(255, 215, 0, 0.3)',
                          color: '#FFD700',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          letterSpacing: '0.05em'
                        }}>
                          LAST PREDICTION
                        </span>
                      )}
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      AI Provider: <strong style={{ color: 'var(--accent-purple)' }}>{predictionResults.provider?.toUpperCase()}</strong> • Predictions mapped to alphabetical visual positions.
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleCaptureScreenshot}
                      disabled={capturing || exportingPDF}
                      style={{
                        background: 'rgba(167, 139, 250, 0.1)',
                        border: '1px solid rgba(167, 139, 250, 0.3)',
                        color: 'var(--accent-purple)',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: (capturing || exportingPDF) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {capturing ? '📸 Saving...' : '📸 Save Screenshot (PNG)'}
                    </button>

                    <button
                      onClick={handleExportPDF}
                      disabled={capturing || exportingPDF}
                      style={{
                        background: 'rgba(0, 229, 255, 0.1)',
                        border: '1px solid rgba(0, 229, 255, 0.3)',
                        color: 'var(--accent-neon)',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: (capturing || exportingPDF) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {exportingPDF ? '📄 Exporting PDF...' : '📄 Save PDF Report'}
                    </button>
                  </div>
                </div>

                {/* Sub-tabs selector for Live Predictor */}
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.01)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all',            label: 'As Predicted',         emoji: '📋' },
                    { id: 'historyelite',   label: 'History Elite',        emoji: '🧠', highlight: true },
                    { id: 'best',           label: 'High Confidence',      emoji: '⭐️' },
                    { id: 'beststraightwin',label: 'Best Straight Win',     emoji: '🏆', highlight: true },
                    { id: 'bestperforming', label: 'Best Performing',       emoji: '🔬', highlight: true },
                    { id: 'best15',         label: 'Best Over 1.5',        emoji: '⚽' },
                    { id: 'singlehome',     label: 'Single Tip (Home)',     emoji: '🏠' },
                    { id: 'singleaway',     label: 'Single Tip (Away)',     emoji: '✈️' },
                    { id: 'besthomeaway',   label: 'Double Chance',        emoji: '🤝' },
                    { id: 'bestsingle',     label: 'Best Single Pick',     emoji: '🔥' }
                  ].map(sub => {
                    const isSelected = liveSubTab === sub.id;
                    const activeColor = sub.id === 'beststraightwin' ? '#00FF88' :
                                       sub.id === 'bestperforming'  ? '#F43F5E' :
                                       sub.id === 'historyelite'    ? '#FFD700' :
                                       'var(--accent-neon)';
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setLiveSubTab(sub.id);
                          console.log(`[PredictionsDashboard] [DEBUG] 🔀 Live sub-tab switched to: "${sub.id}"`);
                        }}
                        title={sub.highlight ? '📊 Uses proven historical accuracy thresholds from 1,093 picks' : ''}
                        style={{
                          background: isSelected ? `${activeColor}12` : 'transparent',
                          color: isSelected ? activeColor : 'var(--text-secondary)',
                          border: isSelected ? `1px solid ${activeColor}35` : sub.highlight ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          position: 'relative'
                        }}
                      >
                        <span>{sub.emoji}</span>
                        <span>{sub.label}</span>
                        {sub.highlight && !isSelected && (
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: activeColor, opacity: 0.8, position: 'absolute', top: '4px', right: '4px' }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Case Study Reliability Widget */}
                {predictionResults && liveSubTab === 'historyelite' && renderHistoryCaseStudyWidget()}
                {predictionResults && liveSubTab !== 'historyelite' && (
                  <div style={{ marginBottom: '12px' }}>
                    <button 
                      onClick={() => setLiveSubTab('historyelite')}
                      style={{
                        background: 'rgba(255, 215, 0, 0.05)',
                        border: '1px solid rgba(255, 215, 0, 0.25)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        color: '#FFD700',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      className="hover-lift"
                    >
                      🧠 View History Case Study & Reliability Model Insights
                    </button>
                  </div>
                )}

                {/* Cards Grid */}
                <div ref={predictionsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', padding: '16px', background: '#0A0F1E', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  {getFilteredPredictions(predictionResults.predictions, liveSubTab).length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>🔍</span>
                      <strong>No predictions found.</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        No matches met the filter criteria for this round.
                      </p>
                    </div>
                  ) : (
                    getFilteredPredictions(predictionResults.predictions, liveSubTab).map(pred => renderPredictionCard(pred, liveSubTab))
                  )}
                </div>
              </div>
            )}

            {!predicting && !predictionResults && !predictionError && (
              <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '12px' }}>🔮</span>
                <strong>No predictions generated yet.</strong>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Click the Predict button above to scrape sportybet and run the AI pattern model.
                </p>
              </div>
            )}

          </div>
        )}

        {/* --- PREDICTION HISTORY TAB --- */}
        {activeView === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Loading history */}
            {loadingHistory && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px', gap: '12px' }}>
                <span className="spinner" />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading predictions history from Supabase...</span>
              </div>
            )}

            {/* Error History */}
            {historyError && (
              <div className="glass-panel" style={{ background: 'rgba(255, 51, 85, 0.08)', border: '1px solid rgba(255, 51, 85, 0.3)', borderLeft: '4px solid var(--accent-live)', padding: '20px' }}>
                <strong style={{ color: 'var(--accent-live)', display: 'block', fontSize: '0.95rem' }}>Failed to Load History</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{historyError}</p>
              </div>
            )}

            {/* Global actions: sub-tabs + Check All Outcomes button */}
            {!loadingHistory && !historyError && historyList.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.01)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all',            label: 'As Predicted',         emoji: '📋' },
                    { id: 'best',           label: 'High Confidence',      emoji: '⭐️' },
                    { id: 'beststraightwin',label: 'Best Straight Win',     emoji: '🏆', highlight: true },
                    { id: 'bestperforming', label: 'Best Performing',       emoji: '🔬', highlight: true },
                    { id: 'best15',         label: 'Best Over 1.5',        emoji: '⚽' },
                    { id: 'singlehome',     label: 'Single Tip (Home)',     emoji: '🏠' },
                    { id: 'singleaway',     label: 'Single Tip (Away)',     emoji: '✈️' },
                    { id: 'besthomeaway',   label: 'Double Chance',        emoji: '🤝' },
                    { id: 'bestsingle',     label: 'Best Single Pick',     emoji: '🔥' }
                  ].map(sub => {
                    const isSelected = historySubTab === sub.id;
                    const activeColor = sub.id === 'beststraightwin' ? '#00FF88' :
                                       sub.id === 'bestperforming'  ? '#F43F5E' :
                                       'var(--accent-neon)';
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setHistorySubTab(sub.id);
                          console.log(`[PredictionsDashboard] [DEBUG] 🔀 History sub-tab switched to: "${sub.id}"`);
                        }}
                        title={sub.highlight ? '📊 Uses proven historical accuracy thresholds from 1,093 picks' : ''}
                        style={{
                          background: isSelected ? `${activeColor}12` : 'transparent',
                          color: isSelected ? activeColor : 'var(--text-secondary)',
                          border: isSelected ? `1px solid ${activeColor}35` : sub.highlight ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          position: 'relative'
                        }}
                      >
                        <span>{sub.emoji}</span>
                        <span>{sub.label}</span>
                        {sub.highlight && !isSelected && (
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: activeColor, opacity: 0.8, position: 'absolute', top: '4px', right: '4px' }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Global — Check All Outcomes button */}
                <button
                  onClick={handleResolveAllPending}
                  disabled={resolvingPending}
                  title="Scrapes fresh results for ALL 5 leagues then resolves all pending predictions"
                  style={{
                    background: resolvingPending ? 'rgba(0, 229, 255, 0.04)' : 'linear-gradient(135deg, rgba(0,229,255,0.12), rgba(0,255,136,0.08))',
                    border: '1px solid rgba(0, 229, 255, 0.3)',
                    color: 'var(--accent-neon)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                    cursor: resolvingPending ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: resolvingPending ? 0.6 : 1,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    boxShadow: resolvingPending ? 'none' : '0 0 10px rgba(0,229,255,0.08)'
                  }}
                >
                  {resolvingPending ? '⏳ Checking...' : '🌐 Check All Outcomes'}
                </button>
              </div>
            )}

            {/* History List */}
            {!loadingHistory && !historyError && (
              historyList.length === 0 ? (
                <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: '12px' }}>📜</span>
                  <strong>No prediction history records in Supabase.</strong>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Predictions will appear here once saved from the Live Predictor tab.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                  {(() => {
                    const roundsToRender = historyList.map(round => {
                      const filteredRoundPreds = getFilteredPredictions(round.predictions, historySubTab);
                      if (filteredRoundPreds.length === 0) return null;

                      const resolvedPreds = filteredRoundPreds.filter(p => p.resolved);
                      const totalResolved = resolvedPreds.length;
                      
                      let correctOutcome = 0;
                      let correctBtts = 0;
                      let correctOver15 = 0;
                      let correctOver25 = 0;
                      let correctHomeOrAway = 0;
                      let correctHomeTip = 0;
                      let correctAwayTip = 0;
                      let correctSingleCount = 0;
                      
                      filteredRoundPreds.forEach(p => {
                        if (p.resolved) {
                          if (p.outcomeCorrect) correctOutcome++;
                          if (p.bttsCorrect) correctBtts++;
                          if (p.over15Correct) correctOver15++;
                          if (p.over25Correct) correctOver25++;
                          if (p.homeOrAwayCorrect) correctHomeOrAway++;
                          if (p.homeTipCorrect) correctHomeTip++;
                          if (p.awayTipCorrect) correctAwayTip++;
                          
                          const bestTip = getBestSingleTip(p);
                          if (bestTip) {
                            let isCorrect = false;
                            if (bestTip.market === 'Outcome') isCorrect = p.outcomeCorrect;
                            else if (bestTip.market === 'BTTS') isCorrect = p.bttsCorrect;
                            else if (bestTip.market === 'O/U 1.5') isCorrect = p.over15Correct;
                            else if (bestTip.market === 'O/U 2.5') isCorrect = p.over25Correct;
                            else if (bestTip.market === 'Double Chance') isCorrect = p.homeOrAwayCorrect;
                            else if (bestTip.market === 'Home Tip') isCorrect = p.homeTipCorrect;
                            else if (bestTip.market === 'Away Tip') isCorrect = p.awayTipCorrect;
                            if (isCorrect) correctSingleCount++;
                          }
                        }
                      });

                      const isSingleHomeView = historySubTab === 'singlehome';
                      const isSingleAwayView = historySubTab === 'singleaway';
                      const isBestHomeAwayView = historySubTab === 'besthomeaway';
                      const isBestSingleView = historySubTab === 'bestsingle';
                      const isBest15View = historySubTab === 'best15';

                      const outcomePct = totalResolved > 0 ? Math.round((correctOutcome / totalResolved) * 100) : null;
                      const bttsPct = totalResolved > 0 ? Math.round((correctBtts / totalResolved) * 100) : null;
                      const over15Pct = totalResolved > 0 ? Math.round((correctOver15 / totalResolved) * 100) : null;
                      const over25Pct = totalResolved > 0 ? Math.round((correctOver25 / totalResolved) * 100) : null;
                      const homeOrAwayPct = totalResolved > 0 ? Math.round((correctHomeOrAway / totalResolved) * 100) : null;
                      const homeTipPct = totalResolved > 0 ? Math.round((correctHomeTip / totalResolved) * 100) : null;
                      const awayTipPct = totalResolved > 0 ? Math.round((correctAwayTip / totalResolved) * 100) : null;
                      const singlePct = totalResolved > 0 ? Math.round((correctSingleCount / totalResolved) * 100) : null;

                      return (
                        <div 
                          key={round.id} 
                          className="glass-panel" 
                          style={{ 
                            padding: '20px', 
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderLeft: `4px solid ${totalResolved > 0 ? 'var(--accent-success)' : 'var(--accent-gold)'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                          }}
                        >
                          {/* Header details */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
                            <div>
                              <strong style={{ color: 'white', fontSize: '1.05rem', display: 'block' }}>
                                Round: {round.league}
                              </strong>
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                📅 Date: {round.date} | Captured: {new Date(round.capturedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* Accuracy badges */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {totalResolved > 0 ? (
                                isSingleHomeView ? (
                                  <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Home Tip Acc</span>
                                    <strong style={{ color: '#3B82F6', fontSize: '0.85rem' }}>{correctHomeTip}/{totalResolved} ({homeTipPct}%)</strong>
                                  </div>
                                ) : isSingleAwayView ? (
                                  <div style={{ background: 'rgba(236, 72, 153, 0.05)', border: '1px solid rgba(236, 72, 153, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Away Tip Acc</span>
                                    <strong style={{ color: '#EC4899', fontSize: '0.85rem' }}>{correctAwayTip}/{totalResolved} ({awayTipPct}%)</strong>
                                  </div>
                                ) : isBestHomeAwayView ? (
                                  <div style={{ background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Double Chance Acc</span>
                                    <strong style={{ color: '#F43F5E', fontSize: '0.85rem' }}>{correctHomeOrAway}/{totalResolved} ({homeOrAwayPct}%)</strong>
                                  </div>
                                ) : isBestSingleView ? (
                                  <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Single Tip Acc</span>
                                    <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctSingleCount}/{totalResolved} ({singlePct}%)</strong>
                                  </div>
                                ) : isBest15View ? (
                                  <div style={{ background: 'rgba(0, 229, 255, 0.05)', border: '1px solid rgba(0, 229, 255, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Over 1.5 Acc</span>
                                    <strong style={{ color: '#00E5FF', fontSize: '0.85rem' }}>{correctOver15}/{totalResolved} ({over15Pct}%)</strong>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Outcome</span>
                                      <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctOutcome}/{totalResolved} ({outcomePct}%)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Double Chance</span>
                                      <strong style={{ color: '#F43F5E', fontSize: '0.85rem' }}>{correctHomeOrAway}/{totalResolved} ({homeOrAwayPct}%)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Home Tip</span>
                                      <strong style={{ color: '#3B82F6', fontSize: '0.85rem' }}>{correctHomeTip}/{totalResolved} ({homeTipPct}%)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(236, 72, 153, 0.05)', border: '1px solid rgba(236, 72, 153, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Away Tip</span>
                                      <strong style={{ color: '#EC4899', fontSize: '0.85rem' }}>{correctAwayTip}/{totalResolved} ({awayTipPct}%)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>BTTS</span>
                                      <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctBtts}/{totalResolved} ({bttsPct}%)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>O/U 1.5</span>
                                      <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctOver15}/{totalResolved} ({over15Pct}%)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>O/U 2.5</span>
                                      <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctOver25}/{totalResolved} ({over25Pct}%)</strong>
                                    </div>
                                  </>
                                )
                              ) : null}
                              {/* Always show check outcome button — even for resolved rounds */}
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {totalResolved === 0 && (
                                  <div style={{ background: 'rgba(255, 215, 0, 0.06)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.74rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                                    ⏳ Pending Match Completion
                                  </div>
                                )}
                                <button
                                   onClick={() => handleResolvePending(round.league)}
                                   disabled={resolvingPending}
                                   title={`Scrape today's results for ${round.league} and resolve pending predictions`}
                                   style={{
                                     background: resolvingPending ? 'rgba(167, 139, 250, 0.05)' : 'rgba(167, 139, 250, 0.15)',
                                     border: '1px solid rgba(167, 139, 250, 0.35)',
                                     color: 'var(--accent-purple)',
                                     borderRadius: '4px',
                                     padding: '6px 12px',
                                     fontSize: '0.74rem',
                                     fontWeight: 'bold',
                                     cursor: resolvingPending ? 'not-allowed' : 'pointer',
                                     transition: 'all 0.2s ease',
                                     outline: 'none',
                                     display: 'inline-flex',
                                     alignItems: 'center',
                                     gap: '4px',
                                     opacity: resolvingPending ? 0.7 : 1
                                   }}
                                   onMouseEnter={e => !resolvingPending && (e.currentTarget.style.background = 'rgba(167, 139, 250, 0.25)')}
                                   onMouseLeave={e => !resolvingPending && (e.currentTarget.style.background = 'rgba(167, 139, 250, 0.15)')}
                                 >
                                   {resolvingPending ? '⏳ Checking...' : `🔄 Check ${round.league.replace(' League', '')}`}
                                 </button>
                              </div>
                            </div>
                          </div>

                            {/* Resolve status banner — shown while running or after completion */}
                            {resolvingPending && resolveStatus && (
                              <div style={{ background: 'rgba(167, 139, 250, 0.08)', border: '1px solid rgba(167, 139, 250, 0.25)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.76rem', color: 'var(--accent-purple)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', gridColumn: '1 / -1' }}>
                                <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                                {resolveStatus}
                              </div>
                            )}
                            {!resolvingPending && resolveStatus && (
                              <div style={{ background: resolveStatus.startsWith('✅') ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 51, 85, 0.06)', border: `1px solid ${resolveStatus.startsWith('✅') ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)'}`, padding: '8px 12px', borderRadius: '6px', fontSize: '0.76rem', color: resolveStatus.startsWith('✅') ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold' }}>
                                {resolveStatus}
                              </div>
                            )}

                          {/* Predictions cards list */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                            {filteredRoundPreds.map(pred => {
                              const isSingleHomeView = historySubTab === 'singlehome';
                              const isSingleAwayView = historySubTab === 'singleaway';
                              const isBestHomeAwayView = historySubTab === 'besthomeaway';
                              const isBestSingleView = historySubTab === 'bestsingle';
                              const isBest15View = historySubTab === 'best15';
                              const isSingleView = isSingleHomeView || isSingleAwayView;
                              
                              const bestTip = isBestSingleView ? getBestSingleTip(pred) : null;
                              
                              let isHomeTipCorrect = pred.homeTipCorrect;
                              let isAwayTipCorrect = pred.awayTipCorrect;
                              let isHomeOrAwayCorrect = pred.homeOrAwayCorrect;
                              
                              let isBestTipCorrect = false;
                              if (bestTip) {
                                if (bestTip.market === 'Outcome') isBestTipCorrect = pred.outcomeCorrect;
                                else if (bestTip.market === 'BTTS') isBestTipCorrect = pred.bttsCorrect;
                                else if (bestTip.market === 'O/U 1.5') isBestTipCorrect = pred.over15Correct;
                                else if (bestTip.market === 'O/U 2.5') isBestTipCorrect = pred.over25Correct;
                                else if (bestTip.market === 'Double Chance') isBestTipCorrect = pred.homeOrAwayCorrect;
                                else if (bestTip.market === 'Home Tip') isBestTipCorrect = pred.homeTipCorrect;
                                else if (bestTip.market === 'Away Tip') isBestTipCorrect = pred.awayTipCorrect;
                              }

                              const hasBorderStatus = pred.resolved && (isSingleHomeView || isSingleAwayView || isBestHomeAwayView || isBestSingleView || isBest15View);
                              const isResolvedCorrect = (isSingleHomeView && isHomeTipCorrect) ||
                                (isSingleAwayView && isAwayTipCorrect) ||
                                (isBestHomeAwayView && isHomeOrAwayCorrect) ||
                                (isBest15View && pred.over15Correct) ||
                                (isBestSingleView && isBestTipCorrect);

                              return (
                                <div 
                                  key={pred.position}
                                  className="glass-panel"
                                  style={{
                                    padding: '12px 14px',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.03)',
                                    borderLeft: hasBorderStatus
                                      ? `4px solid ${isResolvedCorrect ? 'var(--accent-success)' : 'var(--accent-live)'}`
                                      : '1px solid rgba(255,255,255,0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                  }}
                                >
                                  {/* Time & Code */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ background: 'rgba(255,255,255,0.05)', color: 'white', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 'bold', fontSize: '0.65rem' }}>
                                        {pred.position + 1}
                                      </span>
                                      {pred.time && (
                                        <span style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                          {pred.time}
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Conf: {pred.confidence}%</span>
                                  </div>

                                  <strong style={{ color: 'white', fontSize: '0.85rem' }}>{pred.match}</strong>
                                  
                                  {isSingleHomeView && (
                                    <div style={{ 
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      border: '1px solid rgba(59, 130, 246, 0.3)',
                                      color: '#3B82F6',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      alignSelf: 'flex-start'
                                    }}>
                                      🏠 Home Single Tip: {pred.predictedHomeTip} ({pred.predictedHomeTipProb}%)
                                    </div>
                                  )}

                                  {isSingleAwayView && (
                                    <div style={{ 
                                      background: 'rgba(236, 72, 153, 0.1)',
                                      border: '1px solid rgba(236, 72, 153, 0.3)',
                                      color: '#EC4899',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      alignSelf: 'flex-start'
                                    }}>
                                      ✈️ Away Single Tip: {pred.predictedAwayTip} ({pred.predictedAwayTipProb}%)
                                    </div>
                                  )}

                                  {isBestHomeAwayView && (
                                    <div style={{ 
                                      background: 'rgba(244, 63, 94, 0.1)',
                                      border: '1px solid rgba(244, 63, 94, 0.3)',
                                      color: '#F43F5E',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      alignSelf: 'flex-start'
                                    }}>
                                      🤝 Double Chance Tip: Home or Away ({pred.predictedHomeOrAwayProb}%)
                                    </div>
                                  )}

                                  {isBestSingleView && bestTip && (
                                    <div style={{ 
                                      background: `${bestTip.color}10`,
                                      border: `1px solid ${bestTip.color}30`,
                                      color: bestTip.color,
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      alignSelf: 'flex-start'
                                    }}>
                                      🔥 Best Single Tip ({bestTip.market}): {bestTip.prediction} ({bestTip.prob}%)
                                    </div>
                                  )}

                                  {isBest15View && (
                                    <div style={{ 
                                      background: 'rgba(0, 229, 255, 0.1)',
                                      border: '1px solid rgba(0, 229, 255, 0.3)',
                                      color: '#00E5FF',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      alignSelf: 'flex-start'
                                    }}>
                                      🎯 Best 1.5 Tip: Over 1.5 ({pred.predictedOver15Prob}%)
                                    </div>
                                  )}

                                  {/* Verifications */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

                                    {/* 1. OUTCOME VERIFICATION */}
                                    {(!isSingleView && !isBest15View) && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>Winner: </span>
                                          <strong style={{ color: getOutcomeColor(pred.predictedOutcome) }}>{pred.predictedOutcome}{pred.predictedOutcomeProb !== undefined ? ` (${pred.predictedOutcomeProb}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOutcome}</span>
                                            <span style={{ color: pred.outcomeCorrect ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.outcomeCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.outcomeCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 2. DOUBLE CHANCE VERIFICATION */}
                                    {(isBestHomeAwayView || (!isSingleView && !isBest15View)) && pred.predictedHomeOrAwayProb !== undefined && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(244,63,94,0.06)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: '#F43F5E' }}>🤝 Double Chance: </span>
                                          <strong style={{ color: '#F43F5E' }}>Home or Away ({pred.predictedHomeOrAwayProb}%)</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOutcome !== 'D' ? 'WON' : 'DRAW'}</span>
                                            <span style={{ color: pred.homeOrAwayCorrect ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.homeOrAwayCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.homeOrAwayCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 3. HOME TIP VERIFICATION */}
                                    {(isSingleHomeView || (!isSingleView && !isBest15View)) && pred.predictedHomeTip && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(59,130,246,0.06)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: '#3B82F6' }}>🏠 Home Tip: </span>
                                          <strong style={{ color: '#3B82F6' }}>{pred.predictedHomeTip} ({pred.predictedHomeTipProb}%)</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Score: {pred.actualScore}</span>
                                            <span style={{ color: pred.homeTipCorrect ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.homeTipCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.homeTipCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 4. AWAY TIP VERIFICATION */}
                                    {(isSingleAwayView || (!isSingleView && !isBest15View)) && pred.predictedAwayTip && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(236,72,153,0.06)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: '#EC4899' }}>✈️ Away Tip: </span>
                                          <strong style={{ color: '#EC4899' }}>{pred.predictedAwayTip} ({pred.predictedAwayTipProb}%)</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Score: {pred.actualScore}</span>
                                            <span style={{ color: pred.awayTipCorrect ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.awayTipCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.awayTipCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 5. BTTS VERIFICATION */}
                                    {(!isSingleView && !isBest15View) && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>BTTS: </span>
                                          <strong style={{ color: pred.predictedBtts === 'GG' ? 'var(--accent-success)' : 'white' }}>{pred.predictedBtts}{pred.predictedBttsProb !== undefined ? ` (${pred.predictedBttsProb}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualBtts}</span>
                                            <span style={{ color: pred.bttsCorrect ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.bttsCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.bttsCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 6. O/U 1.5 VERIFICATION */}
                                    {((!isSingleView && !isBest15View) || isBest15View) && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>O/U 1.5: </span>
                                          <strong style={{ color: pred.predictedOver15 === 'Over' ? 'var(--accent-neon)' : 'white' }}>{pred.predictedOver15}{pred.predictedOver15Prob !== undefined ? ` (${pred.predictedOver15Prob}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOver15}</span>
                                            <span style={{ color: pred.over15Correct ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.over15Correct ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.over15Correct ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 7. O/U 2.5 VERIFICATION */}
                                    {(!isSingleView && !isBest15View) && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>O/U 2.5: </span>
                                          <strong style={{ color: pred.predictedOver25 === 'Over' ? 'var(--accent-purple)' : 'white' }}>{pred.predictedOver25}{pred.predictedOver25Prob !== undefined ? ` (${pred.predictedOver25Prob}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOver25}</span>
                                            <span style={{ color: pred.over25Correct ? 'var(--accent-success)' : 'var(--accent-live)', fontWeight: 'bold', background: pred.over25Correct ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem' }}>
                                              {pred.over25Correct ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Actual Score */}
                                    {pred.resolved && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Score:</span>
                                        <strong style={{ color: 'white', fontFamily: 'monospace' }}>{pred.actualScore}</strong>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Reasoning */}
                                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '4px', fontSize: '0.68rem', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.02)', fontStyle: 'italic', marginTop: '2px' }}>
                                    🧠 AI: &quot;{pred.reasoning}&quot;
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }).filter(Boolean);

                    if (roundsToRender.length === 0) {
                      return (
                        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>🔍</span>
                          <strong>No predictions found.</strong>
                          <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            No history rounds have matches meeting the filter criteria.
                          </p>
                        </div>
                      );
                    }
                    return roundsToRender;
                  })()}
                </div>
              )
            )}
          </div>
        )}

      </div>
    </div>
  );
}
