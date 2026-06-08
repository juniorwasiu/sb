import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';

export default function PredictionsDashboard() {
  const [selectedLeague, setSelectedLeague] = useState('England League');
  const [activeView, setActiveView] = useState('live'); // 'live' | 'history'
  
  // Predictor states
  const [predicting, setPredicting] = useState(false);
  const [predictionResults, setPredictionResults] = useState(null);
  const [predictionError, setPredictionError] = useState(null);
  const predictionsRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  // Sub-tabs states
  const [liveSubTab, setLiveSubTab] = useState('all'); // 'all' | 'best' | 'singles' | 'bestsingle'
  const [historySubTab, setHistorySubTab] = useState('all'); // 'all' | 'best' | 'singles' | 'bestsingle'

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

  // Helper to filter predictions dynamically based on selected sub-tab
  const getFilteredPredictions = (predictions, subTab) => {
    if (!predictions || predictions.length === 0) return [];
    
    if (subTab === 'all') {
      return predictions;
    }
    if (subTab === 'best') {
      return predictions.filter(p => p.confidence >= 75);
    }
    if (subTab === 'singles') {
      return predictions; // Render handles single tip display
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
    { id: 'England League',   label: 'England',   emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'Spain League',     label: 'Spain',     emoji: '🇪🇸' },
    { id: 'Italy League',     label: 'Italy',     emoji: '🇮🇹' },
    { id: 'Germany League',   label: 'Germany',   emoji: '🇩🇪' },
    { id: 'France League',     label: 'France',    emoji: '🇫🇷' }
  ];

  // Fetch prediction history logs
  const fetchPredictionsHistory = async (league = selectedLeague) => {
    setLoadingHistory(true);
    setHistoryError(null);
    console.log(`[PredictionsDashboard] [DEBUG] 📜 Querying prediction history logs for league: "${league}"`);
    
    try {
      const response = await fetch(`/api/local-vfootball/predictions-history?league=${encodeURIComponent(league)}`);
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
  };

  // Fetch history when view is toggled to history or league changes
  useEffect(() => {
    if (activeView === 'history') {
      fetchPredictionsHistory(selectedLeague);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, selectedLeague]);

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
    const isSingleView = subTab === 'singles' || subTab === 'bestsingle';
    const bestTip = isSingleView ? getBestSingleTip(pred) : null;
    
    return (
      <div 
        key={`${cardLeague}_${pred.position}`} 
        className="glass-panel hover-lift" 
        style={{ 
          padding: '16px', 
          border: '1px solid rgba(255,255,255,0.06)',
          borderLeft: `4px solid ${bestTip?.color || pred.color || 'var(--accent-neon)'}`,
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
              background: `${bestTip?.color || pred.color || 'var(--accent-neon)'}15`, 
              color: (bestTip?.color || pred.color || 'var(--accent-neon)'), 
              width: '24px', 
              height: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '50%', 
              fontWeight: 800, 
              border: `1px solid ${bestTip?.color || pred.color || 'var(--accent-neon)'}30`,
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
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Confidence:</span>
            <strong style={{ 
              fontSize: '0.85rem', 
              color: pred.confidence >= 75 ? '#00FF88' : pred.confidence >= 55 ? '#FFD700' : '#A78BFA'
            }}>{pred.confidence}%</strong>
          </div>
        </div>

        {/* Match Name */}
        <strong style={{ color: 'white', fontSize: '0.94rem' }}>
          {pred.match}
        </strong>

        {/* Badges */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isSingleView && bestTip ? (
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
              <span style={{ textTransform: 'uppercase', fontSize: '0.62rem', opacity: 0.8, letterSpacing: '0.05em' }}>🎯 BEST SINGLE TIP ({bestTip.market}):</span>
              <span>{bestTip.prediction} ({bestTip.prob}%)</span>
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
      </div>
    );
  };

  return (
    <div className="pattern-engine-root" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* HEADER SECTION */}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>🧠 Positional Trace Dashboard</span>
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
                    <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
                      Generated predictions for round: <span className="glow-text">{predictionResults.league}</span>
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      AI Provider: <strong style={{ color: 'var(--accent-purple)' }}>{predictionResults.provider?.toUpperCase()}</strong> • Predictions mapped to alphabetical visual positions.
                    </span>
                  </div>

                  <button
                    onClick={handleCaptureScreenshot}
                    disabled={capturing}
                    style={{
                      background: 'rgba(167, 139, 250, 0.1)',
                      border: '1px solid rgba(167, 139, 250, 0.3)',
                      color: 'var(--accent-purple)',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {capturing ? '📸 Saving...' : '📸 Save Screenshot (PNG)'}
                  </button>
                </div>

                {/* Sub-tabs selector for Live Predictor */}
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.01)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'As Predicted', emoji: '📋' },
                    { id: 'best', label: 'Best Picks', emoji: '⭐️' },
                    { id: 'singles', label: 'Single Tip / Match', emoji: '🎯' },
                    { id: 'bestsingle', label: 'Best Single Pick', emoji: '🔥' }
                  ].map(sub => {
                    const isSelected = liveSubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setLiveSubTab(sub.id)}
                        style={{
                          background: isSelected ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                          color: isSelected ? 'var(--accent-neon)' : 'var(--text-secondary)',
                          border: isSelected ? '1px solid rgba(0, 229, 255, 0.2)' : '1px solid transparent',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>{sub.emoji}</span>
                        <span>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>

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

            {/* Sub-tabs selector for History Log */}
            {!loadingHistory && !historyError && historyList.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.01)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'As Predicted', emoji: '📋' },
                  { id: 'best', label: 'Best Picks', emoji: '⭐️' },
                  { id: 'singles', label: 'Single Tip / Match', emoji: '🎯' },
                  { id: 'bestsingle', label: 'Best Single Pick', emoji: '🔥' }
                ].map(sub => {
                  const isSelected = historySubTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setHistorySubTab(sub.id)}
                      style={{
                        background: isSelected ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                        color: isSelected ? 'var(--accent-neon)' : 'var(--text-secondary)',
                        border: isSelected ? '1px solid rgba(0, 229, 255, 0.2)' : '1px solid transparent',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{sub.emoji}</span>
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
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
                      let correctSingleCount = 0;
                      
                      filteredRoundPreds.forEach(p => {
                        if (p.resolved) {
                          if (p.outcomeCorrect) correctOutcome++;
                          if (p.bttsCorrect) correctBtts++;
                          if (p.over15Correct) correctOver15++;
                          if (p.over25Correct) correctOver25++;
                          
                          const bestTip = getBestSingleTip(p);
                          if (bestTip) {
                            let isCorrect = false;
                            if (bestTip.market === 'Outcome') isCorrect = p.outcomeCorrect;
                            else if (bestTip.market === 'BTTS') isCorrect = p.bttsCorrect;
                            else if (bestTip.market === 'O/U 1.5') isCorrect = p.over15Correct;
                            else if (bestTip.market === 'O/U 2.5') isCorrect = p.over25Correct;
                            if (isCorrect) correctSingleCount++;
                          }
                        }
                      });

                      const isSingleView = historySubTab === 'singles' || historySubTab === 'bestsingle';
                      const outcomePct = totalResolved > 0 ? Math.round((correctOutcome / totalResolved) * 100) : null;
                      const bttsPct = totalResolved > 0 ? Math.round((correctBtts / totalResolved) * 100) : null;
                      const over15Pct = totalResolved > 0 ? Math.round((correctOver15 / totalResolved) * 100) : null;
                      const over25Pct = totalResolved > 0 ? Math.round((correctOver25 / totalResolved) * 100) : null;
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
                                isSingleView ? (
                                  <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Single Tip Acc</span>
                                    <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctSingleCount}/{totalResolved} ({singlePct}%)</strong>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', textTransform: 'uppercase' }}>Outcome</span>
                                      <strong style={{ color: 'var(--accent-success)', fontSize: '0.85rem' }}>{correctOutcome}/{totalResolved} ({outcomePct}%)</strong>
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
                              ) : (
                                <div style={{ background: 'rgba(255, 215, 0, 0.06)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.74rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                                  ⏳ Pending Match Completion
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Predictions cards list */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                            {filteredRoundPreds.map(pred => {
                              const bestTip = isSingleView ? getBestSingleTip(pred) : null;
                              
                              let isBestTipCorrect = false;
                              if (bestTip) {
                                if (bestTip.market === 'Outcome') isBestTipCorrect = pred.outcomeCorrect;
                                else if (bestTip.market === 'BTTS') isBestTipCorrect = pred.bttsCorrect;
                                else if (bestTip.market === 'O/U 1.5') isBestTipCorrect = pred.over15Correct;
                                else if (bestTip.market === 'O/U 2.5') isBestTipCorrect = pred.over25Correct;
                              }

                              return (
                                <div 
                                  key={pred.position}
                                  className="glass-panel"
                                  style={{
                                    padding: '12px 14px',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.03)',
                                    borderLeft: isSingleView && bestTip && pred.resolved
                                      ? `4px solid ${isBestTipCorrect ? 'var(--accent-success)' : 'var(--accent-live)'}`
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
                                  
                                  {isSingleView && bestTip && (
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
                                      🎯 Single Tip ({bestTip.market}): {bestTip.prediction} ({bestTip.prob}%)
                                    </div>
                                  )}

                                  {/* Verifications */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    
                                    {/* 1. OUTCOME VERIFICATION */}
                                    {(!isSingleView || bestTip?.market === 'Outcome') && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>Winner: </span>
                                          <strong style={{ color: getOutcomeColor(pred.predictedOutcome) }}>{pred.predictedOutcome}{pred.predictedOutcomeProb !== undefined ? ` (${pred.predictedOutcomeProb}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOutcome}</span>
                                            <span style={{ 
                                              color: pred.outcomeCorrect ? 'var(--accent-success)' : 'var(--accent-live)', 
                                              fontWeight: 'bold',
                                              background: pred.outcomeCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)',
                                              padding: '1px 4px',
                                              borderRadius: '3px',
                                              fontSize: '0.65rem'
                                            }}>
                                              {pred.outcomeCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 2. BTTS VERIFICATION */}
                                    {(!isSingleView || bestTip?.market === 'BTTS') && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>BTTS: </span>
                                          <strong style={{ color: pred.predictedBtts === 'GG' ? 'var(--accent-success)' : 'white' }}>{pred.predictedBtts}{pred.predictedBttsProb !== undefined ? ` (${pred.predictedBttsProb}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualBtts}</span>
                                            <span style={{ 
                                              color: pred.bttsCorrect ? 'var(--accent-success)' : 'var(--accent-live)', 
                                              fontWeight: 'bold',
                                              background: pred.bttsCorrect ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)',
                                              padding: '1px 4px',
                                              borderRadius: '3px',
                                              fontSize: '0.65rem'
                                            }}>
                                              {pred.bttsCorrect ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 3. O/U 1.5 VERIFICATION */}
                                    {(!isSingleView || bestTip?.market === 'O/U 1.5') && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>O/U 1.5: </span>
                                          <strong style={{ color: pred.predictedOver15 === 'Over' ? 'var(--accent-neon)' : 'white' }}>{pred.predictedOver15}{pred.predictedOver15Prob !== undefined ? ` (${pred.predictedOver15Prob}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOver15}</span>
                                            <span style={{ 
                                              color: pred.over15Correct ? 'var(--accent-success)' : 'var(--accent-live)', 
                                              fontWeight: 'bold',
                                              background: pred.over15Correct ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)',
                                              padding: '1px 4px',
                                              borderRadius: '3px',
                                              fontSize: '0.65rem'
                                            }}>
                                              {pred.over15Correct ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: 'var(--accent-gold)', fontSize: '0.65rem' }}>Pending</span>
                                        )}
                                      </div>
                                    )}

                                    {/* 4. O/U 2.5 VERIFICATION */}
                                    {(!isSingleView || bestTip?.market === 'O/U 2.5') && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>O/U 2.5: </span>
                                          <strong style={{ color: pred.predictedOver25 === 'Over' ? 'var(--accent-purple)' : 'white' }}>{pred.predictedOver25}{pred.predictedOver25Prob !== undefined ? ` (${pred.predictedOver25Prob}%)` : ''}</strong>
                                        </div>
                                        {pred.resolved ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Act: {pred.actualOver25}</span>
                                            <span style={{ 
                                              color: pred.over25Correct ? 'var(--accent-success)' : 'var(--accent-live)', 
                                              fontWeight: 'bold',
                                              background: pred.over25Correct ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 85, 0.08)',
                                              padding: '1px 4px',
                                              borderRadius: '3px',
                                              fontSize: '0.65rem'
                                            }}>
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
                                    🧠 AI: "{pred.reasoning}"
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
