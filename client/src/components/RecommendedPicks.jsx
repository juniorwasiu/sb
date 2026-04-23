import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// RecommendedPicks.jsx
//
// Surfaces the TOP match picks from Pattern Intelligence Engine.
// ─────────────────────────────────────────────────────────────────────────────

const NEON   = '#00E5FF';
const GREEN  = '#00FF88';
const GOLD   = '#FFD700';
const PURPLE = '#A78BFA';
const RED    = '#FF3355';
const ORANGE = '#FF6B35';

// ── Animated Confidence Bar ────────────────────────────────────────────────────
function ConfidenceBar({ pct, color, animated }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (animated) {
      const t = setTimeout(() => setWidth(pct), 80);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setWidth(pct), 0);
      return () => clearTimeout(t);
    }
  }, [pct, animated]);

  return (
    <div style={{
      height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.07)',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${width}%`,
        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
        borderRadius: 99,
        boxShadow: `0 0 8px ${color}80`,
        transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }} />
    </div>
  );
}

// ── Pick Card ─────────────────────────────────────────────────────────────────
function PickCard({ pick, rank, animate }) {
  const isHot = pick.pct >= 85;
  const isWarm = pick.pct >= 75;
  
  let color = GREEN;
  if (pick.label.includes('Over 2.5')) color = ORANGE;
  else if (pick.label.includes('GG')) color = PURPLE;
  else if (pick.label.includes('Draw')) color = GOLD;
  else if (pick.label.includes('Away')) color = NEON;

  const borderColor = isHot ? color : isWarm ? `${color}80` : 'rgba(255,255,255,0.1)';
  const leagueShort = (pick.league || '').replace(' - Virtual', '').replace(' Virtual', '');

  return (
    <div
      id={`pick-card-${rank}`}
      style={{
        background: `linear-gradient(135deg, ${color}06 0%, rgba(0,0,0,0.45) 100%)`,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        cursor: 'default',
        animation: animate ? `fadeSlideUp 0.4s ease both ${rank * 0.07}s` : 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = `0 12px 32px ${color}20`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Rank badge */}
      <div style={{
        position: 'absolute', top: 12, right: 14,
        fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)',
        fontFamily: 'monospace',
      }}>#{rank}</div>

      {/* Hot badge */}
      {isHot && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: `linear-gradient(135deg, ${color}, ${color}99)`,
          color: '#000', fontSize: '0.58rem', fontWeight: 900,
          padding: '2px 8px', borderRadius: 20, letterSpacing: '0.06em',
        }}>🔥 HOT PICK</div>
      )}

      {/* Selection type */}
      <div style={{
        marginTop: isHot ? 22 : 0,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <span style={{ fontSize: '1.4rem' }}>{pick.emoji}</span>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{leagueShort}</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: color }}>{pick.label}</div>
        </div>
      </div>

      {/* --- Upcoming fixture info --- */}
      {pick.upcomingMatch && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem',
        }}>
          <span style={{ color: NEON, fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0 }}>
            {pick.upcomingMatch.time || '–'}
          </span>
          <span style={{ color: 'white', fontWeight: 700, textAlign: 'right', flex: 1 }}>
            {pick.upcomingMatch.home || '?'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900, fontSize: '0.75rem' }}>vs</span>
          <span style={{ color: 'white', fontWeight: 700, flex: 1 }}>
            {pick.upcomingMatch.away || '?'}
          </span>
        </div>
      )}

      {/* Reasoning */}
      {pick.reasoning && (
        <div style={{
          fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5,
          marginBottom: 12, fontStyle: 'italic',
        }}>
          " {pick.reasoning} "
        </div>
      )}

      {/* Probability meter */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Historical Prob</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 900, color: color, fontFamily: 'monospace' }}>
            {pick.pct}%
          </span>
        </div>
        <ConfidenceBar pct={pick.pct} color={color} animated={animate} />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: '10px', fontSize: '0.68rem', color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 4,
      }}>
        <div style={{ flex: 1 }}>
          <span>📊 </span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{pick.samples} tracked matches</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RecommendedPicks() {
  const [picks, setPicks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [animate, setAnimate]   = useState(false);
  const intervalRef = useRef(null);

  const loadPicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    console.log('[RecommendedPicks] 🚀 Fetching Live Pattern Predictions...');

    try {
      const res = await fetch('/api/pattern-intel?minPct=80&minSamples=3');
      const json = await res.json();

      if (!json.success) throw new Error(json.error || 'Failed to load pattern predictions.');
      
      const patternPicks = (json.patterns || []).map(p => {
        const topOutcome = p.eliteOutcomes && p.eliteOutcomes[0] ? p.eliteOutcomes[0] : null;
        if (!topOutcome) return null;

        return {
          type: topOutcome.key, 
          label: topOutcome.label,
          emoji: topOutcome.emoji,
          pct: topOutcome.pct,
          samples: p.sampleSize,
          league: p.league,
          upcomingMatch: {
            home: p.role === 'Home' ? p.team : 'Opponent',
            away: p.role === 'Away' ? p.team : 'Opponent',
            time: 'Next Match'
          },
          reasoning: `Score Pattern [${p.score}] triggered by ${p.team} (${p.role})`
        };
      }).filter(Boolean);

      patternPicks.sort((a, b) => b.pct - a.pct);

      setPicks(patternPicks.slice(0, 8)); // Top 8
      setAnimate(true);
      setLastRefresh(new Date());
      setTimeout(() => setAnimate(false), 2000);

    } catch (err) {
      console.error('[RecommendedPicks] ❌ Error:', err.message);
      setError(err.message || 'Failed to fetch pattern predictions. Check server connection.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadPicks();
    intervalRef.current = setInterval(() => {
      console.log('[RecommendedPicks] 🔄 Auto-refreshing pattern picks...');
      loadPicks();
    }, 60000);
    return () => clearInterval(intervalRef.current);
  }, [loadPicks]);

  const hotPicks = picks.filter(p => p.pct >= 85);
  const avgPct   = picks.length ? Math.round(picks.reduce((acc, p) => acc + p.pct, 0) / picks.length) : 0;

  return (
    <div id="recommended-picks" style={{ marginBottom: 32 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,215,0,0.07) 0%, rgba(0,0,0,0.5) 100%)',
        border: `1px solid ${GOLD}30`,
        borderRadius: 18,
        padding: '24px 28px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 160, height: 160,
          background: `radial-gradient(circle, ${GOLD}15, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: '1.8rem' }}>🏆</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: 'white', lineHeight: 1.1 }}>
                  Recommended Pattern Picks 
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Live, high-probability betting patterns extracted directly from the Intelligence Engine.
                </p>
              </div>
            </div>

            {/* Stat pills */}
            {picks.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}35`, borderRadius: 20, padding: '4px 12px', fontSize: '0.72rem', color: GOLD, fontWeight: 700 }}>
                  🔥 {hotPicks.length} Elite Picks (≥85%)
                </div>
                <div style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}35`, borderRadius: 20, padding: '4px 12px', fontSize: '0.72rem', color: GREEN, fontWeight: 700 }}>
                  📊 Avg {avgPct}% Probability
                </div>
                {lastRefresh && (
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 12px', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    ↻ {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <button
              id="picks-howto-btn"
              onClick={() => setShowHowTo(v => !v)}
              style={{
                background: showHowTo ? `${GOLD}20` : 'rgba(255,255,255,0.06)',
                border: `1px solid ${showHowTo ? GOLD + '60' : 'rgba(255,255,255,0.1)'}`,
                color: showHowTo ? GOLD : 'var(--text-secondary)',
                borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.2s ease',
              }}
            >
              {showHowTo ? '✕ Close' : '💡 How It Works'}
            </button>
            <button
              id="picks-refresh-btn"
              onClick={loadPicks}
              disabled={loading}
              style={{
                background: loading ? 'rgba(255,215,0,0.08)' : `linear-gradient(135deg, ${GOLD}, #cc9900)`,
                color: loading ? GOLD : '#000',
                border: `1px solid ${GOLD}60`,
                borderRadius: 8, padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 800, fontSize: '0.82rem', transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: GOLD }} />Updating...</>
              ) : '↻ Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* ── How It Works accordion ──────────────────────────────────────────── */}
      {showHowTo && (
        <div style={{
          background: 'rgba(255,215,0,0.04)', border: `1px solid ${GOLD}25`,
          borderRadius: 14, padding: '20px 24px', marginBottom: 20,
          animation: 'fadeSlideUp 0.25s ease both',
        }}>
          <h3 style={{ margin: '0 0 14px', color: GOLD, fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            💡 How Recommended Picks Work
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {[
              { n: '1', title: 'Live Match Monitoring', body: "The engine continuously monitors today's live matches for all tracked leagues." },
              { n: '2', title: 'Pattern Recognition', body: 'When a team finishes a match, we compare their specific scoreline and home/away role to millions of past database records.' },
              { n: '3', title: 'Probability Extraction', body: 'If that exact pattern historically results in a specific outcome (e.g. Over 2.5 Goals) over 80% of the time in their next match, it triggers a signal.' },
              { n: '4', title: 'Live AI Picks', body: "The most statistically reliable patterns are surfaced here automatically as actionable tips for the teams' upcoming matches." },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: GOLD,
                  color: '#000', fontWeight: 900, fontSize: '0.75rem',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>{s.n}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'white', marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{
          background: 'rgba(255,51,85,0.06)', border: `1px solid ${RED}30`,
          borderLeft: `4px solid ${RED}`, borderRadius: 12,
          padding: '18px 22px', marginBottom: 20,
          display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ color: RED, fontWeight: 800, fontSize: '0.85rem', marginBottom: 4 }}>
              Could Not Load Picks
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6 }}>
              {error}
            </div>
            <button
               onClick={loadPicks}
              style={{
                marginTop: 10, background: `${RED}18`, border: `1px solid ${RED}50`,
                color: RED, borderRadius: 8, padding: '6px 14px',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
              }}
            >
              ↻ Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────────────── */}
      {loading && picks.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              style={{
                height: 180, borderRadius: 16, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                animation: 'pulse 1.8s ease infinite',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && !error && picks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          background: 'rgba(255,255,255,0.02)', borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</div>
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 8px' }}>
            Scanning for Elite Patterns
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            No high-probability score patterns have triggered yet today. This area will auto-populate as matches finish.
          </p>
        </div>
      )}

      {/* ── Picks Grid ──────────────────────────────────────────────────────── */}
      {!loading && picks.length > 0 && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {picks.map((pick, i) => (
              <PickCard key={`${pick.league}-${pick.upcomingMatch.home}-${i}`} pick={pick} rank={i + 1} animate={animate} />
            ))}
          </div>

          {/* ── Disclaimer footer ─────────────────────────────────────────── */}
          <div style={{
            marginTop: 16, padding: '12px 18px',
            background: 'rgba(255,255,255,0.025)', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: '0.72rem', color: 'var(--text-muted)',
          }}>
            <span>ℹ️</span>
            <span>
              These picks are automatically triggered by teams hitting historically profitable score patterns. Accuracy auto-resolves daily on the Pattern Intel page.
            </span>
          </div>
        </>
      )}

      {/* ── Inline animation keyframes ─────────────────────────────────────── */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
