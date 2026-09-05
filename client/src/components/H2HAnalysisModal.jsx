import React, { useState, useEffect } from 'react';

// Color Palette Constants
const NEON = '#00E5FF';
const GREEN = '#00FF88';
const RED = '#FF3355';
const GOLD = '#FFD700';
const PURPLE = '#A78BFA';
const ORANGE = '#FF9900';

const ENGINE_ICONS = {
  engine_consensus: '🧠',
  engine_poisson: '📊',
  engine_pattern: '📈',
  engine_elo: '⚡',
  engine_odds_value: '💎',
  engine_behaviour: '🔄'
};

const LEAGUE_FLAGS = {
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Spain': '🇪🇸',
  'Italy': '🇮🇹',
  'Germany': '🇩🇪',
  'France': '🇫🇷'
};

export default function H2HAnalysisModal({ match, onClose }) {
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedEngines, setExpandedEngines] = useState({
    engine_consensus: false,
    engine_poisson: false,
    engine_pattern: false,
    engine_elo: false,
    engine_odds_value: false,
    engine_behaviour: false
  });

  const [historyFilter, setHistoryFilter] = useState('ALL'); // 'ALL' | 'VENUE'
  const [historySearch, setHistorySearch] = useState('');

  const homeTeam = match?.home_team || match?.homeTeam || match?.home || '';
  const awayTeam = match?.away_team || match?.awayTeam || match?.away || '';
  const league = match?.league || 'ALL';
  const matchTime = match?.match_time || match?.time || '--:--';
  const odds = match?.odds || {};

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch H2H Analysis
  useEffect(() => {
    if (!homeTeam || !awayTeam) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const oddsParam = encodeURIComponent(JSON.stringify(odds));
    const url = `/api/matches/h2h-analysis?homeTeam=${encodeURIComponent(homeTeam)}&awayTeam=${encodeURIComponent(awayTeam)}&league=${encodeURIComponent(league)}&matchTime=${encodeURIComponent(matchTime)}&odds=${oddsParam}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load H2H analysis`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          if (data.success && data.data) {
            setAnalysisData(data.data);
          } else {
            throw new Error(data.error || 'Failed to retrieve analysis');
          }
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [homeTeam, awayTeam]);


  const toggleEngine = (id) => {
    setExpandedEngines((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleAllEngines = () => {
    if (!analysisData?.engines) return;
    const allExpanded = analysisData.engines.every((e) => expandedEngines[e.id]);
    const newState = {};
    analysisData.engines.forEach((e) => {
      newState[e.id] = !allExpanded;
    });
    setExpandedEngines(newState);
  };

  const consensus = analysisData?.consensus;
  const engines = analysisData?.engines || [];
  const h2hMatches = analysisData?.h2hMatches || [];

  // Filter H2H matches
  const filteredHistory = h2hMatches.filter((m) => {
    if (historyFilter === 'VENUE' && m.home_team !== homeTeam && m.homeTeam !== homeTeam) {
      return false;
    }
    if (historySearch) {
      const q = historySearch.toLowerCase();
      const dateStr = (m.date || m.match_date || '').toLowerCase();
      const scoreStr = (m.score || '').toLowerCase();
      return dateStr.includes(q) || scoreStr.includes(q);
    }
    return true;
  });

  const flag = Object.entries(LEAGUE_FLAGS).find(([k]) => league.includes(k))?.[1] || '⚽';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 5, 15, 0.82)',
        backdropFilter: 'blur(12px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ultra-glass"
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          backgroundColor: 'rgba(10, 14, 26, 0.96)',
          border: '1px solid rgba(0, 229, 255, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 229, 255, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* ── MODAL HEADER ── */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.08) 0%, rgba(167, 139, 250, 0.08) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#FFF' }}>
                  {homeTeam} <span style={{ color: NEON }}>vs</span> {awayTeam}
                </h1>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '0.78rem',
                    color: '#FFF',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <span>{flag}</span>
                  <span>{league}</span>
                </span>
                <span style={{ fontSize: '0.8rem', color: GOLD, fontWeight: 700 }}>
                  ⏱️ {matchTime}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  H2H Historical Deep-Dive & Multi-Engine Predictive Analysis Studio · {h2hMatches.length} Meetings Analyzed
                </p>
                {h2hMatches.length < 5 ? (
                  <span style={{
                    background: 'rgba(255, 153, 0, 0.15)',
                    border: '1px solid rgba(255, 153, 0, 0.45)',
                    color: '#FFB800',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    ⚠️ Low H2H Sample ({h2hMatches.length} &lt; 5)
                  </span>
                ) : (
                  <span style={{
                    background: 'rgba(0, 255, 157, 0.12)',
                    border: '1px solid rgba(0, 255, 157, 0.35)',
                    color: '#00FF9D',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    ✅ Robust Sample ({h2hMatches.length} meetings)
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#FFF',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              fontSize: '1.1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => (e.target.style.background = 'rgba(255, 51, 85, 0.3)')}
            onMouseOut={(e) => (e.target.style.background = 'rgba(255, 255, 255, 0.08)')}
          >
            ✕
          </button>
        </div>

        {/* ── MODAL BODY (SCROLLABLE) ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: NEON }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '16px', animation: 'spin 1.5s linear infinite' }}>⚙️</div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#FFF' }}>
                Executing 6 Specialized Analytical Engines in Parallel...
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px' }}>
                Querying complete Supabase database for historical {homeTeam} vs {awayTeam} clashes & synthesizing consensus
              </p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '24px',
                background: 'rgba(255, 51, 85, 0.1)',
                border: '1px solid rgba(255, 51, 85, 0.3)',
                borderRadius: '12px',
                color: RED,
                textAlign: 'center'
              }}
            >
              ⚠️ {error}
            </div>
          ) : (
            <>
              {/* ═══════════════════════════════════════════════════════════════ */}
              {/* SECTION 1: 🧠 NEURAL CONSENSUS & BEST PICKS DASHBOARD            */}
              {/* ═══════════════════════════════════════════════════════════════ */}
              {consensus && (
                <div
                  className="ultra-glass"
                  style={{
                    padding: '20px 24px',
                    borderRadius: '14px',
                    border: '1px solid rgba(0, 229, 255, 0.4)',
                    background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.1) 0%, rgba(167, 139, 250, 0.08) 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.6rem' }}>🧠</span>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#FFF' }}>
                          Multi-Engine Consensus Recommendation
                        </h2>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Ensemble synthesis across Poisson xG, Empirical Patterns, Elo Rating, Market Value & Streak Fatigue
                        </span>
                      </div>
                    </div>

                    {/* Overall Confidence Meter */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: 'rgba(0, 255, 136, 0.12)',
                        border: '1px solid rgba(0, 255, 136, 0.4)',
                        padding: '6px 14px',
                        borderRadius: '24px'
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 10px ${GREEN}` }} />
                      <span style={{ color: GREEN, fontWeight: 900, fontSize: '0.95rem' }}>
                        {consensus.confidence}% Overall Confidence
                      </span>
                    </div>
                  </div>

                  {/* Low Data Warning Tag if < 5 */}
                  {h2hMatches.length < 5 && (
                    <div
                      style={{
                        background: 'linear-gradient(90deg, rgba(255, 153, 0, 0.15) 0%, rgba(255, 51, 85, 0.08) 100%)',
                        border: '1px solid rgba(255, 153, 0, 0.4)',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                        <span style={{ color: '#FFB800', fontWeight: 800, fontSize: '0.85rem' }}>
                          Limited Data: {h2hMatches.length} historical meeting{h2hMatches.length === 1 ? '' : 's'} found (&lt; 5 threshold)
                        </span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        Multi-Engine models calibrate dynamically using baseline league prior distributions.
                      </span>
                    </div>
                  )}

                  {/* Highlighted Recommendation Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                    {/* Primary Bet */}
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(0, 229, 255, 0.3)',
                        padding: '14px 18px',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: NEON, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🎯 Primary Consensus Pick
                      </span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#FFF' }}>
                        {consensus.primaryBetLabel}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Highest probability across all models ({consensus.confidence}%)
                      </span>
                    </div>

                    {/* Secondary Value Bet */}
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        padding: '14px 18px',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: GOLD, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        💎 Market Value (+EV) Pick
                      </span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#FFF' }}>
                        {consensus.secondaryBet}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Highest statistical edge over bookmaker odds
                      </span>
                    </div>

                    {/* Projected Final Score */}
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(167, 139, 250, 0.3)',
                        padding: '14px 18px',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: PURPLE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ⚽ Projected Exact Score
                      </span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#FFF', letterSpacing: '2px', fontFamily: 'monospace' }}>
                        {consensus.projectedScore}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Peak mode from Poisson bivariate distribution
                      </span>
                    </div>
                  </div>

                  {/* 1X2 Probabilities Bar */}
                  {consensus.probabilities && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                        <span style={{ color: NEON }}>{homeTeam} Win: {consensus.probabilities.homeWin}%</span>
                        <span style={{ color: GOLD }}>Draw: {consensus.probabilities.draw}%</span>
                        <span style={{ color: PURPLE }}>{awayTeam} Win: {consensus.probabilities.awayWin}%</span>
                      </div>
                      <div
                        style={{
                          height: '10px',
                          borderRadius: '5px',
                          overflow: 'hidden',
                          display: 'flex',
                          background: 'rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <div style={{ width: `${consensus.probabilities.homeWin}%`, background: NEON, transition: 'width 0.4s' }} />
                        <div style={{ width: `${consensus.probabilities.draw}%`, background: GOLD, transition: 'width 0.4s' }} />
                        <div style={{ width: `${consensus.probabilities.awayWin}%`, background: PURPLE, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )}

                  {/* Goals & BTTS Probabilities */}
                  {consensus.probabilities && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#FFF' }}>
                        Over 1.5 Goals: <strong style={{ color: GREEN }}>{consensus.probabilities.over15}%</strong>
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#FFF' }}>
                        Over 2.5 Goals: <strong style={{ color: consensus.probabilities.over25 >= 60 ? GREEN : 'var(--text-secondary)' }}>{consensus.probabilities.over25}%</strong>
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#FFF' }}>
                        Both Teams to Score (GG): <strong style={{ color: consensus.probabilities.gg >= 60 ? GREEN : 'var(--text-secondary)' }}>{consensus.probabilities.gg}%</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════ */}
              {/* SECTION 2: 📊 SIDE-BY-SIDE MULTI-ENGINE COMPARISON MATRIX        */}
              {/* ═══════════════════════════════════════════════════════════════ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚡</span>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFF' }}>
                      Multi-Engine Comparison Matrix ({engines.length} Engines Running in Parallel)
                    </h3>
                  </div>
                  <button
                    onClick={toggleAllEngines}
                    style={{
                      background: 'rgba(0, 229, 255, 0.1)',
                      border: '1px solid rgba(0, 229, 255, 0.3)',
                      color: NEON,
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {engines.every((e) => expandedEngines[e.id]) ? '▲ Collapse All Workings' : '▼ Expand All Workings'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                  {engines.map((eng) => {
                    const isExpanded = !!expandedEngines[eng.id];
                    const icon = ENGINE_ICONS[eng.id] || '⚙️';

                    return (
                      <div
                        key={eng.id}
                        className="ultra-glass"
                        style={{
                          borderRadius: '12px',
                          border: isExpanded ? '1px solid rgba(0, 229, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(0, 0, 0, 0.4)',
                          overflow: 'hidden',
                          transition: 'all 0.2s'
                        }}
                      >
                        {/* Engine Card Header (Click to toggle expand/collapse) */}
                        <div
                          onClick={() => toggleEngine(eng.id)}
                          style={{
                            padding: '14px 18px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: isExpanded ? 'rgba(0, 229, 255, 0.06)' : 'transparent',
                            borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.3rem' }}>{icon}</span>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#FFF' }}>
                                {eng.name}
                              </h4>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {eng.tagline}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                background: 'rgba(0, 255, 136, 0.12)',
                                color: GREEN,
                                border: '1px solid rgba(0, 255, 136, 0.3)',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 800
                              }}
                            >
                              {eng.confidence}% Conf.
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>

                        {/* Collapsed Preview */}
                        {!isExpanded && (
                          <div style={{ padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Projected Outcome:</span>
                            <span style={{ color: NEON, fontWeight: 700 }}>{eng.primaryPick || eng.primaryBetLabel || eng.verdict}</span>
                          </div>
                        )}

                        {/* ── EXPANDED ENGINE WORKINGS & CALCULATION BREAKDOWN ── */}
                        {isExpanded && (
                          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem' }}>
                            {/* Verdict Banner */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Engine Verdict:</span>
                              <span style={{ color: NEON, fontWeight: 800, fontSize: '0.9rem' }}>
                                {eng.primaryPick || eng.primaryBetLabel || eng.verdict}
                              </span>
                            </div>

                            {/* Mathematical Formula */}
                            {eng.formula && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.72rem', color: GOLD, fontWeight: 700, textTransform: 'uppercase' }}>
                                  📐 Underlying Mathematical Formula
                                </span>
                                <div
                                  style={{
                                    fontFamily: 'monospace, sans-serif',
                                    background: 'rgba(0, 0, 0, 0.55)',
                                    border: '1px solid rgba(255, 215, 0, 0.2)',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    color: '#FFF',
                                    fontSize: '0.75rem',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  {eng.formula}
                                </div>
                              </div>
                            )}

                            {/* Specific Engine Metrics */}
                            {eng.expectedGoals && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center' }}>
                                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px', borderRadius: '6px' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{homeTeam} xG</span>
                                  <div style={{ fontWeight: 800, color: NEON }}>{eng.expectedGoals.homeXg}</div>
                                </div>
                                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px', borderRadius: '6px' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{awayTeam} xG</span>
                                  <div style={{ fontWeight: 800, color: PURPLE }}>{eng.expectedGoals.awayXg}</div>
                                </div>
                                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px', borderRadius: '6px' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total xG</span>
                                  <div style={{ fontWeight: 800, color: GREEN }}>{eng.expectedGoals.totalXg}</div>
                                </div>
                              </div>
                            )}

                            {eng.ratings && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center' }}>
                                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px', borderRadius: '6px' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{homeTeam} Elo</span>
                                  <div style={{ fontWeight: 800, color: NEON }}>{eng.ratings.homeElo}</div>
                                </div>
                                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px', borderRadius: '6px' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{awayTeam} Elo</span>
                                  <div style={{ fontWeight: 800, color: PURPLE }}>{eng.ratings.awayElo}</div>
                                </div>
                                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px', borderRadius: '6px' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Diff</span>
                                  <div style={{ fontWeight: 800, color: eng.ratings.eloDifference >= 0 ? GREEN : RED }}>
                                    {eng.ratings.eloDifference >= 0 ? `+${eng.ratings.eloDifference}` : eng.ratings.eloDifference}
                                  </div>
                                </div>
                              </div>
                            )}

                            {eng.bestEdge && (
                              <div style={{ background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.3)', padding: '8px 12px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: GOLD, fontWeight: 700 }}>Best Value Edge:</span>
                                <span style={{ color: '#FFF', fontWeight: 800 }}>
                                  {eng.bestEdge.label} @ {eng.bestEdge.odd} ({eng.bestEdge.expectedValueEdge})
                                </span>
                              </div>
                            )}

                            {/* Step-by-Step Calculation Trace */}
                            {eng.calculationSteps && eng.calculationSteps.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                                  🔍 Step-by-Step Calculation Steps
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                  {eng.calculationSteps.map((step, sIdx) => (
                                    <div
                                      key={sIdx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '6px',
                                        color: 'var(--text-secondary)',
                                        fontSize: '0.76rem',
                                        lineHeight: 1.35
                                      }}
                                    >
                                      <span style={{ color: NEON, fontWeight: 800 }}>{sIdx + 1}.</span>
                                      <span>{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════════════ */}
              {/* SECTION 3: 📜 COMPLETE HISTORICAL H2H CLASH LOG (SCROLLABLE)     */}
              {/* ═══════════════════════════════════════════════════════════════ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📜</span>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFF' }}>
                      All Historical Clashes Between Exact Teams ({filteredHistory.length} of {h2hMatches.length})
                    </h3>
                  </div>

                  {/* Filter controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Search score or date..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFF',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        outline: 'none'
                      }}
                    />

                    <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '2px' }}>
                      <button
                        onClick={() => setHistoryFilter('ALL')}
                        style={{
                          background: historyFilter === 'ALL' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                          color: historyFilter === 'ALL' ? NEON : 'var(--text-muted)',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        All H2H
                      </button>
                      <button
                        onClick={() => setHistoryFilter('VENUE')}
                        style={{
                          background: historyFilter === 'VENUE' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                          color: historyFilter === 'VENUE' ? NEON : 'var(--text-muted)',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {homeTeam} at Home Only
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table Container */}
                <div
                  className="ultra-glass"
                  style={{
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    maxHeight: '380px',
                    overflowY: 'auto'
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 14px' }}>Date & Time</th>
                        <th style={{ padding: '10px 14px' }}>Matchup (Home vs Away)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>FT Score</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Outcome</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Total Goals</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Markets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                            No historical clashes matching filter.
                          </td>
                        </tr>
                      ) : (
                        filteredHistory.map((m, idx) => {
                          const mHome = m.home_team || m.homeTeam;
                          const mAway = m.away_team || m.awayTeam;
                          const scoreStr = m.score || '0-0';
                          const sep = scoreStr.includes(':') ? ':' : '-';
                          const [hGoals, aGoals] = scoreStr.split(sep).map(Number);
                          const total = (hGoals || 0) + (aGoals || 0);

                          let outcomeBadge = 'DRAW';
                          let outcomeColor = GOLD;
                          if (hGoals > aGoals) {
                            outcomeBadge = `${mHome} WIN`;
                            outcomeColor = mHome === homeTeam ? NEON : PURPLE;
                          } else if (aGoals > hGoals) {
                            outcomeBadge = `${mAway} WIN`;
                            outcomeColor = mAway === homeTeam ? NEON : PURPLE;
                          }

                          const isOver15 = total > 1.5;
                          const isOver25 = total > 2.5;
                          const isGG = (hGoals > 0 && aGoals > 0);

                          return (
                            <tr
                              key={m.id || idx}
                              style={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                background: idx % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
                                transition: 'background 0.15s'
                              }}
                              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(0, 229, 255, 0.06)')}
                              onMouseOut={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent')}
                            >
                              <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                                {m.date || m.match_date || '--'} · {m.time || m.match_time || '--'}
                              </td>

                              <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                                <span style={{ color: mHome === homeTeam ? NEON : '#FFF' }}>{mHome}</span>
                                <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>vs</span>
                                <span style={{ color: mAway === awayTeam ? PURPLE : '#FFF' }}>{mAway}</span>
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 900, fontFamily: 'monospace', fontSize: '0.95rem', color: '#FFF' }}>
                                {scoreStr}
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <span
                                  style={{
                                    background: `${outcomeColor}15`,
                                    color: outcomeColor,
                                    border: `1px solid ${outcomeColor}40`,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800
                                  }}
                                >
                                  {outcomeBadge}
                                </span>
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: total >= 3 ? GREEN : '#FFF' }}>
                                {total} Goals
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                  {isOver15 && (
                                    <span style={{ background: 'rgba(0, 255, 136, 0.1)', color: GREEN, padding: '1px 5px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 700 }}>
                                      O1.5
                                    </span>
                                  )}
                                  {isOver25 && (
                                    <span style={{ background: 'rgba(0, 229, 255, 0.1)', color: NEON, padding: '1px 5px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 700 }}>
                                      O2.5
                                    </span>
                                  )}
                                  {isGG ? (
                                    <span style={{ background: 'rgba(255, 215, 0, 0.1)', color: GOLD, padding: '1px 5px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 700 }}>
                                      GG
                                    </span>
                                  ) : (
                                    <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', padding: '1px 5px', borderRadius: '3px', fontSize: '0.68rem' }}>
                                      NG
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
