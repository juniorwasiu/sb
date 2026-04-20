import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// RecommendedPicks.jsx
//
// Surfaces the TOP match picks from the AI's "Upcoming Match Predictions".
//
// Algorithm (AI Match Parsing + Math Probability):
//  1. Fetches all recent daily AI predictions (upcoming_matches)
//  2. Fetches today's historical match results to calculate mathematical probabilities
//  3. For every single match the AI predicted:
//       - We see what the AI said ("Yes" to Over 2.5, "Yes" to GG, "Home" to Win)
//       - We map each choice to its historical probability %
//       - We pull the single BEST (highest probability) AI recommendation for that match
//  4. Ranks all AI picks across all leagues by confidence.
//  5. Filters but ENSURES at least 4 top picks are returned.
// ─────────────────────────────────────────────────────────────────────────────

const NEON   = '#00E5FF';
const GREEN  = '#00FF88';
const GOLD   = '#FFD700';
const PURPLE = '#A78BFA';
const RED    = '#FF3355';
const ORANGE = '#FF6B35';

// ── Colour helpers ────────────────────────────────────────────────────────────
const SELECTION_CONFIGS = {
  HOME_WIN:   { label: 'Home Win',       icon: '🏠', color: GREEN  },
  AWAY_WIN:   { label: 'Away Win',       icon: '✈️',  color: NEON   },
  DRAW:       { label: 'Draw',           icon: '🤝',  color: GOLD   },
  OVER_1_5:   { label: 'Over 1.5 Goals', icon: '⚽', color: '#4ADE80' },
  OVER_2_5:   { label: 'Over 2.5 Goals', icon: '🔥', color: ORANGE },
  GG:         { label: 'Both Teams Score', icon: '🎯', color: PURPLE },
};

// ── Parse score like "2:1" → { home:2, away:1 } ──────────────────────────────
function parseScore(score) {
  if (!score || typeof score !== 'string') return null;
  const [h, a] = score.split(':').map(Number);
  if (isNaN(h) || isNaN(a)) return null;
  return { home: h, away: a, total: h + a };
}

// ── Compute probability-based picks from AI predictions ──────────────────────
function computeAIPicks(historicalMatches, aiTips) {
  console.log('[RecommendedPicks] 📊 Step 3: Computing picks from AI tips...');

  // Group historical matches by league to calculate probabilities
  const byLeague = {};
  for (const m of historicalMatches) {
    const key = m.league || 'Unknown';
    if (!byLeague[key]) byLeague[key] = [];
    const s = parseScore(m.score);
    if (s) byLeague[key].push({ ...m, parsed: s });
  }

  const picks = [];

  // We only want the *latest* prediction batch per league to avoid stale past matches
  const latestTips = {};
  for (const tip of aiTips) {
    if (!latestTips[tip.league]) {
      latestTips[tip.league] = tip;
    }
  }

  // Iterate over AI predictions
  for (const tip of Object.values(latestTips)) {
    const league = tip.league || 'Unknown League';
    const hist = byLeague[league] || [];
    const total = hist.length;

    // Calculate baseline historical probabilities for the league today
    let homeWinPct = 0, awayWinPct = 0, drawPct = 0, over2_5Pct = 0, over1_5Pct = 0, ggPct = 0, avgGoals = 'N/A';

    if (total > 0) {
      const homeWins  = hist.filter(m => m.parsed.home > m.parsed.away).length;
      const awayWins  = hist.filter(m => m.parsed.away > m.parsed.home).length;
      const draws     = hist.filter(m => m.parsed.home === m.parsed.away).length;
      const over2_5   = hist.filter(m => m.parsed.total > 2).length;
      const over1_5   = hist.filter(m => m.parsed.total > 1).length;
      const gg        = hist.filter(m => m.parsed.home > 0 && m.parsed.away > 0).length;

      homeWinPct = Math.round((homeWins  / total) * 100);
      awayWinPct = Math.round((awayWins  / total) * 100);
      drawPct    = Math.round((draws     / total) * 100);
      over2_5Pct = Math.round((over2_5   / total) * 100);
      over1_5Pct = Math.round((over1_5   / total) * 100);
      ggPct      = Math.round((gg        / total) * 100);
      avgGoals   = (hist.reduce((acc, m) => acc + m.parsed.total, 0) / total).toFixed(1);
    }

    const matches = tip.tipData?.upcoming_matches || [];

    // Map each predicted match to its safest/best selection
    for (const match of matches) {
      if (!match.fixture) continue;
      
      const parts = match.fixture.split(' vs ');
      const upcomingMatch = {
        home: parts[0]?.trim() || match.team_home || 'Home',
        away: parts[1]?.trim() || match.team_away || 'Away',
        time: match.time || 'Next'
      };

      const options = [];
      const winner = (match.match_winner || '').toUpperCase();

      // Correlate AI Winner prediction
      if (winner && upcomingMatch.home && winner.includes(upcomingMatch.home.toUpperCase())) {
        options.push({ type: 'HOME_WIN', pct: homeWinPct || 50 /* baseline if no hist */ });
      } else if (winner && upcomingMatch.away && winner.includes(upcomingMatch.away.toUpperCase())) {
        options.push({ type: 'AWAY_WIN', pct: awayWinPct || 40 });
      } else if (winner && winner.includes('DRAW')) {
        options.push({ type: 'DRAW', pct: drawPct || 30 });
      }

      // Correlate AI Goals/GG predictions
      if ((match.over_1_5 || '').toLowerCase().includes('yes')) options.push({ type: 'OVER_1_5', pct: over1_5Pct || 70 });
      if ((match.over_2_5 || '').toLowerCase().includes('yes')) options.push({ type: 'OVER_2_5', pct: over2_5Pct || 50 });
      if ((match.gg || '').toLowerCase().includes('yes'))       options.push({ type: 'GG', pct: ggPct || 50 });

      // Find the HIGHEST probability option out of what the AI predicted
      if (options.length > 0) {
        const bestOption = options.sort((a, b) => b.pct - a.pct)[0];

        picks.push({
          type: bestOption.type,
          pct: bestOption.pct,
          samples: total,
          league: league,
          upcomingMatch,
          avgGoals,
          reasoning: match.prediction_reasoning || "AI pattern detection."
        });
      }
    }
  }

  // Rank globally across all leagues
  picks.sort((a, b) => b.pct - a.pct);

  // Return logic: Target >= 50% picks, but GUARANTEE at least 4 are returned 
  // (or max amount if total < 4)
  const confidentPicks = picks.filter(p => p.pct >= 50);

  if (picks.length <= 4) {
      return picks;
  }
  if (confidentPicks.length >= 4) {
      // Return highly confident AI picks
      return confidentPicks.slice(0, 10);
  } else {
      // Force return top 4 best picks regardless
      return picks.slice(0, 4);
  }
}

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
  const cfg = SELECTION_CONFIGS[pick.type] || SELECTION_CONFIGS['HOME_WIN'];
  const isHot = pick.pct >= 75;
  const isWarm = pick.pct >= 60;
  const borderColor = isHot ? cfg.color : isWarm ? `${cfg.color}80` : 'rgba(255,255,255,0.1)';
  const leagueShort = (pick.league || '').replace(' - Virtual', '').replace(' Virtual', '');

  return (
    <div
      id={`pick-card-${rank}`}
      style={{
        background: `linear-gradient(135deg, ${cfg.color}06 0%, rgba(0,0,0,0.45) 100%)`,
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
        e.currentTarget.style.boxShadow = `0 12px 32px ${cfg.color}20`;
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
          background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}99)`,
          color: '#000', fontSize: '0.58rem', fontWeight: 900,
          padding: '2px 8px', borderRadius: 20, letterSpacing: '0.06em',
        }}>🔥 HOT PICK</div>
      )}

      {/* Selection type */}
      <div style={{
        marginTop: isHot ? 22 : 0,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <span style={{ fontSize: '1.4rem' }}>{cfg.icon}</span>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{leagueShort}</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
        </div>
      </div>

      {/* --- Upcoming fixture AI info --- */}
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

      {/* AI Reasoning */}
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
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Probability</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 900, color: cfg.color, fontFamily: 'monospace' }}>
            {pick.pct}%
          </span>
        </div>
        <ConfidenceBar pct={pick.pct} color={cfg.color} animated={animate} />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: '10px', fontSize: '0.68rem', color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 4,
      }}>
        <div style={{ flex: 1 }}>
          <span>📊 </span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{pick.samples} matches</span>
        </div>
        <div style={{ flex: 1 }}>
          <span>⚽ </span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>Avg {pick.avgGoals} goals</span>
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

  // ── Core fetch + compute logic ───────────────────────────────────────────────
  const loadPicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    console.log('[RecommendedPicks] 🚀 Step 1: Fetching AI Prediction Data...');

    try {
      // Parallel fetch: historical data for % calculation + today's AI predictions
      const [histRes, tipsRes] = await Promise.allSettled([
        fetch('/api/public/results?page=1&pageSize=10').then(r => r.json()),
        fetch('/api/vfootball/daily-tips/history').then(r => r.json()),
      ]);

      let historicalMatches = [];
      if (histRes.status === 'fulfilled' && histRes.value.success) {
        historicalMatches = (histRes.value.dates || []).flatMap(d =>
          Object.values(d.leagues).flat()
        );
      }

      let aiTips = [];
      if (tipsRes.status === 'fulfilled' && tipsRes.value.success) {
        aiTips = tipsRes.value.history || [];
      } else {
        throw new Error('Failed to load AI Match Predictions.');
      }

      if (aiTips.length === 0) {
        setPicks([]);
        setLoading(false);
        return;
      }

      const computed = computeAIPicks(historicalMatches, aiTips);
      setPicks(computed);
      setAnimate(true);
      setLastRefresh(new Date());
      setTimeout(() => setAnimate(false), 2000);

    } catch (err) {
      console.error('[RecommendedPicks] ❌ Error:', err.message);
      setError(err.message || 'Failed to compute recommended picks. Check server connection.');
    }

    setLoading(false);
  }, []);

  // ── Auto-refresh every 90 seconds ──────────────────────────────────────────
  useEffect(() => {
    loadPicks();
    intervalRef.current = setInterval(() => {
      console.log('[RecommendedPicks] 🔄 Auto-refreshing AI picks...');
      loadPicks();
    }, 90000);
    return () => clearInterval(intervalRef.current);
  }, [loadPicks]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const hotPicks = picks.filter(p => p.pct >= 70);
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
                  Recommended AI Picks 
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Best selections extracted from AI Upcoming Match predictions · Ranked by probability
                </p>
              </div>
            </div>

            {/* Stat pills */}
            {picks.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}35`, borderRadius: 20, padding: '4px 12px', fontSize: '0.72rem', color: GOLD, fontWeight: 700 }}>
                  🔥 {hotPicks.length} Hot Picks (≥70%)
                </div>
                <div style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}35`, borderRadius: 20, padding: '4px 12px', fontSize: '0.72rem', color: GREEN, fontWeight: 700 }}>
                  📊 Avg {avgPct}% Confidence
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
              { n: '1', title: 'AI Match Loading', body: 'The engine pulls all "Upcoming Matches" predicted by DeepSeek AI/Gemini for your tracked leagues.' },
              { n: '2', title: 'Historical Tracking', body: 'We fetch raw completed results from the Native Database DB to build the current mathematical probability profile for each league.' },
              { n: '3', title: 'Finding the "Best Pick"', body: 'For every single AI-predicted match, we test the AI’s suggested winner/goals against mathematical probability to find the safest single choice.' },
              { n: '4', title: 'Guarantee 4+ Picks', body: 'The engine displays the BEST >50% probability AI picks across all leagues, constantly maintaining a minimum display of 4 top choices.' },
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
              Could Not Load AI Picks
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
              ↺ Try Again
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
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🤖📭</div>
          <h3 style={{ color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 8px' }}>
            No AI Match Predictions Ready
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Run the AI prediction engine from the "Daily Tips & Brain Intelligence" section below first.
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
              Best picks are generated by mathematically verifying the AI's upcoming match predictions against native Database historical data.
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
