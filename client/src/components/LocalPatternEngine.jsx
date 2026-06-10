import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

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

// Find the highest Over 1.5 probability for visual highlighting
const getHighestOver15Outcome = (transRow) => {
  if (!transRow) return null;
  const { O15, U15 } = transRow;
  const maxVal = Math.max(O15 || 0, U15 || 0);
  if (maxVal === 0) return null;
  if (maxVal === O15) return 'O15';
  return 'U15';
};

// Find the highest Over 2.5 probability for visual highlighting
const getHighestOver25Outcome = (transRow) => {
  if (!transRow) return null;
  const { O25, U25 } = transRow;
  const maxVal = Math.max(O25 || 0, U25 || 0);
  if (maxVal === 0) return null;
  if (maxVal === O25) return 'O25';
  return 'U25';
};


export default function LocalPatternEngine() {
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  // Mobile responsive trace collapse state (screens <= 768px)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [expandedTraces, setExpandedTraces] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleTraceExpand = (positionIndex) => {
    setExpandedTraces(prev => ({
      ...prev,
      [positionIndex]: !prev[positionIndex]
    }));
  };
  
  // Scraper inputs
  const todayISO = new Date().toISOString().split('T')[0];
  const [targetDate, setTargetDate] = useState(todayISO);
  const [selectedLeague, setSelectedLeague] = useState('England League');
  const [scraperLeague, setScraperLeague] = useState('England League');
  const [scrapeAllPages, setScrapeAllPages] = useState(true);
  
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
  // Auto-update / Polling states (Defaults to 120s, doubled)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(120);
  const [countdown, setCountdown] = useState(120);
  const [manualTriggering, setManualTriggering] = useState(false);
  // League tabs list
  const leagueTabs = [
    { id: 'England League', label: 'England 🏴󠁧󠁢󠁥󠁮󠁧󠁿', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'Spain League', label: 'Spain 🇪🇸', emoji: '🇪🇸' },
    { id: 'Italy League', label: 'Italy 🇮🇹', emoji: '🇮🇹' },
    { id: 'Germany League', label: 'Germany 🇩🇪', emoji: '🇩🇪' },
    { id: 'France League', label: 'France 🇫🇷', emoji: '🇫🇷' }
  ];

  // Local Wipe states
  const [wipeConfirmVisible, setWipeConfirmVisible] = useState(false);
  const [wipeScope, setWipeScope] = useState('all'); // 'all' | 'results' | 'history'
  const [wipeScopeLeague, setWipeScopeLeague] = useState('current'); // 'current' | 'all'
  const [wipeWroteConfirm, setWipeWroteConfirm] = useState('');
  const [wiping, setWiping] = useState(false);

  // Helper to add console log with timestamp
  const logMessage = (msg) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setConsoleLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // Switch active league tab
  const handleLeagueTabChange = (leagueId) => {
    setSelectedLeague(leagueId);
    setScraperLeague(leagueId);
    logMessage(`🔌 Switched active league to: ${leagueId}`);
  };

  // Wipe local results / history
  const handleWipeData = async () => {
    if (wipeWroteConfirm !== 'WIPE' || wiping) return;
    const targetLeague = wipeScopeLeague === 'current' ? selectedLeague : 'all';
    logMessage(`🗑️ Sending wipe request for target: ${targetLeague}, scope: ${wipeScope}...`);
    setWiping(true);
    try {
      const response = await fetch('/api/local-vfootball/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: targetLeague, scope: wipeScope })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        logMessage(`✅ PURGE SUCCESSFUL: ${data.message}`);
        setWipeConfirmVisible(false);
        setWipeWroteConfirm('');
        // Refresh local views
        await fetchPatterns(sortType, selectedLeague);
      } else {
        throw new Error(data.message || 'Server rejected wipe request');
      }
    } catch (err) {
      console.error('[Wipe Error]', err);
      logMessage(`❌ PURGE FAILED: ${err.message}`);
      alert(`Purge failed: ${err.message}`);
    } finally {
      setWiping(false);
    }
  };

  // Scroll to bottom of terminal console
  useEffect(() => {
    consoleLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // Fetch local patterns and results
  const fetchPatterns = async (currentSort = sortType, league = selectedLeague) => {
    setLoading(true);
    setError(null);
    logMessage(`🔄 Querying ${league} patterns from local file storage (sortType: ${currentSort})...`);
    
    try {
      const response = await fetch(`/api/local-vfootball/patterns?sortType=${currentSort}&league=${encodeURIComponent(league)}`);
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

  // Fetch patterns when sortType or selectedLeague changes
  useEffect(() => {
    fetchPatterns(sortType, selectedLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortType, selectedLeague]);



  // Polling / Auto-Update Effect
  useEffect(() => {
    // Reset countdown when interval changes or autoRefresh is toggled
    setCountdown(autoRefreshInterval);

    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Trigger automatic fetch
          fetchPatterns(sortType, selectedLeague);
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, autoRefreshInterval, sortType, selectedLeague]);

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
    logMessage(`🚀 Initiating Puppeteer scraper for "${scraperLeague}" on date ${targetDate} (Full Day: ${scrapeAllPages ? 'YES' : 'NO'})...`);
    
    try {
      const response = await fetch('/api/local-vfootball/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: scraperLeague, date: targetDate, scrapeAllPages })
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
          <Link to="/" className="hover-lift" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.target.style.color = 'var(--accent-neon)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}>🔮 Live Predictor</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <span style={{ color: 'var(--accent-neon)', fontSize: '0.8rem', fontWeight: 700 }}>📊 Positional Trace Dashboard</span>
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
            Full-width chronological backward trace mapping for {selectedLeague} • 10 matches per round alignment
          </span>
        </p>
      </header>

      {/* LEAGUE & VIEW SEGMENT SELECTORS */}
      {isMobile ? (
        <div style={{ marginBottom: '20px', width: '100%' }}>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.1), rgba(0, 255, 136, 0.1))',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              color: 'var(--text-primary)',
              padding: '12px 16px',
              borderRadius: '10px',
              fontWeight: 'bold',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚙️</span>
              <span>Controls: {selectedLeague.replace(' League', '')}</span>
            </div>
            <span>{mobileMenuOpen ? '▲ CLOSE' : '▼ EXPAND MENU'}</span>
          </button>

          {mobileMenuOpen && (
            <div style={{
              marginTop: '8px',
              padding: '16px',
              background: 'rgba(10,15,30,0.95)',
              border: '1px solid rgba(0, 229, 255, 0.15)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              position: 'relative',
              zIndex: 10
            }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                  🏆 SELECT VIRTUAL LEAGUE
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {leagueTabs.map(tab => {
                    const isSelected = selectedLeague === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          handleLeagueTabChange(tab.id);
                          setMobileMenuOpen(false);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: isSelected ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255,255,255,0.02)',
                          color: isSelected ? 'var(--accent-neon)' : 'var(--text-secondary)',
                          border: isSelected ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid var(--glass-border)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? 800 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.15s'
                        }}
                      >
                        <span>{tab.emoji}</span>
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* LEAGUE TAB SELECTOR (DESKTOP) */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0 16px 0', borderBottom: '1px solid var(--glass-border)', marginBottom: '16px' }}>
            {leagueTabs.map(tab => {
              const isSelected = selectedLeague === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleLeagueTabChange(tab.id)}
                  className="hover-lift"
                  style={{
                    background: isSelected ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    color: isSelected ? 'var(--accent-neon)' : 'var(--text-secondary)',
                    border: isSelected ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid var(--glass-border)',
                    padding: '10px 18px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 800 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: isSelected ? '0 0 15px rgba(0, 229, 255, 0.15)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>


        </>
      )}

        <>
          {/* DETAILED "HOW IT WORKS" GUIDELINES SECTION */}
      <section className="glass-panel ultra-glass hud-panel" style={{ padding: '24px', borderLeft: '4px solid var(--accent-neon)' }}>
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--accent-neon)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📖 How Positional {selectedLeague} Pattern Trace Works
        </h3>
        <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
          Virtual Football (vFootball) matches operate in fixed chronological rounds. Each round triggers exactly <strong>10 matches</strong> simultaneously.
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
              <span>🗄️</span> Supabase & Local Database
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Storage Mode</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>Supabase + Fallback</span>
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
                  <option value={60}>60s</option>
                  <option value={90}>90s</option>
                  <option value={120}>120s (Default)</option>
                  <option value={180}>180s</option>
                </select>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => fetchPatterns(sortType, selectedLeague)}
            disabled={loading || scraping}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', color: 'white',
              border: '1px solid var(--glass-border)', padding: '10px', borderRadius: '8px',
              cursor: loading || scraping ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 'bold', transition: 'all 0.2s', marginTop: 'auto'
            }}
            className="hover-lift"
          >
            {loading ? '🔄 Querying...' : '🔄 Refresh File Dashboard'}
          </button>
 
          <button 
            onClick={() => setWipeConfirmVisible(true)}
            style={{
              width: '100%', background: 'rgba(255,51,85,0.08)', color: 'var(--accent-live)',
              border: '1px solid rgba(255,51,85,0.3)', padding: '10px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold', transition: 'all 0.2s', marginTop: '10px'
            }}
            className="hover-lift"
          >
            🗑️ Wipe Database & Local
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
                  value={scraperLeague} 
                  onChange={(e) => setScraperLeague(e.target.value)}
                  disabled={scraping}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                    color: 'white', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem', outline: 'none'
                  }}
                >
                  <option value="all">All Leagues (Entire Day)</option>
                  <option value="England League">England League</option>
                  <option value="Spain League">Spain League</option>
                  <option value="Italy League">Italy League</option>
                  <option value="Germany League">Germany League</option>
                  <option value="France League">France League</option>
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
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <input 
                type="checkbox" 
                id="scrape-all-pages"
                checked={scrapeAllPages} 
                onChange={(e) => setScrapeAllPages(e.target.checked)}
                disabled={scraping}
                style={{
                  cursor: scraping ? 'not-allowed' : 'pointer',
                  accentColor: 'var(--accent-neon)',
                  width: '16px',
                  height: '16px'
                }}
              />
              <label 
                htmlFor="scrape-all-pages" 
                style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--text-secondary)', 
                  cursor: scraping ? 'not-allowed' : 'pointer',
                  userSelect: 'none'
                }}
              >
                Scrape All Pages (Entire Day)
              </label>
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
              {scraping ? '⏳ Scraping to Supabase...' : '🚀 Scrape to Supabase'}
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



        {/* POSITION CARDS LIST (FULL PAGE WIDTH CHASSIS) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
          <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 {selectedLeague} Positional Trace Dashboard {loading && <span className="spinner spinner-small" style={{ display: 'inline-block' }}></span>}
          </h2>
          
          {results && results.positionPatterns && results.positionPatterns.length > 0 ? (
            results.positionPatterns.map((posData) => {
              console.log(`[LocalPatternEngine] Processing position pattern mapping for: ${posData.positionLabel || posData.position}`);
              if (!posData.topScores) {
                console.warn(`[LocalPatternEngine] Missing topScores property for position ${posData.positionLabel || posData.position}. Falling back to empty array.`);
              }
              const nextPred = posData.nextPrediction || { outcome: 'D', probability: 33, currentOutcome: 'D' };
              const stats = posData.winLossDrawStats || {
                homeWinPercent: 0,
                awayWinPercent: 0,
                drawPercent: 0,
                bttsYesPercent: 0,
                bttsNoPercent: 0,
                over15Percent: 0,
                over25Percent: 0,
                totalMatches: 0
              };
              const streak = posData.currentStreak ? {
                ...posData.currentStreak,
                label: posData.currentStreak.label || (posData.currentStreak.outcome === 'H' ? 'Home Win' : posData.currentStreak.outcome === 'A' ? 'Away Win' : 'Draw')
              } : { outcome: 'D', streak: 0, label: 'Draw' };
              const transitions = posData.transitionProbabilities || {
                H: { H: 0, A: 0, D: 0, totalCount: 0 },
                A: { H: 0, A: 0, D: 0, totalCount: 0 },
                D: { H: 0, A: 0, D: 0, totalCount: 0 }
              };
              const bttsTransitions = posData.bttsTransitionProbabilities || {
                GG: { GG: 0, NG: 0, totalCount: 0 },
                NG: { GG: 0, NG: 0, totalCount: 0 }
              };
              const over15Transitions = posData.over15TransitionProbabilities || {
                O15: { O15: 0, U15: 0, totalCount: 0 },
                U15: { O15: 0, U15: 0, totalCount: 0 }
              };
              const over25Transitions = posData.over25TransitionProbabilities || {
                O25: { O25: 0, U25: 0, totalCount: 0 },
                U25: { O25: 0, U25: 0, totalCount: 0 }
              };
              
              const currentFilter = traceFilters[posData.position] || 'all';
              
              // Filter chronological trace based on option selected (with fallback empty array)
              const filteredHistory = (posData.recentHistory || []).filter(h => {
                if (currentFilter === 'all') return true;
                if (currentFilter === 'GG') {
                  const parts = h.score.split(':').map(Number);
                  return parts[0] > 0 && parts[1] > 0;
                }
                if (currentFilter === 'NG') {
                  const parts = h.score.split(':').map(Number);
                  return parts[0] === 0 || parts[1] === 0;
                }
                if (currentFilter === 'O15') {
                  const parts = h.score.split(':').map(Number);
                  return (parts[0] + parts[1]) >= 2;
                }
                if (currentFilter === 'O25') {
                  const parts = h.score.split(':').map(Number);
                  return (parts[0] + parts[1]) >= 3;
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
                    
                    <div 
                      onClick={isMobile ? () => toggleTraceExpand(posData.position) : undefined}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        flexWrap: 'wrap', 
                        gap: '12px', 
                        marginBottom: (!isMobile || expandedTraces[posData.position]) ? '12px' : '0px',
                        cursor: isMobile ? 'pointer' : 'default',
                        userSelect: 'none'
                      }}
                    >
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                        ⬅️ CHRONOLOGICAL BACKWARD TRACE (NEWEST TO OLDEST) — ({filteredHistory.length} match{filteredHistory.length !== 1 ? 'es' : ''} shown)
                      </span>
                      
                      {!isMobile && (
                        /* Home/Away and BTTS Consideration Toggle Filters (Desktop) */
                        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
                          {[
                            { val: 'all', label: 'All' },
                            { val: 'H', label: '🏠 Home' },
                            { val: 'A', label: '✈️ Away' },
                            { val: 'D', label: '🤝 Draw' },
                            { val: 'GG', label: '⚽ GG' },
                            { val: 'NG', label: '🚫 NG' },
                            { val: 'O15', label: '⚽ O1.5' },
                            { val: 'O25', label: '⚽ O2.5' }
                          ].map((btn) => (
                            <button
                              key={btn.val}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTraceFilterChange(posData.position, btn.val);
                              }}
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
                      )}

                      {isMobile && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--accent-neon)',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(0, 229, 255, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(0, 229, 255, 0.2)'
                        }}>
                          {expandedTraces[posData.position] ? '▲ COLLAPSE' : '▼ EXPAND'}
                        </span>
                      )}
                    </div>

                    {(!isMobile || expandedTraces[posData.position]) && (
                      <>
                        {isMobile && (
                          /* Home/Away and BTTS Consideration Toggle Filters (Mobile) */
                          <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', marginBottom: '12px' }}>
                            {[
                              { val: 'all', label: 'All' },
                              { val: 'H', label: '🏠 Home' },
                              { val: 'A', label: '✈️ Away' },
                              { val: 'D', label: '🤝 Draw' },
                              { val: 'GG', label: '⚽ GG' },
                              { val: 'NG', label: '🚫 NG' },
                              { val: 'O15', label: '⚽ O1.5' },
                              { val: 'O25', label: '⚽ O2.5' }
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
                        )}

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingBottom: '8px' }}>
                          {filteredHistory.length > 0 ? (
                            filteredHistory.map((h, index) => {
                              const parts = h.score.split(':').map(Number);
                              const isGG = parts[0] > 0 && parts[1] > 0;
                              const goals = parts[0] + parts[1];
                              const isO15 = goals >= 2;
                              const isO25 = goals >= 3;
                              return (
                                <div 
                                  key={index} 
                                  title={`${h.date} ${h.time} | ${h.homeTeam} ${h.score} ${h.awayTeam} | BTTS: ${isGG ? 'Yes (GG)' : 'No (NG)'} | Goals: ${goals} (O1.5: ${isO15 ? 'Yes' : 'No'}, O2.5: ${isO25 ? 'Yes' : 'No'})`}
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
                                  <div style={{ display: 'flex', gap: '3px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <span style={{ 
                                      fontSize: '0.55rem', 
                                      fontWeight: 700, 
                                      background: isGG ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 255, 255, 0.05)', 
                                      color: isGG ? '#00FF88' : '#888',
                                      padding: '1px 4px', 
                                      borderRadius: '3px',
                                      border: isGG ? '1px solid rgba(0, 255, 136, 0.2)' : '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                      {isGG ? 'GG' : 'NG'}
                                    </span>
                                    <span style={{ 
                                      fontSize: '0.55rem', 
                                      fontWeight: 700, 
                                      background: isO15 ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)', 
                                      color: isO15 ? '#00E5FF' : '#888',
                                      padding: '1px 4px', 
                                      borderRadius: '3px',
                                      border: isO15 ? '1px solid rgba(0, 229, 255, 0.2)' : '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                      {isO15 ? 'O1.5' : 'U1.5'}
                                    </span>
                                    <span style={{ 
                                      fontSize: '0.55rem', 
                                      fontWeight: 700, 
                                      background: isO25 ? 'rgba(167, 139, 250, 0.12)' : 'rgba(255, 255, 255, 0.05)', 
                                      color: isO25 ? '#A78BFA' : '#888',
                                      padding: '1px 4px', 
                                      borderRadius: '3px',
                                      border: isO25 ? '1px solid rgba(167, 139, 250, 0.2)' : '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                      {isO25 ? 'O2.5' : 'U2.5'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}>
                              No matches in recent trace history match the selected outcome filter.
                            </div>
                          )}
                        </div>
                      </>
                    )}
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
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                          ⚽ Goals Consideration
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#00E5FF' }}>⚽ Over 1.5</span>
                          <strong>{stats.over15Percent || 0}%</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#A78BFA' }}>⚽ Over 2.5</span>
                          <strong>{stats.over25Percent || 0}%</strong>
                        </div>
                      </div>
                    </div>
                    
                    {/* Top Scorelines */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                        🔁 Top Recurring Scorelines
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem' }}>
                        {(posData.topScores || []).slice(0, 3).map((scoreItem, idx) => (
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

                        {/* 3. OVER 1.5 TRANSITIONS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                            ⚽ Over 1.5 Next State
                          </span>

                          {/* After Over 1.5 */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              ⚽ After <strong>Over 1.5 (O15)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = over15Transitions.O15 || { O15: 0, U15: 0 };
                                const highest = getHighestOver15Outcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'O15' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                                      border: highest === 'O15' ? '1px solid #00E5FF' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'O15' ? '0 0 6px rgba(0, 229, 255, 0.2)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#00E5FF', fontWeight: highest === 'O15' ? 'bold' : 'normal'
                                    }}>O1.5: {prob.O15}%</span>
                                    <span style={{
                                      background: highest === 'U15' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                      border: highest === 'U15' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'U15' ? '0 0 6px rgba(255, 255, 255, 0.1)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#FFF', fontWeight: highest === 'U15' ? 'bold' : 'normal'
                                    }}>U1.5: {prob.U15}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* After Under 1.5 */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              🚫 After <strong>Under 1.5 (U15)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = over15Transitions.U15 || { O15: 0, U15: 0 };
                                const highest = getHighestOver15Outcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'O15' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                                      border: highest === 'O15' ? '1px solid #00E5FF' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'O15' ? '0 0 6px rgba(0, 229, 255, 0.2)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#00E5FF', fontWeight: highest === 'O15' ? 'bold' : 'normal'
                                    }}>O1.5: {prob.O15}%</span>
                                    <span style={{
                                      background: highest === 'U15' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                      border: highest === 'U15' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'U15' ? '0 0 6px rgba(255, 255, 255, 0.1)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#FFF', fontWeight: highest === 'U15' ? 'bold' : 'normal'
                                    }}>U1.5: {prob.U15}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* 4. OVER 2.5 TRANSITIONS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                            ⚽ Over 2.5 Next State
                          </span>

                          {/* After Over 2.5 */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              ⚽ After <strong>Over 2.5 (O25)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = over25Transitions.O25 || { O25: 0, U25: 0 };
                                const highest = getHighestOver25Outcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'O25' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                                      border: highest === 'O25' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'O25' ? '0 0 6px rgba(167, 139, 250, 0.2)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#A78BFA', fontWeight: highest === 'O25' ? 'bold' : 'normal'
                                    }}>O2.5: {prob.O25}%</span>
                                    <span style={{
                                      background: highest === 'U25' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                      border: highest === 'U25' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'U25' ? '0 0 6px rgba(255, 255, 255, 0.1)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#FFF', fontWeight: highest === 'U25' ? 'bold' : 'normal'
                                    }}>U2.5: {prob.U25}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* After Under 2.5 */}
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                              🚫 After <strong>Under 2.5 (U25)</strong>:
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {(() => {
                                const prob = over25Transitions.U25 || { O25: 0, U25: 0 };
                                const highest = getHighestOver25Outcome(prob);
                                return (
                                  <>
                                    <span style={{
                                      background: highest === 'O25' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                                      border: highest === 'O25' ? '1px solid #A78BFA' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'O25' ? '0 0 6px rgba(167, 139, 250, 0.2)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#A78BFA', fontWeight: highest === 'O25' ? 'bold' : 'normal'
                                    }}>O2.5: {prob.O25}%</span>
                                    <span style={{
                                      background: highest === 'U25' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                      border: highest === 'U25' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                      boxShadow: highest === 'U25' ? '0 0 6px rgba(255, 255, 255, 0.1)' : 'none',
                                      padding: '2px 6px', borderRadius: '4px', color: '#FFF', fontWeight: highest === 'U25' ? 'bold' : 'normal'
                                    }}>U2.5: {prob.U25}%</span>
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
                Use the scraper in the control dashboard above to pull England League results into your Supabase database!
              </p>
            </div>
          )}
        </div>

      </main>
        </>

      {wipeConfirmVisible && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(8, 11, 17, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div 
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '480px',
              border: '1px solid rgba(255, 51, 85, 0.4)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(255, 51, 85, 0.15)',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              background: 'rgba(14, 20, 32, 0.95)',
              position: 'relative'
            }}
          >
            {/* Header / Warning Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,51,85,0.2)', paddingBottom: '14px' }}>
              <span style={{ fontSize: '2rem' }}>🚨</span>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent-live)', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.05em' }}>
                  DANGER ZONE: LOCAL PURGE
                </h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  This action is permanent and cannot be undone.
                </span>
              </div>
            </div>

            {/* Warning Message Box */}
            <div style={{ background: 'rgba(255, 51, 85, 0.05)', border: '1px solid rgba(255, 51, 85, 0.15)', borderRadius: '8px', padding: '14px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Wipe Action Scope:
              </span>
              You are about to delete Virtual Football database records stored locally on the server. Please select which records and leagues you want to purge:
            </div>

            {/* Inputs Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Target League select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Select League Target:
                </label>
                <select 
                  value={wipeScopeLeague} 
                  onChange={(e) => setWipeScopeLeague(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'white',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    outline: 'none',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  <option value="current">Only {selectedLeague} ({selectedLeague === 'England League' ? 'England - Virtual' : selectedLeague === 'Spain League' ? 'Spain - Virtual' : selectedLeague === 'Italy League' ? 'Italy - Virtual' : selectedLeague === 'Germany League' ? 'Germany - Virtual' : 'France - Virtual'})</option>
                  <option value="all">ALL LEAGUES (England, Spain, Italy, Germany, France)</option>
                </select>
              </div>

              {/* Scope select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Select Data Type Scope:
                </label>
                <select 
                  value={wipeScope} 
                  onChange={(e) => setWipeScope(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'white',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    outline: 'none',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  <option value="all">Everything (Supabase & Local Backup)</option>
                  <option value="results">Scraped Results Only (Supabase & Local)</option>
                  <option value="history">AI Predictions History Only (Supabase & Local)</option>
                </select>
              </div>

              {/* Write confirm text */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  To confirm, type <strong style={{ color: 'var(--accent-live)' }}>WIPE</strong> below:
                </label>
                <input 
                  type="text" 
                  value={wipeWroteConfirm} 
                  onChange={(e) => setWipeWroteConfirm(e.target.value)}
                  placeholder="WIPE"
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255, 51, 85, 0.3)',
                    color: 'white',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    outline: 'none',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    letterSpacing: '0.2em'
                  }}
                />
              </div>

            </div>

            {/* Actions Button */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button 
                onClick={handleWipeData}
                disabled={wipeWroteConfirm !== 'WIPE' || wiping}
                style={{
                  flex: 1,
                  background: 'var(--accent-live)',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: (wipeWroteConfirm !== 'WIPE' || wiping) ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  opacity: (wipeWroteConfirm !== 'WIPE' || wiping) ? 0.5 : 1,
                  boxShadow: (wipeWroteConfirm !== 'WIPE' || wiping) ? 'none' : '0 4px 15px rgba(255, 51, 85, 0.25)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {wiping ? (
                  <>
                    <span className="spinner spinner-small" style={{ borderColor: '#fff', borderTopColor: 'transparent', display: 'inline-block' }} />
                    Wiping Data...
                  </>
                ) : (
                  'Confirm Purge'
                )}
              </button>
              
              <button 
                onClick={() => {
                  setWipeConfirmVisible(false);
                  setWipeWroteConfirm('');
                }}
                disabled={wiping}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--glass-border)',
                  padding: '12px 18px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  cursor: wiping ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
                className="hover-lift"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
