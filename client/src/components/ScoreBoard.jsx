import React, { useState, useEffect, useRef, useCallback } from 'react';
import AIProviderSelector from './AIProviderSelector';
import html2canvas from 'html2canvas';

// ─────────────────────────────────────────────────────────────────────────────
// ScoreBoard — Live vFootball Upcoming Fixtures
//
// Props (all provided by App.jsx's useLiveScores SSE hook):
//   scores      — array of { league, matches: [{ time, code, home, away, score }] }
//   status      — 'loading' | 'initializing' | 'live' | 'error'
//   lastUpdated — Date of last successful push
//   pollError   — string error message (when status === 'error')
//   onRefresh   — callback to force a manual data refresh
//
// Data flow:
//   Server scraper (scraper.js) → /api/live-stream (SSE push) → App.jsx useLiveScores()
//   → match.score format: "1(1.50) X(3.20) 2(5.00)"  (live 1X2 odds — display only)
//
// ⚠️ IMPORTANT: The odds displayed here are REFERENCE ONLY.
//   The AI prediction engine does NOT use odds as a predictor.
//   AI predictions are based EXCLUSIVELY on:
//     • Historical home/away win % from Database (via native_scraper.js real results)
//     • Head-to-Head venue bias from historical data
//     • League-wide home/away baseline statistics
// ─────────────────────────────────────────────────────────────────────────────

const NEON   = '#00E5FF';
const GREEN  = '#00FF88';
const GOLD   = '#FFD700';
const PURPLE = '#A78BFA';
const RED    = '#FF3355';
const ORANGE = '#FF6B35';

// ── Parse "1(1.50) X(3.20) 2(5.00)" → { h: '1.50', x: '3.20', a: '5.00' }
// Regex is permissive: allows optional spaces around brackets e.g. "1 (1.50)"
function parseOdds(scoreStr = '') {
  const m = scoreStr.match(/1\s*\(([0-9.]+)\)\s*X\s*\(([0-9.]+)\)\s*2\s*\(([0-9.]+)\)/i);
  if (m) return { h: m[1], x: m[2], a: m[3] };
  return null;
}

// ── Colour + accessibility label for each odds value
// lowest = favourite (green), highest = underdog (red), middle = draw (gold)
function oddsInfo(val, allVals) {
  if (!allVals || allVals.length < 2) return { color: 'white', label: '' };
  const nums = allVals.map(Number).filter(n => !isNaN(n));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const v = Number(val);
  if (v === min) return { color: GREEN,  label: 'FAV' };
  if (v === max) return { color: RED,    label: 'DOG' };
  return           { color: GOLD,    label: 'DRAW' };
}

// ── Human-readable "updated N seconds ago"
function useTimeAgo(date) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!date) return;
    const update = () => {
      const diff = Math.round((Date.now() - date.getTime()) / 1000);
      if (diff < 5)   setLabel('just now');
      else if (diff < 60) setLabel(`${diff}s ago`);
      else setLabel(`${Math.floor(diff / 60)}m ago`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [date]);
  return label;
}

// ── Single match row with odds-change flash animation
function MatchRow({ match, behaviourSignals = [] }) {
  const odds = parseOdds(match.score);
  const allOdds = odds ? [odds.h, odds.x, odds.a] : [];

  // Track previous odds to detect changes and flash
  const prevOddsRef = useRef(null);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    if (!odds) return;
    const oddsStr = `${odds.h}-${odds.x}-${odds.a}`;
    if (prevOddsRef.current && prevOddsRef.current !== oddsStr) {
      console.log(`[ScoreBoard] 🔔 Odds changed for ${match.home} vs ${match.away}: ${prevOddsRef.current} → ${oddsStr}`);
      // eslint-disable-next-line
      setFlashKey(k => k + 1); // triggers CSS keyframe re-run
    }
    prevOddsRef.current = oddsStr;
  }, [odds?.h, odds?.x, odds?.a]); // eslint-disable-line react-hooks/exhaustive-deps

  // Extract signals for this fixture if they exist
  const fixtureName = `${match.home} vs ${match.away}`;
  const mySignals = behaviourSignals?.find(s => s.fixture === fixtureName)?.signals || [];

  return (
    <div
      key={flashKey}
      className="glass-panel match-row-live"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        border: '1px solid rgba(255,255,255,0.06)',
        transition: 'border-color 0.2s ease, background 0.2s ease',
        cursor: 'default',
        animation: flashKey > 0 ? 'oddsFlash 0.6s ease' : 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${NEON}30`;
        e.currentTarget.style.background  = 'rgba(0,229,255,0.03)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.background  = '';
      }}
    >
      <div style={{
          display: 'grid',
          gridTemplateColumns: '54px 1fr auto 1fr 54px',
          padding: '12px 16px',
          alignItems: 'center',
      }}>
        {/* Time */}
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: NEON, fontFamily: 'monospace' }}>
          {match.time}
        </span>

        {/* Home team */}
        <span style={{
          fontSize: '0.9rem', fontWeight: 600, color: 'white',
          textAlign: 'right', paddingRight: 12,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {match.home}
        </span>

        {/* Odds pill */}
        {odds ? (
          <div style={{
            display: 'flex', gap: 4, alignItems: 'center',
            background: 'rgba(0,0,0,0.3)', borderRadius: 8,
            padding: '5px 10px', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {[
              { label: '1', val: odds.h },
              { label: 'X', val: odds.x },
              { label: '2', val: odds.a },
            ].map(({ label, val }, oi) => {
              const info = oddsInfo(val, allOdds);
              return (
                <React.Fragment key={label}>
                  {oi > 0 && <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>·</span>}
                  <div style={{ textAlign: 'center', minWidth: 38 }}>
                    {/* Outcome label (1 / X / 2) */}
                    <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', marginBottom: 1 }}>{label}</div>
                    {/* Odds value — coloured */}
                    <div style={{
                      fontSize: '0.82rem', fontWeight: 800, fontFamily: 'monospace',
                      color: info.color,
                    }}>{val}</div>
                    {/* Accessibility label: FAV / DRAW / DOG */}
                    <div style={{
                      fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.04em',
                      color: info.color, opacity: 0.7, marginTop: 1,
                    }}>{info.label}</div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {match.score || '—'}
          </span>
        )}

        {/* Away team */}
        <span style={{
          fontSize: '0.9rem', fontWeight: 600, color: 'white',
          paddingLeft: 12,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {match.away}
        </span>

        {/* Game code */}
        <span style={{
          fontSize: '0.65rem', color: 'var(--text-muted)',
          textAlign: 'right', fontFamily: 'monospace',
        }}>
          #{match.code}
        </span>
      </div>

      {mySignals.length > 0 && (
        <div style={{ borderTop: '1px dashed rgba(247, 148, 29, 0.3)', padding: '6px 16px', background: 'rgba(247, 148, 29, 0.05)' }}>
          {mySignals.map((sig, sIdx) => (
            <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#f7941d' }}>
              <span className="pulse-dot" style={{ backgroundColor: '#f7941d', width: 6, height: 6 }}></span>
              <span style={{ fontWeight: 800 }}>{sig.patternType.replace(/_/g, ' ')} ({sig.riskLevel})</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>— {sig.message.split('—')[0]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Prediction panel
function AIPredictionsPanel({ isPredicting, predictError, livePredictions, aiLog, aiLogEndRef, onForcePredict }) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const panelRef = React.useRef(null);
  const [isCapturing, setIsCapturing] = React.useState(false);

  const takeScreenshot = async () => {
    if (!panelRef.current) return;
    setIsCapturing(true);

    const gridEl = panelRef.current.querySelector('.matches-grid');
    if (gridEl) {
        gridEl.style.maxHeight = 'none';
        gridEl.style.overflowY = 'visible';
    }

    // Yield control briefly so browser can reflow the DOM without height restrictions
    await new Promise(res => setTimeout(res, 50));

    try {
      const canvas = await html2canvas(panelRef.current, { backgroundColor: '#0a0a0c', scale: 2, useCORS: true });
      const tag = document.createElement('a');
      tag.href = canvas.toDataURL('image/png');
      tag.download = `AI_Live_Insights_${new Date().toISOString().slice(0,10)}.png`;
      document.body.appendChild(tag);
      tag.click();
      document.body.removeChild(tag);
    } catch (err) {
      console.error('Screenshot failed:', err);
    } finally {
      if (gridEl) {
        gridEl.style.maxHeight = '500px';
        gridEl.style.overflowY = 'auto';
      }
      setIsCapturing(false);
    }
  };

  const actionColor = {
    start: PURPLE, fetching: NEON, tool: GOLD,
    analyzing: ORANGE, success: GREEN, error: RED, info: '#94a3b8',
  };

  if (!isPredicting && !livePredictions && !predictError) return null;

  const fullscreenStyles = isFullscreen ? {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
    background: 'rgba(10, 10, 12, 0.98)',
    overflowY: 'auto',
    backdropFilter: 'blur(10px)',
    margin: 0,
    borderRadius: 0,
    padding: '40px 5%'
  } : {};

  return (
    <div ref={panelRef} className="glass-panel animate-fade-up" style={{
      padding: '20px 24px',
      border: `1px solid ${GREEN}40`,
      background: `linear-gradient(135deg, rgba(0,255,136,0.06) 0%, transparent 100%)`,
      marginBottom: 8,
      transition: 'all 0.3s ease',
      ...fullscreenStyles
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            className={isPredicting ? 'spinner' : 'pulse-dot'}
            style={!isPredicting
              ? { backgroundColor: GREEN, boxShadow: `0 0 10px ${GREEN}` }
              : { width: 14, height: 14, borderWidth: 2, borderColor: GREEN, borderTopColor: 'transparent' }
            }
          />
          <span style={{ fontSize: '0.9rem', color: GREEN, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {isPredicting ? 'AI Analyzing Rotation...' : 'Live AI Insights'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {!isPredicting && onForcePredict && (
            <button onClick={onForcePredict} style={{
               background: 'rgba(0, 255, 136, 0.1)',
               border: `1px solid ${GREEN}80`,
               color: GREEN,
               padding: '6px 14px',
               borderRadius: '6px',
               fontSize: '0.75rem',
               fontWeight: 'bold',
               cursor: 'pointer',
               transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)'}
            >
              🤖 Force Make Analysis
            </button>
          )}
          <button 
            onClick={takeScreenshot} 
            disabled={isCapturing}
            style={{
               background: 'rgba(255, 215, 0, 0.1)',
               border: `1px solid ${GOLD}80`,
               color: GOLD,
               padding: '6px 12px',
               borderRadius: '6px',
               fontSize: '0.75rem',
               fontWeight: 'bold',
               cursor: isCapturing ? 'wait' : 'pointer',
               transition: 'all 0.2s',
               opacity: isCapturing ? 0.6 : 1
            }}
            onMouseEnter={e => !isCapturing && (e.currentTarget.style.background = 'rgba(255, 215, 0, 0.2)')}
            onMouseLeave={e => !isCapturing && (e.currentTarget.style.background = 'rgba(255, 215, 0, 0.1)')}
          >
            {isCapturing ? '📸 Capturing...' : '📸 Screenshot'}
          </button>
          
          <button  
            onClick={() => setIsFullscreen(!isFullscreen)} 
            style={{
               background: 'rgba(255, 255, 255, 0.05)',
               border: `1px solid rgba(255, 255, 255, 0.15)`,
               color: 'white',
               padding: '6px 12px',
               borderRadius: '6px',
               fontSize: '0.75rem',
               fontWeight: 'bold',
               cursor: 'pointer',
               transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            {isFullscreen ? '↙️ Collapse' : '↗️ Fullscreen'}
          </button>
        </div>
      </div>

      {/* Real-time pipeline terminal */}
      {isPredicting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            Fetching home/away form stats and H2H history from Database. Venue-aware predictions appear shortly...
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.45)', borderRadius: 10,
            border: '1px solid rgba(0,255,136,0.15)', overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 14px', background: 'rgba(0,255,136,0.06)', borderBottom: '1px solid rgba(0,255,136,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, boxShadow: `0 0 8px ${GREEN}`, animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: '0.68rem', color: GREEN, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Pipeline — Live Activity</span>
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {aiLog.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontStyle: 'italic' }}>Waiting for AI pipeline...</span>
              ) : (
                aiLog.map((log, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: '0.62rem', flexShrink: 0, marginTop: 2 }}>{log.displayTime}</span>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: actionColor[log.action] || '#fff', flexShrink: 0, marginTop: 4 }} />
                    <span style={{ color: actionColor[log.action] || 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={aiLogEndRef} />
            </div>
          </div>
        </div>
      )}

      {predictError && !isPredicting && (
        <div style={{ color: RED, fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(255,51,85,0.08)', borderRadius: 6 }}>
          ⚠️ Failed to generate predictions: {predictError}
        </div>
      )}

      {livePredictions?.upcoming_matches && !isPredicting && (
        <div className="matches-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', maxHeight: '500px', overflowY: 'auto' }}>
          {livePredictions.upcoming_matches.map((match, idx) => {
            // match_winner is now "Home", "Away", or "Draw" (not a team name)
            const winnerLabel = match.match_winner || match.winner_team_name || '—';
            const venueConf   = match.venue_confidence || null;
            const winnerTeam  = match.winner_team_name || match.match_winner || '—';
            const winnerColor = match.match_winner === 'Home' ? GREEN
                                : match.match_winner === 'Away' ? ORANGE
                                : GOLD;  // Draw
            const confColor   = venueConf === 'High' ? GREEN : venueConf === 'Medium' ? GOLD : RED;

            return (
              <div key={idx} style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: 8, border: `1px solid ${winnerColor}30` }}>
                {/* Fixture header with game time badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 900, textTransform: 'uppercase', flex: 1, marginRight: 8 }}>{match.fixture}</div>
                  {match.game_time && (
                    <div style={{
                      background: `rgba(0,229,255,0.12)`,
                      border: `1px solid ${NEON}50`,
                      color: NEON,
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      padding: '3px 8px',
                      borderRadius: 20,
                      whiteSpace: 'nowrap',
                      letterSpacing: '0.05em',
                    }}>⏱ {match.game_time}</div>
                  )}
                </div>

                {/* Match Winner + Venue Confidence row */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: 6, border: `1px solid ${winnerColor}30` }}>
                    <div style={{ fontSize: '0.6rem', color: winnerColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Match Winner</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: '1rem', color: winnerColor, fontWeight: 900, fontFamily: 'monospace' }}>{match.match_winner || '—'}</span>
                      {winnerTeam !== match.match_winner && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>({winnerTeam})</span>}
                    </div>
                  </div>
                  {venueConf && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: 6, textAlign: 'center', border: `1px solid ${confColor}30` }}>
                      <div style={{ fontSize: '0.6rem', color: confColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Venue Edge</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: confColor }}>{venueConf}</div>
                    </div>
                  )}
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.6rem', color: GOLD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Score</div>
                    <div style={{ fontSize: '1rem', color: 'white', fontWeight: 700, fontFamily: 'monospace' }}>{match.exact_score}</div>
                  </div>
                </div>

                {/* Behaviour Pattern Signals */}
                {livePredictions.behaviourSignals && (() => {
                  const bData = livePredictions.behaviourSignals.find(s => s.fixture === match.fixture);
                  if (!bData || bData.signals.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {bData.signals.map((sig, sIdx) => (
                        <div key={sIdx} style={{ background: 'rgba(247, 148, 29, 0.1)', border: '1px solid rgba(247, 148, 29, 0.3)', borderLeft: '3px solid #f7941d', borderRadius: 4, padding: '8px 12px', fontSize: '0.75rem', color: '#f7941d' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontWeight: 800 }}>⚠️ {sig.patternType.replace(/_/g, ' ')}</span>
                          </div>
                          <div style={{ color: 'white', lineHeight: 1.4 }}>{sig.message}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>O1.5</div>
                    <div style={{ fontSize: '0.85rem', color: match.over_1_5?.toLowerCase().includes('yes') ? GREEN : RED, fontWeight: 700 }}>{match.over_1_5}</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>O2.5</div>
                    <div style={{ fontSize: '0.85rem', color: match.over_2_5?.toLowerCase().includes('yes') ? GREEN : RED, fontWeight: 700 }}>{match.over_2_5}</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>GG</div>
                    <div style={{ fontSize: '0.85rem', color: match.gg?.toLowerCase().includes('yes') ? GREEN : RED, fontWeight: 700 }}>{match.gg}</div>
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'rgba(167,139,250,0.1)', borderRadius: 6, fontSize: '0.75rem', color: '#e2e8f0', lineHeight: 1.5, borderLeft: `2px solid ${PURPLE}` }}>
                  <strong style={{ color: PURPLE, display: 'block', fontSize: '0.65rem', marginBottom: 2 }}>REASONING</strong>
                  {match.prediction_reasoning}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Specific Match Predictor (Single Match AI Insights)
function UpcomingMatchPredictorPanel({ leagueGroups }) {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [aiProvider, setAiProvider] = useState('deepseek'); // AI engine selection

  // Flatten matches for the dropdown
  const upcomingMatches = React.useMemo(() => {
    return leagueGroups.flatMap(lg => 
      (lg.matches || []).map(m => ({ ...m, league: lg.league }))
    );
  }, [leagueGroups]);

  // Keep selected match in sync if it updates
  useEffect(() => {
    if (selectedMatch) {
      const stillExists = upcomingMatches.find(m => m.code === selectedMatch.code);
      if (!stillExists) setSelectedMatch(null);
    }
  }, [upcomingMatches]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePredict = async (match) => {
    if (!match) return;
    setIsLoading(true);
    setPrediction(null);
    setErrorMsg(null);
    console.log(`[Database Index Debug] Starting AI specific match prediction for ${match.home} vs ${match.away} (${match.league})`);

    try {
      const res = await fetch('/api/vfootball/predict-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: match.league, homeTeam: match.home, awayTeam: match.away, provider: aiProvider })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON response from server: ${text.slice(0,100)}`); }
      
      if (data.success && data.prediction) {
        setPrediction({ ...data.prediction, behaviourSignals: data.behaviourSignals });
        console.log(`[Database Index Debug] Match prediction successful! H2H analyzed: ${data.h2hAnalyzed}`);
        console.log(`[Database Index Debug] Details:`, data.prediction);
      } else {
        throw new Error(data.error || 'Failed to generate prediction');
      }
    } catch (err) {
      console.error(`[Database Index Debug/Error Details] Specific match prediction failed:`, err);
      setErrorMsg(`⚠️ Error predicting match: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!upcomingMatches.length) return null;

  return (
    <div className="glass-panel animate-fade-up" style={{
      padding: '20px 24px',
      border: `1px solid ${ORANGE}40`,
      background: `linear-gradient(135deg, rgba(255,107,53,0.06) 0%, transparent 100%)`,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: '1.2rem' }}>🎯</span>
        <span style={{ fontSize: '0.9rem', color: ORANGE, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Specific Match AI Predictor
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select 
          style={{
            background: 'rgba(0,0,0,0.5)', border: `1px solid rgba(255,255,255,0.1)`, 
            color: 'white', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', flex: 1, minWidth: 200, outline: 'none'
          }}
          value={selectedMatch?.code || ''}
          onChange={(e) => {
            const m = upcomingMatches.find(x => x.code === e.target.value);
            setSelectedMatch(m);
            setPrediction(null);
            setErrorMsg(null);
          }}
        >
          <option value="">-- Select an upcoming live match --</option>
          {upcomingMatches.map((m) => (
            <option key={m.code} value={m.code}>{m.time} | {m.home} vs {m.away} ({m.league})</option>
          ))}
        </select>
        <button
          onClick={() => handlePredict(selectedMatch)}
          disabled={!selectedMatch || isLoading}
          style={{
            background: isLoading || !selectedMatch ? 'transparent' : 'rgba(255,107,53,0.15)',
            border: `1px solid ${isLoading || !selectedMatch ? 'rgba(255,255,255,0.1)' : ORANGE}`,
            color: isLoading || !selectedMatch ? 'var(--text-muted)' : ORANGE,
            padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: isLoading || !selectedMatch ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8
          }}
        >
        {isLoading ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} /> : '🧠 Predict'}
        </button>
      </div>

      {/* Compact AI engine selector — shown right above the prediction result */}
      <div style={{ marginBottom: 10 }}>
        <AIProviderSelector
          selectedProvider={aiProvider}
          onSelect={setAiProvider}
          compact
          disabledProviders={isLoading ? ['deepseek', 'gemini', 'claude'] : []}
        />
      </div>

      {errorMsg && (
        <div style={{ color: RED, fontSize: '0.85rem', padding: '10px 14px', background: 'rgba(255,51,85,0.08)', borderRadius: 6, marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}

      {prediction && !isLoading && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.05)', animation: 'fadeUp 0.4s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white' }}>{selectedMatch.home} vs {selectedMatch.away}</span>
            <span style={{ fontSize: '0.75rem', color: NEON, fontWeight: 700, background: 'rgba(0,229,255,0.1)', padding: '4px 10px', borderRadius: 12 }}>
              Confidence: {prediction.confidenceScore}%
            </span>
          </div>

          <div style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.6, marginBottom: 14 }}>
            {prediction.predictionText}
          </div>

          {/* match_winner: now "Home" / "Away" / "Draw" with venue reasoning */}
          {prediction.match_winner && (
            <div style={{
              background: prediction.match_winner === 'Home' ? 'rgba(0,255,136,0.08)'
                        : prediction.match_winner === 'Away' ? 'rgba(255,107,53,0.08)'
                        : 'rgba(255,215,0,0.08)',
              border: `1px solid ${
                prediction.match_winner === 'Home' ? GREEN
                : prediction.match_winner === 'Away' ? ORANGE
                : GOLD}50`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: '1.4rem' }}>{prediction.match_winner === 'Home' ? '🏠' : prediction.match_winner === 'Away' ? '🛘' : '🤝'}</span>
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Predicted Outcome</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'white' }}>
                  <span style={{
                    color: prediction.match_winner === 'Home' ? GREEN : prediction.match_winner === 'Away' ? ORANGE : GOLD
                  }}>{prediction.match_winner} Win</span>
                  {prediction.winner_team_name && <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, fontSize: '0.8rem', marginLeft: 8 }}>({prediction.winner_team_name})</span>}
                </div>
                {prediction.winner_reasoning && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{prediction.winner_reasoning}</div>}
              </div>
            </div>
          )}

          {/* Behaviour Pattern Signals */}
          {prediction.behaviourSignals && (() => {
            const bData = prediction.behaviourSignals[0]; // expect 1 item since it's a single match
            if (!bData || bData.signals.length === 0) return null;
            return (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bData.signals.map((sig, sIdx) => (
                  <div key={sIdx} style={{ background: 'rgba(247, 148, 29, 0.1)', border: '1px solid rgba(247, 148, 29, 0.3)', borderLeft: '3px solid #f7941d', borderRadius: 6, padding: '8px 12px', fontSize: '0.75rem', color: '#f7941d' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 800 }}>⚠️ {sig.patternType.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: '0.65rem', background: 'rgba(247, 148, 29, 0.2)', padding: '2px 6px', borderRadius: 12, fontWeight: 700 }}>{sig.riskLevel} RISK</span>
                    </div>
                    <div style={{ color: 'white', lineHeight: 1.4 }}>{sig.message}</div>
                    {sig.biasToward && <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#f7941d', fontWeight: 600 }}>→ AI Bias Adjusted: {sig.biasToward} ({sig.biasLabel})</div>}
                  </div>
                ))}
              </div>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {[
              { label: 'O1.5 Goals', val: prediction.over1_5, color: GREEN },
              { label: 'O2.5 Goals', val: prediction.over2_5, color: NEON },
              { label: 'GG', val: prediction.GG, color: PURPLE },
              { label: 'Exact Score', val: prediction.correctScore, color: GOLD }
            ].map((p, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.02)' }}>
                 <div style={{ fontSize: '0.65rem', color: p.color || 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 6, letterSpacing: '0.05em' }}>{p.label}</div>
                 <div style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500 }}>{p.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14, lineHeight: 1.6 }}>
        <strong>How this works:</strong> Select a specific match. The AI fetches its <strong>Home Win %</strong>, <strong>Away Win %</strong>, <strong>venue-split form strings</strong>, and <strong>Head-to-Head venue bias</strong> from Database historical data — then generates a precise forecast.
        <span style={{ color: ORANGE, fontWeight: 700 }}> Betting odds are never used — favourites lose regularly in vFootball.</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ScoreBoard component
// ─────────────────────────────────────────────────────────────────────────────
export default function ScoreBoard({
  scores = [],
  status = 'loading',
  lastUpdated = null,
  pollError = null,
  batchId = null,
  onRefresh = null,
}) {
  const [livePredictions, setLivePredictions] = useState(null);
  const [isPredicting, setIsPredicting]       = useState(false);
  const [predictError, setPredictError]       = useState(null);
  const [isRefreshing, setIsRefreshing]       = useState(false);
  const [activeLeague, setActiveLeague]       = useState(null); // filter tab
  const [leagueBaselines, setLeagueBaselines] = useState({});   // league name → baseline stats

  // Track previous match count for velocity badge (▲ +N new)
  const prevTotalRef  = useRef(0);
  const [newMatchDelta, setNewMatchDelta] = useState(0);

  // Debounce AI predictions: only fire if ≥3 min since last call
  const lastPredictTime = useRef(0);
  const currentBatchPredict = useRef(null);

  // SSE AI status log
  const [aiLog, setAiLog] = useState([]);
  const aiLogEndRef       = useRef(null);

  // ── Connect to AI status stream ─────────────────────────────────────────────
  useEffect(() => {
    console.log('[ScoreBoard] 📡 Connecting to AI status stream...');
    const es = new EventSource('/api/ai-status-stream');
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        const time = new Date(data.timestamp).toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        setAiLog(prev => [...prev.slice(-49), { ...data, displayTime: time }]);
        console.log(`[AI Stream][ScoreBoard] [${data.action}] ${data.message}`);
      } catch (e) {
        console.warn('[ScoreBoard] SSE parse error:', e);
      }
    };
    es.onerror = () => console.warn('[ScoreBoard] AI status stream disconnected.');
    return () => es.close();
  }, []);

  // 🧬 Fetch League DNA baselines (BTTS%, O1.5%, O2.5%, Draw%) for DNA strip on each league group
  useEffect(() => {
    const fetchBaselines = async () => {
      try {
        console.log('[ScoreBoard] 🧬 Fetching League DNA baselines for live odds strip...');
        const res  = await fetch('/api/vfootball/league-baselines');
        const data = await res.json();
        if (data.success && data.baselines) {
          const map = {};
          data.baselines.forEach(bl => { map[bl.league] = bl; });
          setLeagueBaselines(map);
          console.log(`[ScoreBoard] ✅ League DNA loaded for ${data.baselines.length} leagues.`);
        } else {
          console.warn('[ScoreBoard] ⚠️ No baselines returned:', data.error);
        }
      } catch (err) {
        console.error('[ScoreBoard] ❌ Baseline fetch error:', err.message);
      }
    };
    fetchBaselines();
  }, []);

  // Auto-scroll AI log to bottom
  useEffect(() => {
    aiLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiLog]);

  // ── Track match velocity (new matches per batch) ────────────────────────────
  const totalMatches = scores.reduce((sum, g) => sum + (g.matches?.length || 0), 0);
  useEffect(() => {
    const delta = totalMatches - prevTotalRef.current;
    if (delta > 0) {
      setNewMatchDelta(delta);
      console.log(`[ScoreBoard] 📈 Match velocity: +${delta} new match(es) in this batch.`);
      const t = setTimeout(() => setNewMatchDelta(0), 4000); // badge fades after 4s
      prevTotalRef.current = totalMatches;
      return () => clearTimeout(t);
    }
    prevTotalRef.current = totalMatches;
  }, [totalMatches]);

  // ── Auto AI prediction with 3-min debounce ─────────────────────────────────
  const handleForceAIPrediction = async () => {
    if (!batchId || !scores || scores.length === 0) return;
    const league = scores[0].league;
    const d = new Date();
    const todayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    setIsPredicting(true);
    setPredictError(null);
    try {
      console.log(`[ScoreBoard] 🤖 Manual-triggering AI prediction for batch ${batchId}.`);
      const res = await fetch('/api/vfootball/daily-tips/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr, league, force: true }),
      });
      const data = await res.json();
      if (data.success && data.tipData) {
        setLivePredictions(data.tipData);
        console.log('[ScoreBoard] ✅ Manual AI prediction received.');
      } else {
        console.warn('[ScoreBoard] ⚠️ Manual AI prediction failed:', data.error);
        setPredictError(data.error);
      }
    } catch (err) {
      console.error('[ScoreBoard] ❌ Manual AI prediction error:', err.message);
      setPredictError(err.message);
    }
    setIsPredicting(false);
  };

  useEffect(() => {
    if (!batchId || !scores || scores.length === 0) return;
    if (currentBatchPredict.current === batchId) return;

    const now = Date.now();
    const MIN_PRED_INTERVAL = 3 * 60 * 1000; // 3 minutes between auto-predictions
    const elapsed = now - lastPredictTime.current;

    if (elapsed < MIN_PRED_INTERVAL) {
      const waitSec = Math.round((MIN_PRED_INTERVAL - elapsed) / 1000);
      console.log(`[ScoreBoard] 🕐 AI prediction debounced — next allowed in ${waitSec}s`);
      return;
    }

    currentBatchPredict.current = batchId;
    lastPredictTime.current = now;

    const league = scores[0].league;
    const d = new Date();
    const todayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const fetchLivePrediction = async () => {
      setIsPredicting(true);
      setPredictError(null);
      try {
        console.log(`[ScoreBoard] 🤖 Auto-triggering AI prediction for batch ${batchId} (debounced, no force).`);
        const res = await fetch('/api/vfootball/daily-tips/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // force: false — uses the cache if this batch was already analyzed
          body: JSON.stringify({ date: todayStr, league, force: false }),
        });
        const data = await res.json();
        if (data.success && data.tipData) {
          setLivePredictions(data.tipData);
          console.log('[ScoreBoard] ✅ AI prediction received.');
        } else {
          console.warn('[ScoreBoard] ⚠️ AI prediction failed:', data.error);
          setPredictError(data.error);
        }
      } catch (err) {
        console.error('[ScoreBoard] ❌ AI prediction error:', err.message);
        setPredictError(err.message);
      }
      setIsPredicting(false);
    };

    fetchLivePrediction();
  }, [batchId, scores]);

  // ── Manual refresh ──────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    console.log('[ScoreBoard] 🔄 Manual refresh triggered by user.');
    try {
      const res = await fetch('/api/scores');
      const json = await res.json();
      console.log('[ScoreBoard] ✅ Manual refresh response:', json.success ? 'OK' : json.error);
    } catch (err) {
      console.error('[ScoreBoard] ❌ Manual refresh error:', err.message);
    }
    // SSE will deliver the new data automatically; just stop the spinner
    setTimeout(() => setIsRefreshing(false), 1200);
    if (onRefresh) onRefresh();
  }, [isRefreshing, onRefresh]);

  const [isReloadingScraper, setIsReloadingScraper] = useState(false);
  const handleReloadScraper = useCallback(async () => {
    if (isReloadingScraper) return;
    setIsReloadingScraper(true);
    console.log('[ScoreBoard] 🔄 Manual Scraper Reload triggered by user.');
    try {
      const res = await fetch('/api/scraper/reload', { method: 'POST' });
      const json = await res.json();
      console.log('[ScoreBoard] ✅ Scraper Reload response:', json.success ? 'OK' : json.error);
    } catch (err) {
      console.error('[ScoreBoard] ❌ Scraper Reload error:', err.message);
    }
    setTimeout(() => setIsReloadingScraper(false), 3000);
  }, [isReloadingScraper]);

  const timeAgo = useTimeAgo(lastUpdated);

  console.log(`[ScoreBoard] Render — status=${status} groups=${scores.length} total=${totalMatches} updated=${lastUpdated?.toISOString() || 'never'}`);

  // ── League filter tabs (multi-league support) ────────────────────────────────
  const leagueGroups = scores;
  const leagues      = leagueGroups.map(g => g.league);
  const filteredGroups = activeLeague
    ? leagueGroups.filter(g => g.league === activeLeague)
    : leagueGroups;

  // ── Status bar ──────────────────────────────────────────────────────────────
  const statusBar = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', marginBottom: 16,
      background: 'rgba(0,0,0,0.25)', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {status === 'live' && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 10px ${GREEN}`, animation: 'pulse 1.5s infinite' }} />
        )}
        {(status === 'loading' || status === 'initializing') && (
          <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
        )}
        {status === 'error' && <span style={{ fontSize: '0.8rem' }}>⚠️</span>}

        <span style={{
          fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: status === 'live' ? GREEN : status === 'error' ? RED : GOLD,
        }}>
          {status === 'live'         && 'Live · SSE Push'}
          {status === 'loading'      && 'Connecting to scraper…'}
          {status === 'initializing' && 'Scraper initialising — navigating to SportyBet…'}
          {status === 'error'        && 'Stream error — reconnecting…'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {/* Match velocity badge */}
        {newMatchDelta > 0 && (
          <span style={{
            fontSize: '0.68rem', fontWeight: 800, color: GREEN,
            background: 'rgba(0,255,136,0.12)', border: `1px solid ${GREEN}40`,
            borderRadius: 20, padding: '2px 8px',
            animation: 'oddsFlash 0.5s ease',
          }}>
            ▲ +{newMatchDelta} new
          </span>
        )}
        {totalMatches > 0 && (
          <span style={{ fontSize: '0.72rem', color: NEON, fontWeight: 700 }}>
            {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
          </span>
        )}
        {lastUpdated && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Updated {timeAgo}
          </span>
        )}
        {/* Manual refresh button */}
        <button
          id="live-odds-refresh-btn"
          onClick={handleRefresh}
          title="Force refresh now"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: isRefreshing ? GOLD : 'var(--text-muted)',
            borderRadius: 6, padding: '4px 10px',
            fontSize: '0.72rem', cursor: 'pointer',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = NEON}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        >
          <span style={{ display: 'inline-block', animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>⟳</span>
          Refresh
        </button>
        {/* Scraper force reload button */}
        <button
          id="live-odds-scraper-reload-btn"
          onClick={handleReloadScraper}
          title="Force reboot scraper in background"
          style={{
            background: 'rgba(255,51,85,0.08)',
            border: `1px solid ${isReloadingScraper ? RED : 'rgba(255,51,85,0.3)'}`,
            color: isReloadingScraper ? GOLD : RED,
            borderRadius: 6, padding: '4px 10px',
            fontSize: '0.72rem', cursor: 'pointer',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,51,85,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,51,85,0.08)'}
        >
          <span style={{ display: 'inline-block', animation: isReloadingScraper ? 'spin 1.5s linear infinite' : 'none' }}>⚡</span>
          {isReloadingScraper ? 'Rebooting...' : 'Reload Scraper'}
        </button>
      </div>
    </div>
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {statusBar}
        <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 20px', width: 40, height: 40 }} />
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 8px' }}>Connecting to Live Scraper</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Chrome is launching and navigating to the vFootball betslip. This takes ~10–20s on first start.
          </p>
        </div>
      </div>
    );
  }

  // ── Initialising state ───────────────────────────────────────────────────
  if (status === 'initializing') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {statusBar}
        <div className="glass-panel" style={{
          padding: '40px 28px', borderLeft: `4px solid ${GOLD}`,
          background: 'rgba(255,215,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <span style={{ fontSize: '2rem' }}>🌐</span>
            <div>
              <h3 style={{ margin: 0, color: GOLD, fontSize: '1.05rem', fontWeight: 700 }}>
                Scraper is Navigating to SportyBet
              </h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                The headless Chrome instance is opening the vFootball live page. Odds will appear automatically via SSE push — no action needed.
              </p>
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '14px 18px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <strong style={{ color: '#fff' }}>How this works:</strong><br />
            1. On server start, Chrome launches automatically in the background.<br />
            2. It navigates to <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>sportybet.com/ng/sport/vFootball</code> using WAF-bypass flags.<br />
            3. Every 5 seconds it reads the live odds from the DOM — pushed instantly to you via SSE.<br />
            4. Navigation can take 15–45s — the page auto-updates once data is ready.
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {statusBar}
        <div className="glass-panel" style={{
          padding: '40px 28px', borderLeft: `4px solid ${RED}`,
          background: 'rgba(255,51,85,0.04)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⚠️</div>
          <h3 style={{ color: RED, margin: '0 0 8px' }}>Live Stream Disconnected</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: '0.88rem' }}>{pollError}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 16px' }}>
            The browser will auto-reconnect the SSE stream. You can also try a manual refresh.
          </p>
          <button
            id="live-odds-error-refresh-btn"
            onClick={handleRefresh}
            style={{
              background: `rgba(255,51,85,0.15)`, border: `1px solid ${RED}40`,
              color: RED, borderRadius: 8, padding: '8px 20px',
              fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700,
            }}
          >
            ⟳ Try Manual Refresh
          </button>
        </div>
      </div>
    );
  }

  // ── Live — no matches yet ────────────────────────────────────────────────
  if (status === 'live' && scores.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {statusBar}
        <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📡</div>
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 8px' }}>Waiting for Live Matches</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            The scraper is connected but hasn't found any vFootball odds yet. SportyBet may be between match rotations — data will push here automatically via SSE within seconds.
          </p>
        </div>
      </div>
    );
  }

  // ── Live — render match cards ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Odds flash + spin keyframes */}
      <style>{`
        @keyframes oddsFlash {
          0%   { background: rgba(0,229,255,0.15); }
          100% { background: transparent; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {statusBar}

      {/* AI Predictions Panel */}
      <AIPredictionsPanel
        isPredicting={isPredicting}
        predictError={predictError}
        livePredictions={livePredictions}
        aiLog={aiLog}
        aiLogEndRef={aiLogEndRef}
        onForcePredict={handleForceAIPrediction}
      />

      {/* Specific Match AI Predictor Panel */}
      <UpcomingMatchPredictorPanel leagueGroups={leagueGroups} />

      {/* League filter tabs (only shown when multiple leagues exist) */}
      {leagues.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <button
            id="league-filter-all"
            onClick={() => setActiveLeague(null)}
            style={{
              background: activeLeague === null ? `rgba(0,229,255,0.15)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${activeLeague === null ? NEON : 'rgba(255,255,255,0.08)'}`,
              color: activeLeague === null ? NEON : 'var(--text-muted)',
              borderRadius: 20, padding: '4px 14px', fontSize: '0.72rem',
              fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            All Leagues
          </button>
          {leagues.map(lg => (
            <button
              key={lg}
              id={`league-filter-${lg.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => setActiveLeague(lg)}
              style={{
                background: activeLeague === lg ? `rgba(0,229,255,0.15)` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeLeague === lg ? NEON : 'rgba(255,255,255,0.08)'}`,
                color: activeLeague === lg ? NEON : 'var(--text-muted)',
                borderRadius: 20, padding: '4px 14px', fontSize: '0.72rem',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {lg}
            </button>
          ))}
        </div>
      )}

      {/* Match groups */}
      {filteredGroups.map((leagueGroup, gi) => (
        <div key={gi}>
          {/* League header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 3, height: 22, background: `linear-gradient(180deg,${NEON},${PURPLE})`, borderRadius: 3 }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: NEON, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              📡 {leagueGroup.league}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {leagueGroup.matches?.length || 0} match{leagueGroup.matches?.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* League DNA Baseline Strip — shows key stats computed from last 7 days */}
          {(() => {
            const bl = leagueBaselines[leagueGroup.league];
            if (!bl || !bl.stats) return null;
            const s   = bl.stats;
            const g   = (v, hi, mi) => v >= hi ? '#00FF88' : v >= mi ? '#FFD700' : '#FF3355';
            const tags = [];
            if (s.over1_5Percent != null) tags.push({ label: `O1.5 ${s.over1_5Percent}%`, color: g(s.over1_5Percent, 75, 70) });
            if (s.over2_5Percent != null) tags.push({ label: `O2.5 ${s.over2_5Percent}%`, color: g(s.over2_5Percent, 55, 49) });
            if (s.bttsPercent    != null) tags.push({ label: `BTTS ${s.bttsPercent}%`,  color: g(s.bttsPercent, 55, 50) });
            if (s.drawPercent    != null) tags.push({ label: `Draw ${s.drawPercent}%`,   color: g(s.drawPercent, 26, 24) });
            if (s.avgGoals       != null) tags.push({ label: `∅ ${Number(s.avgGoals).toFixed(1)} gl/g`, color: '#00E5FF' });
            if (bl.topScores?.[0]) tags.push({ label: `🎯 ${bl.topScores[0].score} (${bl.topScores[0].percent}%)`, color: '#FFD700' });
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                marginBottom: 8, padding: '5px 10px',
                background: 'rgba(0,229,255,0.04)', borderRadius: 6,
                border: '1px solid rgba(0,229,255,0.1)',
              }}>
                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>🧬 DNA</span>
                {tags.map((t, i) => (
                  <span key={i} style={{
                    fontSize: '0.62rem', fontWeight: 800, padding: '1px 7px', borderRadius: 20,
                    background: `${t.color}12`, color: t.color, border: `1px solid ${t.color}30`,
                    fontFamily: 'monospace',
                  }}>
                    {t.label}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Column header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '54px 1fr auto 1fr 54px',
            padding: '6px 16px', marginBottom: 4,
            fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <span>Time</span>
            <span style={{ textAlign: 'right' }}>Home</span>
            <span style={{ textAlign: 'center', paddingLeft: 8 }}>1 · X · 2</span>
            <span>Away</span>
            <span style={{ textAlign: 'right' }}>Code</span>
          </div>

          {/* Match rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(leagueGroup.matches || []).map((match, mi) => (
              <MatchRow key={`${match.code}-${mi}`} match={match} behaviourSignals={livePredictions?.behaviourSignals} />
            ))}
          </div>
        </div>
      ))}

      {/* How it works */}
      <div className="glass-panel" style={{
        marginTop: 8, padding: '16px 20px',
        borderLeft: `3px solid ${PURPLE}50`,
        background: `rgba(167,139,250,0.03)`,
      }}>
        <div style={{ fontSize: '0.72rem', color: PURPLE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          ℹ️ How Live Fixtures Work
        </div>
        {/* Odds disclaimer banner */}
        <div style={{
          background: 'rgba(255,107,53,0.08)', border: `1px solid ${ORANGE}30`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: '0.75rem', color: ORANGE, lineHeight: 1.5 }}>
            <strong>Odds shown here are for reference only.</strong> The AI prediction engine does <strong>NOT</strong> use odds as a predictor.
            In vFootball, the team with the lowest odds (the favourite) loses regularly.
            All AI predictions are based exclusively on <strong>historical home/away win %</strong> and <strong>H2H venue records</strong> from real match data.
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <li>A headless Chrome instance runs on the server, reading the SportyBet vFootball betslip every 5s for upcoming fixture team names</li>
          <li>Every <strong style={{ color: 'white' }}>5 seconds</strong> it reads the DOM — data is <strong style={{ color: NEON }}>instantly pushed to your browser via SSE</strong> (no polling delay)</li>
          <li>Odds are colour-coded: <span style={{ color: GREEN }}>Green = Favourite (FAV)</span> · <span style={{ color: GOLD }}>Gold = Draw (DRAW)</span> · <span style={{ color: RED }}>Red = Underdog (DOG)</span> — display only</li>
          <li>Odds that change between updates <strong style={{ color: 'white' }}>flash cyan</strong> to show movement</li>
          <li>Real match scores are captured separately by the <strong style={{ color: NEON }}>Native Results Scraper</strong> (SportyBet liveResult page) and saved to Database — this powers all AI form statistics</li>
          <li>AI predictions auto-fire at most once every <strong style={{ color: GOLD }}>3 minutes</strong> · Predictions use <strong style={{ color: GREEN }}>HomeWin%</strong>, <strong style={{ color: ORANGE }}>AwayWin%</strong>, and <strong style={{ color: PURPLE }}>H2H venue bias</strong> — never odds</li>
        </ul>
      </div>
    </div>
  );
}
