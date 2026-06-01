import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import './../index.css';

// Team name abbreviation map for virtual premier league teams
const abbreviateTeam = (name) => {
  if (!name) return '???';
  const clean = name.trim();
  const lower = clean.toLowerCase();
  
  const teamMap = {
    'arsenal': 'ARS',
    'aston villa': 'AVL',
    'chelsea': 'CHE',
    'everton': 'EVE',
    'liverpool': 'LIV',
    'manchester city': 'MCI',
    'man city': 'MCI',
    'manchester united': 'MUN',
    'man united': 'MUN',
    'newcastle': 'NEW',
    'tottenham': 'TOT',
    'spurs': 'TOT',
    'west ham': 'WHU',
    'leicester': 'LEI',
    'wolves': 'WOL',
    'wolverhampton': 'WOL',
    'southampton': 'SOU',
    'bournemouth': 'BOU',
    'crystal palace': 'CRY',
    'brighton': 'BHA',
    'brentford': 'BRE',
    'fulham': 'FUL',
    'nottingham': 'NOT',
    'nottingham forest': 'NOT',
    'sheffield utd': 'SHU',
    'sheffield united': 'SHU',
    'leeds': 'LEE',
    'burnley': 'BUR',
    'watford': 'WAT',
    'norwich': 'NOR',
    'luton': 'LUT',
    'luton town': 'LUT'
  };

  if (teamMap[lower]) return teamMap[lower];

  // Fallback: multiple words first letters
  const words = clean.split(/\s+/);
  if (words.length > 1) {
    const abbrev = words.map(w => w[0]).join('').toUpperCase();
    if (abbrev.length >= 2 && abbrev.length <= 4) return abbrev;
  }
  
  return clean.substring(0, 3).toUpperCase();
};

// Find the highest outcome probability for visual highlighting
const getHighestOutcome = (transRow) => {
  if (!transRow) return null;
  const { H, D, A } = transRow;
  const maxVal = Math.max(H || 0, D || 0, A || 0);
  if (maxVal === 0) return null;
  if (maxVal === H) return 'H';
  if (maxVal === A) return 'A';
  return 'D';
};

// Find the highest BTTS outcome probability for visual highlighting
const getHighestBttsOutcome = (transRow) => {
  if (!transRow) return null;
  const { GG, NG } = transRow;
  const maxVal = Math.max(GG || 0, NG || 0);
  if (maxVal === 0) return null;
  if (maxVal === GG) return 'GG';
  return 'NG';
};

export default function LocalPatternEngine() {
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  // Scraper inputs
  const todayISO = new Date().toISOString().split('T')[0];
  const [targetDate, setTargetDate] = useState(todayISO);
  const [selectedLeague, setSelectedLeague] = useState('England League');
  
  // Engine configurations
  const [sortType, setSortType] = useState('scraped'); // 'scraped' | 'homeTeam'

  // Per-position card trace filter state: { [positionIndex]: 'all' | 'H' | 'A' | 'D' }
  const [traceFilters, setTraceFilters] = useState({});
  
  // Real-time console logs
  const [consoleLogs, setConsoleLogs] = useState([
    '🧠 System initialized. Local Pattern Engine ready.',
    '⚡ Connection to local storage established.'
  ]);
  const consoleLogEndRef = useRef(null);
  
  // Custom sequence search inputs
  const [searchSeq, setSearchSeq] = useState(['H', 'H']);
  const [searchResults, setSearchResults] = useState(null);

  // Live DeepSeek predictions state
  const [predicting, setPredicting] = useState(false);
  const [predictionResults, setPredictionResults] = useState(null);
  const [predictionError, setPredictionError] = useState(null);
  const predictionsRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  // Auto-update / Polling states (Defaults to 60s as requested)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(60);
  const [countdown, setCountdown] = useState(60);
  const [manualTriggering, setManualTriggering] = useState(false);

  // View states: 'live' | 'history'
  const [activeView, setActiveView] = useState('live');
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Helper to add console log with timestamp
  const logMessage = (msg) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setConsoleLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // Scroll to bottom of terminal console
  useEffect(() => {
    consoleLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // Fetch local patterns and results
  const fetchPatterns = async (currentSort = sortType) => {
    setLoading(true);
    setError(null);
    logMessage(`🔄 Querying patterns from local file storage (sortType: ${currentSort})...`);
    
    try {
      const response = await fetch(`/api/local-vfootball/patterns?sortType=${currentSort}`);
      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        logMessage(`✅ Successfully analyzed ${data.totalRounds} rounds of exactly 10 matches.`);
        logMessage(`📊 Position data mapped for Positions #1 to #10.`);
        
        // Auto-run custom sequence search on new results
        runSequenceSearch(searchSeq, data.positionPatterns);
      } else {
        throw new Error(data.error || 'Failed to fetch patterns');
      }
    } catch (err) {
      console.error('[Patterns Fetch Error]', err);
      setError(err.message || 'Failed to load local patterns.');
      logMessage(`❌ ERROR: ${err.message || 'Failed to load local patterns.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch patterns on mount
  useEffect(() => {
    fetchPatterns(sortType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch prediction history logs from backend
  const fetchPredictionsHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    logMessage('📜 Querying predictions history logs from backend database...');
    
    try {
      const response = await fetch('/api/local-vfootball/predictions-history');
      const data = await response.json();
      
      if (data.success) {
        setHistoryList(data.history || []);
        logMessage(`✅ Successfully loaded ${data.history?.length || 0} rounds of prediction history.`);
      } else {
        throw new Error(data.error || 'Failed to fetch predictions history');
      }
    } catch (err) {
      console.error('[History Fetch Error]', err);
      setHistoryError(err.message || 'Failed to load predictions history.');
      logMessage(`❌ HISTORY ERROR: ${err.message || 'Failed to load predictions history.'}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch history when view is toggled to history
  useEffect(() => {
    if (activeView === 'history') {
      fetchPredictionsHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  // Polling / Auto-Update Effect
  useEffect(() => {
    // Reset countdown when interval changes or autoRefresh is toggled
    setCountdown(autoRefreshInterval);

    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Trigger automatic fetch
          fetchPatterns(sortType);
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, autoRefreshInterval, sortType]);

  // Handle manual background scraper trigger
  const handleForceBackgroundScrape = async () => {
    if (manualTriggering) return;
    setManualTriggering(true);
    logMessage('⚡ Requesting immediate background scrape session from server...');
    
    try {
      const response = await fetch('/api/local-vfootball/trigger-background-scrape', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        logMessage(`🟢 SERVER SUCCESS: ${data.message}`);
        // Refresh local patterns right away to catch any just-completed rounds
        await fetchPatterns(sortType);
      } else {
        throw new Error(data.message || 'Server rejected trigger request');
      }
    } catch (err) {
      console.error('[Force Scrape Error]', err);
      logMessage(`⚠️ TRIGGER SKIPPED: ${err.message}`);
    } finally {
      setManualTriggering(false);
    }
  };

  // Handle scraper action
  const handleScrape = async () => {
    if (scraping) return;
    setScraping(true);
    setError(null);
    logMessage(`🚀 Initiating Puppeteer scraper for "${selectedLeague}" on date ${targetDate}...`);
    
    try {
      const response = await fetch('/api/local-vfootball/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: selectedLeague, date: targetDate })
      });
      
      if (!response.ok) {
        throw new Error(`Scraper API returned HTTP ${response.status}`);
      }
      
      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const sseData = JSON.parse(line.replace('data: ', '').trim());
                if (sseData.message) {
                  logMessage(`🌐 [Scraper] ${sseData.message}`);
                }
                if (sseData.type === 'error') {
                  setError(sseData.message);
                }
              } catch (err) {
                console.warn('[SSE Parser Exception] Skipping incomplete or malformed chunk:', err.message);
              }
            }
          }
        }
      }
      
      logMessage('✅ Scraping job successfully completed. Updating pattern dashboard...');
      // Re-fetch patterns after scraping completes
      await fetchPatterns(sortType);
      
    } catch (err) {
      console.error('[Scraper Error]', err);
      setError(err.message || 'Puppeteer scraper execution failed.');
      logMessage(`❌ SCRAPER FAILED: ${err.message}`);
    } finally {
      setScraping(false);
    }
  };

  // Run outcome sequence pattern matching
  const runSequenceSearch = (seq = searchSeq, patternsList = results?.positionPatterns) => {
    if (!patternsList || patternsList.length === 0 || seq.length === 0) return;
    
    logMessage(`🔍 Executing Custom Sequence Search: [${seq.join(' ➔ ')}]`);
    
    const matchedPositions = [];
    
    patternsList.forEach(posData => {
      const history = posData.recentHistory || [];
      let matchesFound = 0;
      let nextOutcomes = { H: 0, A: 0, D: 0, total: 0 };
      
      // History is stored reverse chronologically (newest first). Let's reverse it to chronologically scan
      const chronologicalHist = [...history].reverse();
      
      for (let i = 0; i <= chronologicalHist.length - seq.length - 1; i++) {
        let isMatch = true;
        for (let j = 0; j < seq.length; j++) {
          if (chronologicalHist[i + j].outcome !== seq[j]) {
            isMatch = false;
            break;
          }
        }
        
        if (isMatch) {
          matchesFound++;
          const nextIndex = i + seq.length;
          const nextOutcome = chronologicalHist[nextIndex].outcome;
          nextOutcomes[nextOutcome]++;
          nextOutcomes.total++;
        }
      }
      
      if (matchesFound > 0) {
        matchedPositions.push({
          position: posData.position,
          positionLabel: posData.positionLabel,
          matchesFound,
          nextOutcomes: {
            H: nextOutcomes.total > 0 ? Math.round((nextOutcomes.H / nextOutcomes.total) * 100) : 0,
            A: nextOutcomes.total > 0 ? Math.round((nextOutcomes.A / nextOutcomes.total) * 100) : 0,
            D: nextOutcomes.total > 0 ? Math.round((nextOutcomes.D / nextOutcomes.total) * 100) : 0,
            counts: nextOutcomes
          }
        });
      }
    });
    
    setSearchResults(matchedPositions);
    logMessage(`🔍 Sequence match complete. Found matches on ${matchedPositions.length}/10 positions.`);
  };

  // Handle outcome search sequence change
  const handleSeqChange = (index, value) => {
    const nextSeq = [...searchSeq];
    nextSeq[index] = value;
    setSearchSeq(nextSeq);
    if (results?.positionPatterns) {
      runSequenceSearch(nextSeq, results.positionPatterns);
    }
  };

  // Add search sequence element
  const addSeqElement = () => {
    if (searchSeq.length >= 4) return;
    const nextSeq = [...searchSeq, 'H'];
    setSearchSeq(nextSeq);
    if (results?.positionPatterns) {
      runSequenceSearch(nextSeq, results.positionPatterns);
    }
  };

  // Remove search sequence element
  const removeSeqElement = () => {
    if (searchSeq.length <= 1) return;
    const nextSeq = searchSeq.slice(0, -1);
    setSearchSeq(nextSeq);
    if (results?.positionPatterns) {
      runSequenceSearch(nextSeq, results.positionPatterns);
    }
  };

  // Handle trace filter state updates with logger
  const handleTraceFilterChange = (pos, val) => {
    setTraceFilters(prev => ({ ...prev, [pos]: val }));
    logMessage(`🔍 Toggled filter on Position #${pos + 1} trace to: ${val.toUpperCase()}`);
  };

  // Trigger DeepSeek live list predictions
  const handlePredictLiveList = async () => {
    if (predicting) return;
    setPredicting(true);
    setPredictionError(null);
    setPredictionResults(null);
    logMessage('🔮 Initiating DeepSeek Live List AI Predictor...');
    logMessage('🌐 Scraping real-time vFootball live list on SportyBet...');
    
    try {
      const response = await fetch('/api/local-vfootball/predict-live');
      const data = await response.json();
      
      if (data.success) {
        if (data.predictions && data.predictions.length > 0) {
          setPredictionResults(data);
          logMessage(`🎯 DeepSeek generated predictions for round: ${data.league}`);
          logMessage('🔮 Predictions successfully processed and mapped to visual positions!');
        } else {
          setPredictionError(data.message || 'No England League live matches found.');
          logMessage(`⚠️ PREDICTION WARNING: ${data.message || 'No matches found.'}`);
        }
      } else {
        throw new Error(data.error || 'Failed to generate predictions');
      }
    } catch (err) {
      console.error('[Predict Live Error]', err);
      setPredictionError(err.message || 'DeepSeek AI execution failed.');
      logMessage(`❌ PREDICTION FAILED: ${err.message}`);
    } finally {
      setPredicting(false);
    }
  };

  // Capture high-resolution PNG screenshot of predictions element
  const handleCaptureScreenshot = async () => {
    if (!predictionsRef.current || capturing) return;
    setCapturing(true);
    logMessage('📸 Initiating high-resolution canvas capture of predictions...');
    
    try {
      // Small pause to allow UI interactions to settle
      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(predictionsRef.current, {
        useCORS: true,
        backgroundColor: '#0A0F1E', // Match theme background color
        scale: 2, // Retina resolution multiplier (super sharp!)
        logging: false
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const filename = `predictions_${predictionResults?.league ? predictionResults.league.replace(/[^a-zA-Z0-9]/g, '_') : 'round'}.png`;
      link.download = filename;
      link.href = dataUrl;
      link.click();
      
      logMessage(`✅ Screenshot saved successfully as: ${filename}`);
    } catch (err) {
      console.error('[Capture Error]', err);
      logMessage(`❌ SCREENSHOT FAILED: ${err.message}`);
    } finally {
      setCapturing(false);
    }
  };

  // Helper color map for outcomes
  const getOutcomeColor = (out) => {
    if (out === 'H') return '#00FF88'; // success green
    if (out === 'A') return '#A78BFA'; // purple
    return '#FFD700'; // gold
  };

  return (
    <div className="pattern-engine-root">
      
      {/* HEADER SECTION */}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>💾 Local Storage Store</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <span style={{ color: 'var(--accent-neon)', fontSize: '0.8rem', fontWeight: 700 }}>🧬 England Row Patterns</span>
        </div>

        <h1 className="pattern-engine-title" style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pulse-dot" style={{ backgroundColor: 'var(--accent-neon)', boxShadow: '0 0 10px var(--accent-neon)' }}></span>
          Local Storage <span className="glow-text" style={{ marginLeft: '12px' }}>Pattern Engine</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-neon)', fontWeight: 700, background: 'rgba(0, 229, 255, 0.08)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0, 229, 255, 0.2)', fontSize: '0.82rem' }}>
            💾 NO CLOUD MONGODB
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Full-width chronological backward trace mapping • 10 matches per round alignment
          </span>
        </p>
      </header>
      {/* VIEW SEGMENT SELECTOR */}
      <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '12px', border: '1px solid var(--glass-border)', width: 'fit-content', marginBottom: '8px' }}>
        <button 
          onClick={() => setActiveView('live')}
          style={{
            background: activeView === 'live' ? 'linear-gradient(135deg, #00E5FF, #00FF88)' : 'transparent',
            color: activeView === 'live' ? '#000' : 'var(--text-secondary)',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '900',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeView === 'live' ? '0 4px 12px rgba(0, 229, 255, 0.2)' : 'none'
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
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '900',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeView === 'history' ? '0 4px 12px rgba(0, 229, 255, 0.2)' : 'none'
          }}
        >
          📜 Prediction History
        </button>
      </div>

            {activeView === 'live' && (
        <>
          {/* DETAILED "HOW IT WORKS" GUIDELINES SECTION */}
      <section className="glass-panel ultra-glass hud-panel" style={{ padding: '24px', borderLeft: '4px solid var(--accent-neon)' }}>
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--accent-neon)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📖 How Positional England League Pattern Trace Works
        </h3>
        <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
          Virtual Football (vFootball) England matches operate in fixed chronological rounds. Each round triggers exactly <strong>10 matches</strong> simultaneously.
          Instead of analyzing general team records, this engine aligns matches based on their exact <strong>visual row/position (0 to 9)</strong> as listed on the platform's result board.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', fontSize: '0.82rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '6px' }}>1. Chronological Sorting</strong>
            All results from the local JSON store are grouped by round timestamp and sorted from oldest to the most recent. Non-completed or incomplete rounds are safely skipped to preserve analysis alignment.
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '6px' }}>2. Backward-Tracing & Filters</strong>
            Starting from today's current result backwards, the system tracks exactly how each visual index finished. Toggle filters to isolate Home Wins, Away Wins, or Draws inside the trace!
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '6px' }}>3. Post-Outcome Transitions</strong>
            We calculate deep transition behaviors for each position. Easily check what statistically occurs immediately after **Draws**, **Home Losses**, and **Away Losses** to spot frequent patterns!
          </div>
        </div>
      </section>

      {/* TOP CONTROLS DASHBOARD GRID (RE-LAYOUT FOR FULL WIDTH SPACE) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        width: '100%'
      }}>
        
        {/* LOCAL FILE STATUS */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'between' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'white', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💾</span> Local JSON Database
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>File Path</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>local_results.json</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Records</span>
                <strong style={{ color: 'var(--accent-neon)' }}>{results?.count || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>England Rounds</span>
                <strong style={{ color: 'white' }}>{results?.totalRounds || 0}</strong>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Auto-Update</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="pulse-dot" style={{
                    width: '8px',
                    height: '8px',
                    marginRight: '2px',
                    backgroundColor: autoRefresh ? 'var(--accent-neon)' : '#ef4444',
                    boxShadow: autoRefresh ? '0 0 8px var(--accent-neon)' : '0 0 8px #ef4444'
                  }}></span>
                  <button
                    onClick={() => setAutoRefresh(prev => !prev)}
                    style={{
                      background: 'none', border: 'none', color: autoRefresh ? 'var(--accent-neon)' : '#ef4444',
                      cursor: 'pointer', fontSize: '0.8rem', padding: 0, fontWeight: 'bold', outline: 'none'
                    }}
                  >
                    {autoRefresh ? 'ACTIVE' : 'PAUSED'}
                  </button>
                </div>
              </div>
              
              {autoRefresh && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Next Poll</span>
                  <span style={{ color: 'white', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {countdown}s
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Poll Rate</span>
                <select
                  value={autoRefreshInterval}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setAutoRefreshInterval(val);
                    setCountdown(val);
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                    color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.74rem', outline: 'none'
                  }}
                >
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={60}>60s (Default)</option>
                  <option value={90}>90s</option>
                </select>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => fetchPatterns(sortType)}
            disabled={loading || scraping}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', color: 'white',
              border: '1px solid var(--glass-border)', padding: '10px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold', transition: 'all 0.2s', marginTop: 'auto'
            }}
          >
            {loading ? '🔄 Querying...' : '🔄 Refresh File Dashboard'}
          </button>
        </div>

        {/* LOCAL SCRAPER CONTROL */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'white', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> Local Scraper Control
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Target League
                </label>
                <select 
                  value={selectedLeague} 
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  disabled={scraping}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                    color: 'white', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none'
                  }}
                >
                  <option value="England League">England League</option>
                  <option value="Spain League">Spain League</option>
                  <option value="Italy League">Italy League</option>
                  <option value="Germany League">Germany League</option>
                </select>
              </div>
              
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Target Date
                </label>
                <input 
                  type="date" 
                  value={targetDate} 
                  onChange={(e) => setTargetDate(e.target.value)}
                  disabled={scraping}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                    color: 'white', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none',
                    colorScheme: 'dark'
                  }} 
                />
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={handleScrape}
              disabled={scraping || manualTriggering}
              style={{
                width: '100%', background: scraping ? 'rgba(0, 229, 255, 0.2)' : 'linear-gradient(135deg, #00E5FF, #00FF88)',
                color: '#000', border: 'none', padding: '12px', borderRadius: '8px',
                cursor: (scraping || manualTriggering) ? 'not-allowed' : 'pointer', fontWeight: '900', fontSize: '0.85rem',
                boxShadow: (scraping || manualTriggering) ? 'none' : '0 4px 15px rgba(0, 229, 255, 0.25)', transition: 'all 0.2s'
              }}
            >
              {scraping ? '⏳ Scraping to Local Storage...' : '🚀 Scrape to Local Storage'}
            </button>

            <button 
              onClick={handleForceBackgroundScrape}
              disabled={scraping || manualTriggering}
              style={{
                width: '100%', background: 'rgba(0, 229, 255, 0.03)', color: 'var(--accent-neon)',
                border: '1px solid var(--accent-neon)', padding: '10px', borderRadius: '8px',
                cursor: (scraping || manualTriggering) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.8rem',
                transition: 'all 0.2s', boxShadow: '0 0 10px rgba(0, 229, 255, 0.1)'
              }}
            >
              {manualTriggering ? '⏳ Triggering background...' : '⚡ Force Background Scrape'}
            </button>
          </div>
        </div>

        {/* PATTERN SEQUENCE SEARCH */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'white', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span> Sequence Matcher
          </h3>
          <p style={{ margin: '0 0 10px 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Search row positions matching a specific chronological sequence.
          </p>
          
          {/* Build Sequence Controls */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
            {searchSeq.map((item, idx) => (
              <select
                key={idx}
                value={item}
                onChange={(e) => handleSeqChange(idx, e.target.value)}
                style={{
                  flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--glass-border)',
                  color: 'white', padding: '5px', borderRadius: '4px', fontSize: '0.78rem', textAlign: 'center', outline: 'none'
                }}
              >
                <option value="H">H</option>
                <option value="D">D</option>
                <option value="A">A</option>
              </select>
            ))}
            
            <button 
              onClick={addSeqElement}
              disabled={searchSeq.length >= 4}
              style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }}
            >
              +
            </button>
            <button 
              onClick={removeSeqElement}
              disabled={searchSeq.length <= 1}
              style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }}
            >
              -
            </button>
          </div>
          
          {/* Search Results Display */}
          <div style={{ maxHeight: '110px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto' }}>
            {searchResults && searchResults.length > 0 ? (
              searchResults.map((match, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '6px 8px', borderRadius: '6px', fontSize: '0.74rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <strong style={{ color: 'var(--accent-neon)' }}>{match.positionLabel}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{match.matchesFound} matches</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
                    <span>Next Outcome:</span>
                    <strong>H:{match.nextOutcomes.H}% | D:{match.nextOutcomes.D}% | A:{match.nextOutcomes.A}%</strong>
                  </div>
                </div>
              ))
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textAlign: 'center', padding: '6px 0' }}>
                No match positions found for this sequence.
              </span>
            )}
          </div>
        </div>

        {/* RUNTIME NEON LOGS CONSOLE */}
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(0, 229, 255, 0.2)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', background: 'rgba(0, 229, 255, 0.08)', borderBottom: '1px solid rgba(0, 229, 255, 0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ff5f57' }} />
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#febc2e' }} />
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#28c840' }} />
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--accent-neon)', fontWeight: 700, letterSpacing: '0.08em' }}>
              💻 TERMINAL CONSOLE
            </span>
          </div>
          
          <div style={{ flex: 1, maxHeight: '140px', overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.65)', fontFamily: 'monospace', fontSize: '0.7rem', color: '#00FF88' }}>
            {consoleLogs.map((log, i) => (
              <div key={i} style={{ lineBreak: 'anywhere' }}>{log}</div>
            ))}
            <div ref={consoleLogEndRef} />
          </div>
        </div>

      </div>

      {/* FULL WIDTH MAIN PANEL */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '28px', width: '100%' }}>
        
        {/* RUNTIME ERROR BANNER */}
        {error && (
          <div className="glass-panel" style={{ background: 'rgba(255, 51, 85, 0.08)', border: '1px solid rgba(255, 51, 85, 0.3)', borderLeft: '4px solid var(--accent-live)' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <div>
                <strong style={{ color: 'var(--accent-live)', display: 'block', fontSize: '0.95rem' }}>Local Storage Execution Exception</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* ENGINE CONTROLS */}
        <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '16px 24px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: 'white' }}>⚙️ Alignment Configuration</h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Configure match positioning sorting paradigm.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => { setSortType('scraped'); fetchPatterns('scraped'); }}
              disabled={loading}
              style={{
                background: sortType === 'scraped' ? 'var(--accent-neon)' : 'rgba(255,255,255,0.03)',
                color: sortType === 'scraped' ? '#000' : 'white',
                border: `1px solid ${sortType === 'scraped' ? 'var(--accent-neon)' : 'var(--glass-border)'}`,
                padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
            >
              📸 Visual Scraped Order
            </button>
            <button 
              onClick={() => { setSortType('homeTeam'); fetchPatterns('homeTeam'); }}
              disabled={loading}
              style={{
                background: sortType === 'homeTeam' ? 'var(--accent-neon)' : 'rgba(255,255,255,0.03)',
                color: sortType === 'homeTeam' ? '#000' : 'white',
                border: `1px solid ${sortType === 'homeTeam' ? 'var(--accent-neon)' : 'var(--glass-border)'}`,
                padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
            >
              🔤 Alphabetical Home Team
            </button>
          </div>
        </div>

        {/* REAL-TIME LIVE LIST AI PREDICTOR (DEEPSEEK) */}
        <section className="glass-panel ultra-glass hud-panel" style={{ padding: '24px', borderLeft: '4px solid var(--accent-neon)', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', border: '1px solid rgba(0,229,255,0.2)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: 'var(--accent-neon)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                🔮 Real-Time Live List AI Predictor (DeepSeek)
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Scrapes the active virtual football live list on SportyBet and uses DeepSeek Chat to analyze row positions and predict likely outcomes.
              </p>
            </div>
            
            <button
              onClick={handlePredictLiveList}
              disabled={predicting}
              style={{
                background: predicting ? 'rgba(0, 229, 255, 0.2)' : 'linear-gradient(135deg, #00E5FF, #00FF88)',
                color: '#000',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                cursor: predicting ? 'not-allowed' : 'pointer',
                fontWeight: '900',
                fontSize: '0.88rem',
                boxShadow: predicting ? 'none' : '0 4px 15px rgba(0, 229, 255, 0.25)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {predicting ? (
                <>
                  <span className="spinner spinner-small" style={{ display: 'inline-block', borderColor: '#000', borderTopColor: 'transparent' }} />
                  Analyzing Active Live Matches...
                </>
              ) : (
                <>
                  🤖 Predict Active Live List Matches
                </>
              )}
            </button>
          </div>

          {/* PREDICTOR ERROR / FALLBACK */}
          {predictionError && (
            <div style={{ background: 'rgba(255, 184, 0, 0.08)', border: '1px solid rgba(255, 184, 0, 0.3)', borderRadius: '8px', padding: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>⚠️</span>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#FFB800' }}>Active Match Round Status Warning:</strong> {predictionError}
              </div>
            </div>
          )}

          {/* ACTIVE PREDICTIONS BOARD */}
          {predictionResults && predictionResults.predictions && predictionResults.predictions.length > 0 && (
            <div ref={predictionsRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', background: 'rgba(10,15,30,0.6)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--accent-neon)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🎯 Predictions for Round: {predictionResults.league}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={handleCaptureScreenshot}
                    disabled={capturing}
                    style={{
                      background: capturing ? 'rgba(0, 229, 255, 0.05)' : 'rgba(0, 229, 255, 0.1)',
                      border: '1px solid var(--accent-neon)',
                      color: 'var(--accent-neon)',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      cursor: capturing ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: capturing ? 'none' : '0 0 10px rgba(0, 229, 255, 0.1)'
                    }}
                  >
                    {capturing ? '⏳ Capturing...' : '📸 Take Screenshot'}
                  </button>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Model: DeepSeek Chat (deepseek-chat)
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {predictionResults.predictions.map((pred) => {
                  const matchStatus = pred.status || 'UPCOMING';
                  return (
                    <div 
                      key={pred.position} 
                      className="glass-panel hover-lift" 
                      style={{ 
                        padding: '16px', 
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderLeft: `4px solid ${pred.color || 'var(--accent-neon)'}`,
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '10px',
                        background: 'rgba(0,0,0,0.15)',
                        boxShadow: `0 4px 10px rgba(0,0,0,0.3)`
                      }}
                    >
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            background: `${pred.color || 'var(--accent-neon)'}15`, 
                            color: pred.color || 'var(--accent-neon)', 
                            width: '24px', 
                            height: '24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            borderRadius: '50%', 
                            fontWeight: 800, 
                            border: `1px solid ${pred.color || 'var(--accent-neon)'}30`,
                            fontSize: '0.74rem'
                          }}>
                            {pred.position + 1}
                          </span>
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
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Confidence:</span>
                          <strong style={{ 
                            fontSize: '0.85rem', 
                            color: pred.confidence >= 75 ? '#00FF88' : pred.confidence >= 55 ? '#FFD700' : '#A78BFA',
                            textShadow: `0 0 6px ${pred.confidence >= 75 ? '#00FF88' : pred.confidence >= 55 ? '#FFD700' : '#A78BFA'}40`
                          }}>{pred.confidence}%</strong>
                        </div>
                      </div>

                      {/* Match Name */}
                      <strong style={{ color: 'white', fontSize: '0.94rem' }}>
                        {pred.match}
                      </strong>

                      {/* DeepSeek Prediction Badges */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Prediction Outcome */}
                        <div style={{ 
                          background: `${pred.color || 'var(--accent-neon)'}10`,
                          border: `1px solid ${pred.color || 'var(--accent-neon)'}40`,
                          color: pred.color || 'var(--accent-neon)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          boxShadow: `0 0 8px ${pred.color || 'var(--accent-neon)'}10`
                        }}>
                          <span>Outcome:</span>
                          <span style={{ fontSize: '0.8rem' }}>
                            {pred.predictedOutcome === 'H' ? '🏠 Home Win (H)' : pred.predictedOutcome === 'A' ? '✈️ Away Win (A)' : '🤝 Draw (D)'}
                          </span>
                        </div>

                        {/* Prediction BTTS */}
                        <div style={{ 
                          background: pred.predictedBtts === 'GG' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          border: pred.predictedBtts === 'GG' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                          color: pred.predictedBtts === 'GG' ? '#00FF88' : 'white',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 'bold'
                        }}>
                          <span>BTTS:</span>
                          <span>
                            {pred.predictedBtts === 'GG' ? '⚽ GG (Yes)' : '🚫 NG (No)'}
                          </span>
                        </div>
                      </div>

                      {/* DeepSeek Reasoning */}
                      <div style={{ 
                        background: 'rgba(255,255,255,0.02)', 
                        padding: '10px 12px', 
                        borderRadius: '6px', 
                        fontSize: '0.74rem', 
                        color: 'var(--text-secondary)',
                        lineHeight: '1.4',
                        border: '1px solid rgba(255,255,255,0.03)',
                        fontStyle: 'italic'
                      }}>
                        🧠 <strong style={{ color: 'var(--accent-neon)' }}>DeepSeek AI Analysis:</strong> "{pred.reasoning}"
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* POSITION CARDS LIST (FULL PAGE WIDTH CHASSIS) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
          <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 England Positional Trace Dashboard {loading && <span className="spinner spinner-small" style={{ display: 'inline-block' }}></span>}
          </h2>
          
          {results && results.positionPatterns && results.positionPatterns.length > 0 ? (
            results.positionPatterns.map((posData) => {
              const nextPred = posData.nextPrediction;
              const stats = posData.winLossDrawStats;
              const streak = posData.currentStreak;
              const transitions = posData.transitionProbabilities || {
                H: { H: 0, A: 0, D: 0, totalCount: 0 },
                A: { H: 0, A: 0, D: 0, totalCount: 0 },
                D: { H: 0, A: 0, D: 0, totalCount: 0 }
              };
              const bttsTransitions = posData.bttsTransitionProbabilities || {
                GG: { GG: 0, NG: 0, totalCount: 0 },
                NG: { GG: 0, NG: 0, totalCount: 0 }
              };
              
              const currentFilter = traceFilters[posData.position] || 'all';
              
              // Filter chronological trace based on option selected
              const filteredHistory = posData.recentHistory.filter(h => {
                if (currentFilter === 'all') return true;
                if (currentFilter === 'GG') {
                  const parts = h.score.split(':').map(Number);
                  return parts[0] > 0 && parts[1] > 0;
                }
                if (currentFilter === 'NG') {
                  const parts = h.score.split(':').map(Number);
                  return parts[0] === 0 || parts[1] === 0;
                }
                return h.outcome === currentFilter;
              });
              
              return (
                <div key={posData.position} className="glass-panel hover-lift" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', border: '1px solid rgba(255,255,255,0.06)' }}>
                  
                  {/* Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ background: 'rgba(0, 229, 255, 0.1)', color: 'var(--accent-neon)', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 800, border: '1px solid rgba(0, 229, 255, 0.2)', fontSize: '1.05rem' }}>
                        {posData.position + 1}
                      </span>
                      <div>
                        <strong style={{ color: 'white', fontSize: '1.1rem' }}>{posData.positionLabel}</strong>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'block' }}>
                          Based on {stats.totalMatches} rounds analyzed
                        </span>
                      </div>
                    </div>
                    
                    {/* Current Streak Badge */}
                    <div style={{
                      background: 'rgba(0,0,0,0.3)', border: `1px solid ${getOutcomeColor(streak.outcome)}50`,
                      borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: getOutcomeColor(streak.outcome), boxShadow: `0 0 8px ${getOutcomeColor(streak.outcome)}` }} />
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                        {streak.streak}x {streak.label} Streak Backwards
                      </span>
                    </div>
                  </div>
                  
                  {/* Trace Timeline with Interactive Filters */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                        ⬅️ CHRONOLOGICAL BACKWARD TRACE (NEWEST TO OLDEST) — ({filteredHistory.length} match{filteredHistory.length !== 1 ? 'es' : ''} shown)
                      </span>
                      
                      {/* Home/Away and BTTS Consideration Toggle Filters */}
                      <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
                        {[
                          { val: 'all', label: 'All' },
                          { val: 'H', label: '🏠 Home Wins' },
                          { val: 'A', label: '✈️ Away Wins' },
                          { val: 'D', label: '🤝 Draws' },
                          { val: 'GG', label: '⚽ GG (Both Score)' },
                          { val: 'NG', label: '🚫 NG (One/None)' }
                        ].map((btn) => (
                          <button
                            key={btn.val}
                            onClick={() => handleTraceFilterChange(posData.position, btn.val)}
                            style={{
                              background: currentFilter === btn.val ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                              border: 'none',
                              color: currentFilter === btn.val ? 'var(--accent-neon)' : 'var(--text-secondary)',
                              padding: '4px 10px',
                              borderRadius: '16px',
                              fontSize: '0.7rem',
                              fontWeight: currentFilter === btn.val ? 'bold' : 'normal',
                              cursor: 'pointer',
                              outline: 'none',
                              transition: 'all 0.15s'
                            }}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingBottom: '8px' }}>
                      {filteredHistory.length > 0 ? (
                        filteredHistory.map((h, index) => {
                          const parts = h.score.split(':').map(Number);
                          const isGG = parts[0] > 0 && parts[1] > 0;
                          return (
                            <div 
                              key={index} 
                              title={`${h.date} ${h.time} | ${h.homeTeam} ${h.score} ${h.awayTeam} | BTTS: ${isGG ? 'Yes (GG)' : 'No (NG)'}`}
                              style={{
                                padding: '8px 12px', borderRadius: '8px',
                                background: `${getOutcomeColor(h.outcome)}10`,
                                border: `1px solid ${getOutcomeColor(h.outcome)}40`,
                                color: getOutcomeColor(h.outcome),
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                minWidth: '85px',
                                cursor: 'help',
                                transition: 'all 0.2s',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                              }}
                              className="hover-lift"
                            >
                              <span style={{ fontSize: '0.62rem', fontWeight: 700, opacity: 0.85, color: '#FFFFFF', marginBottom: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                {abbreviateTeam(h.homeTeam)} vs {abbreviateTeam(h.awayTeam)}
                              </span>
                              <span style={{ fontSize: '1rem', fontWeight: 900, textShadow: `0 0 8px ${getOutcomeColor(h.outcome)}` }}>
                                {h.outcome}
                              </span>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.9, fontFamily: 'monospace', marginTop: '2px', color: '#FFF' }}>
                                {h.score}
                              </span>
                              <span style={{ 
                                fontSize: '0.55rem', 
                                fontWeight: 700, 
                                background: isGG ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 255, 255, 0.05)', 
                                color: isGG ? '#00FF88' : '#888',
                                padding: '1px 4px', 
                                borderRadius: '3px',
                                marginTop: '4px',
                                border: isGG ? '1px solid rgba(0, 255, 136, 0.2)' : '1px solid rgba(255,255,255,0.05)'
                              }}>
                                {isGG ? 'GG' : 'NG'}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}>
                          No matches in recent trace history match the selected outcome filter.
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Analytics columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    
                    {/* Prediction Column */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        🔮 Predicted Next Outcome
                      </span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <strong style={{ fontSize: '1.6rem', color: 'var(--accent-neon)' }}>
                          {nextPred.outcome}
                        </strong>
                        <span style={{ fontSize: '1rem', color: 'var(--accent-success)', fontWeight: 'bold' }}>
                          ({nextPred.probability}%)
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Markov probability triggered by current {nextPred.currentOutcome} outcome
                      </span>
                    </div>
                    
                    {/* Stats Breakdown */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                          📊 Position Win Breakdown
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#00FF88' }}>🏠 Home Win</span>
                            <strong>{stats.homeWins} ({stats.homeWinPercent}%)</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#FFD700' }}>🤝 Draw</span>
                            <strong>{stats.draws} ({stats.drawPercent}%)</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#A78BFA' }}>✈️ Away Win</span>
                            <strong>{stats.awayWins} ({stats.awayWinPercent}%)</strong>
                          </div>
                        </div>
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                          ⚽ Both Teams to Score (BTTS)
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#00FF88' }}>⚽ GG (Yes)</span>
                          <strong>{stats.bttsYes || 0} ({stats.bttsYesPercent || 0}%)</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#888' }}>🚫 NG (No)</span>
                          <strong>{stats.bttsNo || 0} ({stats.bttsNoPercent || 0}%)</strong>
                        </div>
                      </div>
                    </div>
                    
                    {/* Top Scorelines */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                        🔁 Top Recurring Scorelines
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem' }}>
                        {posData.topScores.slice(0, 3).map((scoreItem, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', color: 'white', fontWeight: 'bold' }}>{scoreItem.score}</span>
                            <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', margin: '0 8px', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${scoreItem.percent}%`, background: 'var(--accent-neon)' }} />
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{scoreItem.count}x ({scoreItem.percent}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Transition Analytics Column */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>
                        🧬 Post-Outcome Behavior
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.72rem' }}>
                        
                        {/* 1. MATCH OUTCOME TRANSITIONS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                            Match Result Next State
                          </span>
                          
                          {/* After Draw */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              🤝 After a <strong>Draw (D)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = transitions.D || { H: 0, A: 0, D: 0 };
                                const highest = getHighestOutcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'H' ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                                      border: highest === 'H' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'H' ? '0 0 6px rgba(0, 255, 136, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#00FF88', fontWeight: highest === 'H' ? 'bold' : 'normal'
                                    }}>H: {prob.H}%</span>
                                    <span style={{
                                      background: highest === 'D' ? 'rgba(255, 215, 0, 0.15)' : 'transparent',
                                      border: highest === 'D' ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'D' ? '0 0 6px rgba(255, 215, 0, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#FFD700', fontWeight: highest === 'D' ? 'bold' : 'normal'
                                    }}>D: {prob.D}%</span>
                                    <span style={{
                                      background: highest === 'A' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                                      border: highest === 'A' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'A' ? '0 0 6px rgba(167, 139, 250, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#A78BFA', fontWeight: highest === 'A' ? 'bold' : 'normal'
                                    }}>A: {prob.A}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* After Home Loss */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              ✈️ After <strong>Home Loss (A)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = transitions.A || { H: 0, A: 0, D: 0 };
                                const highest = getHighestOutcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'H' ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                                      border: highest === 'H' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'H' ? '0 0 6px rgba(0, 255, 136, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#00FF88', fontWeight: highest === 'H' ? 'bold' : 'normal'
                                    }}>H: {prob.H}%</span>
                                    <span style={{
                                      background: highest === 'D' ? 'rgba(255, 215, 0, 0.15)' : 'transparent',
                                      border: highest === 'D' ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'D' ? '0 0 6px rgba(255, 215, 0, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#FFD700', fontWeight: highest === 'D' ? 'bold' : 'normal'
                                    }}>D: {prob.D}%</span>
                                    <span style={{
                                      background: highest === 'A' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                                      border: highest === 'A' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'A' ? '0 0 6px rgba(167, 139, 250, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#A78BFA', fontWeight: highest === 'A' ? 'bold' : 'normal'
                                    }}>A: {prob.A}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* After Away Loss */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              🏠 After <strong>Away Loss (H)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = transitions.H || { H: 0, A: 0, D: 0 };
                                const highest = getHighestOutcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'H' ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                                      border: highest === 'H' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'H' ? '0 0 6px rgba(0, 255, 136, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#00FF88', fontWeight: highest === 'H' ? 'bold' : 'normal'
                                    }}>H: {prob.H}%</span>
                                    <span style={{
                                      background: highest === 'D' ? 'rgba(255, 215, 0, 0.15)' : 'transparent',
                                      border: highest === 'D' ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'D' ? '0 0 6px rgba(255, 215, 0, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#FFD700', fontWeight: highest === 'D' ? 'bold' : 'normal'
                                    }}>D: {prob.D}%</span>
                                    <span style={{
                                      background: highest === 'A' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                                      border: highest === 'A' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'A' ? '0 0 6px rgba(167, 139, 250, 0.2)' : 'none',
                                      padding: '2px 5px', borderRadius: '4px', color: '#A78BFA', fontWeight: highest === 'A' ? 'bold' : 'normal'
                                    }}>A: {prob.A}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* 2. BTTS TRANSITIONS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                            ⚽ BTTS Next State
                          </span>

                          {/* After Both Score (GG) */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              ⚽ After <strong>Both Score (GG)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = bttsTransitions.GG || { GG: 0, NG: 0 };
                                const highest = getHighestBttsOutcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'GG' ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                                      border: highest === 'GG' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'GG' ? '0 0 6px rgba(0, 255, 136, 0.2)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#00FF88', fontWeight: highest === 'GG' ? 'bold' : 'normal'
                                    }}>GG: {prob.GG}%</span>
                                    <span style={{
                                      background: highest === 'NG' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                      border: highest === 'NG' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'NG' ? '0 0 6px rgba(255, 255, 255, 0.1)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#FFF', fontWeight: highest === 'NG' ? 'bold' : 'normal'
                                    }}>NG: {prob.NG}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* After One/None (NG) */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              🚫 After <strong>One/None (NG)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = bttsTransitions.NG || { GG: 0, NG: 0 };
                                const highest = getHighestBttsOutcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'GG' ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                                      border: highest === 'GG' ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'GG' ? '0 0 6px rgba(0, 255, 136, 0.2)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#00FF88', fontWeight: highest === 'GG' ? 'bold' : 'normal'
                                    }}>GG: {prob.GG}%</span>
                                    <span style={{
                                      background: highest === 'NG' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                      border: highest === 'NG' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'NG' ? '0 0 6px rgba(255, 255, 255, 0.1)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#FFF', fontWeight: highest === 'NG' ? 'bold' : 'normal'
                                    }}>NG: {prob.NG}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                        </div>

                      </div>
                    </div>

                  </div>
                </div>
              );
            })
          ) : (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', width: '100%' }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>📂</span>
              <strong>No Positional Patterns Computed</strong>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Use the scraper in the control dashboard above to pull England League results into your local storage database!
              </p>
            </div>
          )}
        </div>

      </main>
        </>
      )}
      {activeView === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', width: '100%' }}>
          
          {/* HISTORY SECTION HOW IT WORKS */}
          <section className="glass-panel ultra-glass hud-panel" style={{ padding: '24px', borderLeft: '4px solid var(--accent-success)' }}>
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📖 Prediction History & Automatic Verification
            </h3>
            <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
              Every time you generate live predictions, they are stored in the local file database <code>local_predictions_history.json</code>.
              When new finished match results are scraped into <code>local_results.json</code>, the history page automatically resolves those outcomes in real-time, verifying both **Outright Match Winners** and **BTTS (Both Teams To Score)** results.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', fontSize: '0.82rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: 'white', display: 'block', marginBottom: '6px' }}>✓ / ✗ Auto Verification</strong>
                Outright winners and BTTS predictions are automatically matched against finished games on the corresponding round date using team name abbreviations.
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: 'white', display: 'block', marginBottom: '6px' }}>📈 Round Accuracy Metrics</strong>
                Shows percentage of correct predictions for each finished round to evaluate AI accuracy trends.
              </div>
            </div>
          </section>

          {/* LOADING AND ERROR BANNER */}
          {loadingHistory && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', gap: '12px' }}>
              <span className="spinner" />
              <span style={{ color: 'var(--text-secondary)' }}>Loading prediction history...</span>
            </div>
          )}

          {historyError && (
            <div className="glass-panel" style={{ background: 'rgba(255, 51, 85, 0.08)', border: '1px solid rgba(255, 51, 85, 0.3)', borderLeft: '4px solid var(--accent-live)', padding: '20px' }}>
              <strong style={{ color: 'var(--accent-live)', display: 'block', fontSize: '0.95rem' }}>Failed to Load History</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{historyError}</p>
            </div>
          )}

          {/* HISTORY LIST */}
          {!loadingHistory && !historyError && (
            historyList.length === 0 ? (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', width: '100%' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>📜</span>
                <strong>No predictions history found.</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Use the Live Predictor to generate AI predictions for active matches. They will appear here once saved!
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
                {historyList.map((round) => {
                  // Calculate accuracy
                  const resolvedPreds = round.predictions.filter(p => p.resolved);
                  const totalResolved = resolvedPreds.length;
                  const correctOutcome = resolvedPreds.filter(p => p.outcomeCorrect).length;
                  const correctBtts = resolvedPreds.filter(p => p.bttsCorrect).length;

                  const outcomePct = totalResolved > 0 ? Math.round((correctOutcome / totalResolved) * 100) : null;
                  const bttsPct = totalResolved > 0 ? Math.round((correctBtts / totalResolved) * 100) : null;

                  return (
                    <div 
                      key={round.id} 
                      className="glass-panel" 
                      style={{ 
                        padding: '24px', 
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderLeft: `4px solid ${totalResolved > 0 ? 'var(--accent-success)' : 'var(--accent-gold)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        width: '100%'
                      }}
                    >
                      {/* Round Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '14px' }}>
                        <div>
                          <strong style={{ color: 'white', fontSize: '1.15rem', display: 'block' }}>
                            Round: {round.league}
                          </strong>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            📅 Match Date: {round.date} | Captured: {new Date(round.capturedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        {/* Accuracy Badges */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          {totalResolved > 0 ? (
                            <>
                              <div style={{ background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.2)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Outcome Accuracy</span>
                                <strong style={{ color: 'var(--accent-success)', fontSize: '1.05rem' }}>{correctOutcome}/{totalResolved} ({outcomePct}%)</strong>
                              </div>
                              <div style={{ background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.2)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', textTransform: 'uppercase' }}>BTTS Accuracy</span>
                                <strong style={{ color: 'var(--accent-success)', fontSize: '1.05rem' }}>{correctBtts}/{totalResolved} ({bttsPct}%)</strong>
                              </div>
                            </>
                          ) : (
                            <div style={{ background: 'rgba(255, 215, 0, 0.08)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '8px 14px', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                              ⏳ Pending Match Completion
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prediction Cards Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {round.predictions.map((pred) => {
                          return (
                            <div 
                              key={pred.position} 
                              className="glass-panel" 
                              style={{ 
                                padding: '16px', 
                                border: '1px solid rgba(255,255,255,0.04)',
                                background: 'rgba(0,0,0,0.15)',
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '12px'
                              }}
                            >
                              {/* Position & Time */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ 
                                    background: 'rgba(255,255,255,0.06)', 
                                    color: 'white', 
                                    width: '22px', 
                                    height: '22px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    borderRadius: '50%', 
                                    fontWeight: 800, 
                                    fontSize: '0.7rem'
                                  }}>
                                    {pred.position + 1}
                                  </span>
                                  {pred.time && (
                                    <span style={{ fontSize: '0.62rem', background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                      🕒 {pred.time}
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                  Conf: <strong style={{ color: 'white' }}>{pred.confidence}%</strong>
                                </span>
                              </div>

                              {/* Match Title */}
                              <strong style={{ color: 'white', fontSize: '0.9rem' }}>
                                {pred.match}
                              </strong>

                              {/* Prediction & Outcome Badges */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                
                                {/* Outcome Verification */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)' }}>Outcome: </span>
                                    <strong style={{ color: getOutcomeColor(pred.predictedOutcome) }}>{pred.predictedOutcome}</strong>
                                  </div>
                                  {pred.resolved ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Actual: <strong>{pred.actualOutcome}</strong></span>
                                      <span style={{ 
                                        color: pred.outcomeCorrect ? 'var(--accent-success)' : 'var(--accent-live)',
                                        fontWeight: 'bold',
                                        background: pred.outcomeCorrect ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 85, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem'
                                      }}>
                                        {pred.outcomeCorrect ? '✓ OK' : '✗ ERR'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--accent-gold)', fontSize: '0.7rem' }}>Pending</span>
                                  )}
                                </div>

                                {/* BTTS Verification */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)' }}>BTTS: </span>
                                    <strong style={{ color: pred.predictedBtts === 'GG' ? 'var(--accent-success)' : 'white' }}>{pred.predictedBtts}</strong>
                                  </div>
                                  {pred.resolved ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Actual: <strong>{pred.actualBtts}</strong></span>
                                      <span style={{ 
                                        color: pred.bttsCorrect ? 'var(--accent-success)' : 'var(--accent-live)',
                                        fontWeight: 'bold',
                                        background: pred.bttsCorrect ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 85, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem'
                                      }}>
                                        {pred.bttsCorrect ? '✓ OK' : '✗ ERR'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--accent-gold)', fontSize: '0.7rem' }}>Pending</span>
                                  )}
                                </div>

                                {/* Actual Score */}
                                {pred.resolved && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Actual Score:</span>
                                    <strong style={{ color: 'white', fontFamily: 'monospace' }}>{pred.actualScore}</strong>
                                  </div>
                                )}
                              </div>

                              {/* AI Reasoning */}
                              <div style={{ 
                                background: 'rgba(255,255,255,0.01)', 
                                padding: '8px 10px', 
                                borderRadius: '6px', 
                                fontSize: '0.7rem', 
                                color: 'var(--text-secondary)',
                                border: '1px solid rgba(255,255,255,0.02)',
                                fontStyle: 'italic',
                                marginTop: '4px'
                              }}>
                                🧠 AI: "{pred.reasoning}"
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      
    </div>
  );
}
