// ─────────────────────────────────────────────────────────────────────────────
// BehaviourPatterns.jsx
//
// Displays advanced statistical behaviour signals:
//   1. WIN STREAK FATIGUE  — Team on 4+ consecutive wins: upset risk is elevated
//   2. BIG TEAM CLASH      — Two historically strong teams: underdog expected
//   3. LOSS REVERSAL       — Team on 4+ consecutive losses: overdue win
//
// Also shows a live streak profile table for all teams in the league
// and compares the two most recent screenshot result batches.
//
// HOW THIS PAGE WORKS:
//   - Select a league → click "Scan Behaviour" to run live streak analysis
//   - The engine queries Database for each team's last 15 matches
//   - Signals are shown per fixture with risk level and bias recommendation
//   - All signals are automatically injected into every AI prediction prompt
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';

// ── Theme tokens (consistent with rest of app) ────────────────────────────────
const THEME = {
  bg:           '#0a0b0f',
  panel:        'rgba(255,255,255,0.03)',
  border:       'rgba(255,255,255,0.08)',
  neon:         '#00ff9d',
  purple:       '#9b5de5',
  orange:       '#f7941d',
  red:          '#ff4757',
  yellow:       '#ffd700',
  textPrimary:  '#f0f0f0',
  textSecondary:'#8a8fa8',
  textMuted:    '#4a4f6a',
};

// ── Supported leagues ─────────────────────────────────────────────────────────
const LEAGUES = [
  'England - Virtual',
  'Spain - Virtual',
  'Italy - Virtual',
  'Germany - Virtual',
  'France - Virtual',
];

// ── Risk badge colours ────────────────────────────────────────────────────────
const riskColour = (level) => {
  if (level === 'HIGH')   return { bg: 'rgba(255,71,87,0.15)',  text: '#ff4757', border: 'rgba(255,71,87,0.4)' };
  if (level === 'MEDIUM') return { bg: 'rgba(247,148,29,0.12)', text: '#f7941d', border: 'rgba(247,148,29,0.4)' };
  return                        { bg: 'rgba(0,255,157,0.08)',   text: '#00ff9d', border: 'rgba(0,255,157,0.3)' };
};

// ── Pattern type config ───────────────────────────────────────────────────────
const PATTERN_META = {
  WIN_STREAK_FATIGUE:  { icon: '🔥', label: 'Win Streak Fatigue',  colour: '#f7941d' },
  LOSS_REVERSAL_SIGNAL:{ icon: '📈', label: 'Loss Reversal Signal', colour: '#00ff9d' },
  BIG_TEAM_CLASH:      { icon: '⚡', label: 'Big Team Clash',       colour: '#9b5de5' },
};

// ── How-it-works tooltip ─────────────────────────────────────────────────────
function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: `1px solid ${THEME.border}`,
          color: THEME.textSecondary, padding: '4px 10px', borderRadius: '6px',
          fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
        }}
      >
        ❓ How this works
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 100, width: 340,
          background: '#12141c', border: `1px solid ${THEME.border}`, borderRadius: '12px',
          padding: '16px', fontSize: '0.78rem', color: THEME.textSecondary,
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
        }}>
          <p style={{ color: THEME.textPrimary, fontWeight: 700, marginBottom: '10px' }}>🧠 How Behaviour Patterns Work</p>
          <ul style={{ margin: 0, padding: '0 0 0 16px', lineHeight: 1.8 }}>
            <li><span style={{ color: PATTERN_META.WIN_STREAK_FATIGUE.colour }}>🔥 Win Streak Fatigue</span> — A team winning 4+ games in a row faces statistical regression. The opponent gets a hidden upset probability boost.</li>
            <li><span style={{ color: PATTERN_META.BIG_TEAM_CLASH.colour }}>⚡ Big Team Clash</span> — When two top-performing teams (≥55% win rate) face each other, the slight underdog commonly wins — form alone is misleading here.</li>
            <li><span style={{ color: PATTERN_META.LOSS_REVERSAL_SIGNAL.colour }}>📈 Loss Reversal</span> — A team losing 4+ in a row is statistically "due" a win. Even as underdogs, do NOT rule them out automatically.</li>
          </ul>
          <p style={{ marginTop: '10px', color: THEME.textMuted, fontSize: '0.7rem' }}>
            All signals are automatically injected into AI predictions and reduce overconfidence in favourites.
          </p>
          <button onClick={() => setOpen(false)} style={{ marginTop: '10px', background: 'none', border: 'none', color: THEME.purple, cursor: 'pointer', fontSize: '0.75rem' }}>Close</button>
        </div>
      )}
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ signal }) {
  const meta = PATTERN_META[signal.patternType] || { icon: '📊', label: signal.patternType, colour: THEME.textSecondary };
  const risk = riskColour(signal.riskLevel);

  return (
    <div style={{
      background: THEME.panel, border: `1px solid ${risk.border}`,
      borderRadius: '10px', padding: '14px 16px', marginBottom: '8px',
      borderLeft: `4px solid ${meta.colour}`,
      boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
      transition: 'transform 0.2s',
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateX(3px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>{meta.icon}</span>
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: meta.colour }}>{meta.label}</span>
        </div>
        <div style={{
          background: risk.bg, border: `1px solid ${risk.border}`,
          color: risk.text, padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700
        }}>
          {signal.riskLevel} RISK
        </div>
      </div>
      <p style={{ fontSize: '0.78rem', color: THEME.textSecondary, margin: '0 0 10px 0', lineHeight: 1.6 }}>
        {signal.message}
      </p>
      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
        padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px'
      }}>
        <span style={{ fontSize: '0.7rem', color: THEME.textMuted }}>AI Bias:</span>
        <span style={{ fontSize: '0.75rem', color: THEME.neon, fontWeight: 700 }}>→ {signal.biasToward}</span>
        <span style={{ fontSize: '0.7rem', color: THEME.textMuted }}>({signal.biasLabel})</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: THEME.textMuted }}>
          Confidence: <span style={{ color: THEME.yellow }}>{signal.confidence}%</span>
        </span>
      </div>
    </div>
  );
}

// ── Fixture Group ─────────────────────────────────────────────────────────────
function FixtureGroup({ fixtureData }) {
  const [expanded, setExpanded] = useState(true);
  const totalSignals = fixtureData.signals?.length || 0;
  const highRisk = fixtureData.signals?.filter(s => s.riskLevel === 'HIGH').length || 0;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: `1px solid ${THEME.border}`,
      borderRadius: '14px', padding: '16px', marginBottom: '16px'
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: THEME.textPrimary }}>
            {fixtureData.homeTeam} <span style={{ color: THEME.textMuted }}>vs</span> {fixtureData.awayTeam}
          </span>
          {fixtureData.gameTime && (
            <span style={{ fontSize: '0.7rem', color: THEME.textMuted, background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>
              {fixtureData.gameTime}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {highRisk > 0 && (
            <span style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.4)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700 }}>
              {highRisk} HIGH RISK
            </span>
          )}
          <span style={{ background: 'rgba(155,93,229,0.15)', color: THEME.purple, border: '1px solid rgba(155,93,229,0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700 }}>
            {totalSignals} signal{totalSignals !== 1 ? 's' : ''}
          </span>
          <span style={{ color: THEME.textMuted, fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Streak badges */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        {fixtureData.homeStreak?.streakCount >= 2 && (
          <span style={{
            fontSize: '0.68rem', padding: '2px 8px', borderRadius: '8px',
            background: fixtureData.homeStreak.streakType === 'win' ? 'rgba(247,148,29,0.1)' : 'rgba(0,255,157,0.08)',
            color: fixtureData.homeStreak.streakType === 'win' ? THEME.orange : THEME.neon,
            border: `1px solid ${fixtureData.homeStreak.streakType === 'win' ? 'rgba(247,148,29,0.3)' : 'rgba(0,255,157,0.2)'}`
          }}>
            {fixtureData.homeTeam}: {fixtureData.homeStreak.streakCount}× {fixtureData.homeStreak.streakType.toUpperCase()}
          </span>
        )}
        {fixtureData.awayStreak?.streakCount >= 2 && (
          <span style={{
            fontSize: '0.68rem', padding: '2px 8px', borderRadius: '8px',
            background: fixtureData.awayStreak.streakType === 'win' ? 'rgba(247,148,29,0.1)' : 'rgba(0,255,157,0.08)',
            color: fixtureData.awayStreak.streakType === 'win' ? THEME.orange : THEME.neon,
            border: `1px solid ${fixtureData.awayStreak.streakType === 'win' ? 'rgba(247,148,29,0.3)' : 'rgba(0,255,157,0.2)'}`
          }}>
            {fixtureData.awayTeam}: {fixtureData.awayStreak.streakCount}× {fixtureData.awayStreak.streakType.toUpperCase()}
          </span>
        )}
        {fixtureData.homeOverallWinPct !== undefined && (
          <span style={{ fontSize: '0.68rem', color: THEME.textMuted, padding: '2px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            Win%: {fixtureData.homeTeam}={fixtureData.homeOverallWinPct}% | {fixtureData.awayTeam}={fixtureData.awayOverallWinPct}%
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {fixtureData.signals?.map((sig, i) => (
            <SignalCard key={i} signal={sig} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Streak Profile Table ──────────────────────────────────────────────────────
function StreakProfileTable({ profile, loading }) {
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '24px', color: THEME.textMuted }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '8px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⌛</div>
      <div style={{ fontSize: '0.8rem' }}>Computing streak profile across all teams…</div>
    </div>
  );
  if (!profile || profile.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px', color: THEME.textMuted, fontSize: '0.82rem' }}>
      No notable streaks found (3+ games) in this league.
    </div>
  );

  const flagColour = (flag) => {
    if (flag === 'FATIGUE_RISK') return { text: '#f7941d', label: '🔥 FATIGUE' };
    if (flag === 'REVERSAL_DUE') return { text: '#00ff9d', label: '📈 REVERSAL' };
    return { text: THEME.textSecondary, label: '📊 NOTABLE' };
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
            {['Team', 'Streak', 'Length', 'Flag', 'Home Win%', 'Away Win%', 'Recent Form'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: THEME.textMuted, fontWeight: 600, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profile.map((row, i) => {
            const flag = flagColour(row.riskFlag);
            const isWin  = row.streakType === 'win';
            return (
              <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '10px', color: THEME.textPrimary, fontWeight: 600 }}>{row.team}</td>
                <td style={{ padding: '10px', color: isWin ? THEME.orange : THEME.neon }}>
                  {isWin ? '🔥 WIN' : row.streakType === 'loss' ? '📉 LOSS' : '↔ DRAW'}
                </td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    display: 'inline-block', minWidth: '28px', textAlign: 'center',
                    background: isWin ? 'rgba(247,148,29,0.15)' : 'rgba(0,255,157,0.08)',
                    color: isWin ? THEME.orange : THEME.neon,
                    borderRadius: '8px', padding: '2px 8px', fontWeight: 700
                  }}>
                    {row.streakCount}x
                  </span>
                </td>
                <td style={{ padding: '10px', color: flag.text, fontSize: '0.7rem', fontWeight: 700 }}>
                  {flag.label}
                </td>
                <td style={{ padding: '10px', color: row.homeWinPct >= 55 ? THEME.neon : THEME.textSecondary }}>
                  {row.homeWinPct}%
                </td>
                <td style={{ padding: '10px', color: row.awayWinPct >= 40 ? THEME.neon : THEME.textSecondary }}>
                  {row.awayWinPct}%
                </td>
                <td style={{ padding: '10px', fontFamily: 'monospace', letterSpacing: '2px', color: THEME.textSecondary }}>
                  {row.recentForm || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Screenshot Comparison Panel ───────────────────────────────────────────────
function ComparisonPanel({ report }) {
  if (!report) return null;

  const trendColour = report.trend?.includes('STRENGTHENING') ? THEME.neon
    : report.trend?.includes('WEAKENING') ? THEME.red : THEME.yellow;

  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ fontSize: '0.9rem', color: THEME.textPrimary, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        🔍 Screenshot Comparison Analysis
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Latest Matches', value: report.latestMatchCount, colour: THEME.neon },
          { label: 'Previous Matches', value: report.previousMatchCount, colour: THEME.textSecondary },
          { label: 'Home Win % (latest)', value: `${report.latestHomeWinRate}%`, colour: THEME.neon },
          { label: 'Home Win % (prev)', value: `${report.previousHomeWinRate}%`, colour: THEME.textSecondary },
        ].map(stat => (
          <div key={stat.label} style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '0.65rem', color: THEME.textMuted, marginBottom: '6px' }}>{stat.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: stat.colour }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
        <span style={{ fontSize: '0.75rem', color: THEME.textMuted }}>Trend: </span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: trendColour }}>{report.trend}</span>
      </div>

      {report.teamChanges?.length > 0 && (
        <>
          <h4 style={{ fontSize: '0.8rem', color: THEME.textSecondary, marginBottom: '10px' }}>Teams with Result Changes</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {report.teamChanges.map((tc, i) => (
              <div key={i} style={{
                background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: '8px',
                padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontWeight: 600, color: THEME.textPrimary, fontSize: '0.82rem' }}>{tc.team}</span>
                <span style={{ fontSize: '0.72rem', color: THEME.textSecondary, fontFamily: 'monospace' }}>{tc.change}</span>
                <span style={{ fontSize: '0.7rem', color: THEME.textSecondary, maxWidth: '200px', textAlign: 'right' }}>{tc.insight}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main BehaviourPatterns Component ─────────────────────────────────────────
export default function BehaviourPatterns() {
  const [league, setLeague]               = useState('England - Virtual');
  const [loading, setLoading]             = useState(false);
  const [streakLoading, setStreakLoading] = useState(false);
  const [error, setError]                 = useState(null);
  const [signals, setSignals]             = useState([]);
  const [streakProfile, setStreakProfile] = useState([]);
  const [historyDocs, setHistoryDocs]     = useState([]);
  const [activeTab, setActiveTab]         = useState('live');   // live | streak | history
  const [comparison, setComparison]       = useState(null);
  const [liveFixtures, setLiveFixtures]   = useState([]);
  const [scanTime, setScanTime]           = useState(null);

  console.log('[BehaviourPatterns] 🧠 Component mounted. League:', league, '| Tab:', activeTab);

  // ── Fetch live fixtures for the selected league ─────────────────────────
  const fetchLiveFixtures = useCallback(async () => {
    try {
      console.log('[BehaviourPatterns] Fetching live fixtures from /api/scores...');
      const res = await fetch('/api/scores');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json.data || [];
      const leagueGroup = data.find(g =>
        g.league === league || g.league === 'vFootball Live Odds' || g.league?.includes(league.split(' ')[0])
      );
      const fixtures = (leagueGroup?.matches || []).map(m => ({
        homeTeam: m.home,
        awayTeam: m.away,
        gameTime: m.time
      })).filter(f => f.homeTeam && f.awayTeam);
      console.log(`[BehaviourPatterns] Got ${fixtures.length} live fixtures for ${league}`);
      return fixtures;
    } catch (err) {
      console.error('[BehaviourPatterns] Live fixture fetch error:', err.message);
      return [];
    }
  }, [league]);

  // ── Run behaviour analysis ───────────────────────────────────────────────
  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setSignals([]);
    setComparison(null);
    console.log(`[BehaviourPatterns] 🚀 Starting behaviour analysis for ${league}...`);

    try {
      // Step 1: get live fixtures
      const fixtures = await fetchLiveFixtures();
      setLiveFixtures(fixtures);

      if (fixtures.length === 0) {
        setError('No live fixtures found for this league right now. Try again when the live scraper has data, or check the Live Odds tab first.');
        setLoading(false);
        return;
      }

      console.log(`[BehaviourPatterns] Step 2 — Sending ${fixtures.length} fixtures to behaviour analysis API...`);

      // Step 2: run behaviour analysis
      const res = await fetch('/api/vfootball/behaviour-patterns/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league, fixtures })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error ${res.status}`);
      }

      const json = await res.json();
      console.log('[BehaviourPatterns] ✅ Analysis complete:', json);
      setSignals(json.signals || []);
      setComparison(json.comparisonReport || null);
      setScanTime(json.analyzedAt);

    } catch (err) {
      console.error('[BehaviourPatterns] ❌ Analysis failed:', err.message);
      setError(`Analysis failed: ${err.message}. Make sure the server is running and Database is connected.`);
    } finally {
      setLoading(false);
    }
  };

  // ── Load streak profile ──────────────────────────────────────────────────
  const loadStreakProfile = async () => {
    setStreakLoading(true);
    console.log(`[BehaviourPatterns] Loading streak profile for ${league}...`);
    try {
      const res = await fetch(`/api/vfootball/behaviour-patterns?league=${encodeURIComponent(league)}&mode=streak-profile`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStreakProfile(json.streakProfile || []);
      console.log('[BehaviourPatterns] Streak profile loaded:', json.streakProfile?.length, 'teams');
    } catch (err) {
      console.error('[BehaviourPatterns] Streak profile error:', err.message);
      setError(`Streak profile error: ${err.message}`);
    } finally {
      setStreakLoading(false);
    }
  };

  // ── Load saved history from Database ────────────────────────────────────
  const loadHistory = async () => {
    console.log(`[BehaviourPatterns] Loading saved signal history for ${league}...`);
    try {
      const res = await fetch(`/api/vfootball/behaviour-patterns?league=${encodeURIComponent(league)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHistoryDocs(json.history || []);
      console.log('[BehaviourPatterns] History loaded:', json.history?.length, 'docs');
    } catch (err) {
      console.error('[BehaviourPatterns] History load error:', err.message);
    }
  };

  // ── Tab switch effects ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'streak') loadStreakProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (activeTab === 'history') loadHistory();
  }, [activeTab, league]);

  const totalSignalCount = signals.reduce((s, f) => s + (f.signals?.length || 0), 0);
  const highRiskCount    = signals.reduce((s, f) => s + (f.signals?.filter(sig => sig.riskLevel === 'HIGH').length || 0), 0);

  return (
    <div style={{
      background: THEME.bg, minHeight: '100vh', padding: '32px 20px',
      fontFamily: "'Inter', 'Outfit', system-ui, sans-serif", color: THEME.textPrimary
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
                🧬 <span style={{ background: 'linear-gradient(135deg, #f7941d, #9b5de5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Behaviour Patterns
                </span>
              </h1>
              <p style={{ color: THEME.textSecondary, margin: '6px 0 0', fontSize: '0.85rem' }}>
                Statistical anomaly detection · Win streak fatigue · Big team clashes · Loss reversal signals
              </p>
            </div>
            <HowItWorks />
          </div>

          {/* Summary badges */}
          {signals.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(155,93,229,0.12)', border: '1px solid rgba(155,93,229,0.3)', color: THEME.purple, padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                {signals.length} fixture{signals.length !== 1 ? 's' : ''} with signals
              </div>
              <div style={{ background: 'rgba(247,148,29,0.12)', border: '1px solid rgba(247,148,29,0.3)', color: THEME.orange, padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                {totalSignalCount} total signal{totalSignalCount !== 1 ? 's' : ''}
              </div>
              {highRiskCount > 0 && (
                <div style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: THEME.red, padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                  🚨 {highRiskCount} HIGH RISK
                </div>
              )}
              {scanTime && (
                <div style={{ marginLeft: 'auto', fontSize: '0.68rem', color: THEME.textMuted }}>
                  Scanned: {new Date(scanTime).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Controls ───────────────────────────────────────────────────── */}
        <div style={{
          background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: '14px',
          padding: '20px', marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end'
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: THEME.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              League
            </label>
            <select
              id="behaviour-league-select"
              value={league}
              onChange={e => setLeague(e.target.value)}
              style={{
                width: '100%', background: 'rgba(0,0,0,0.4)', border: `1px solid ${THEME.border}`,
                color: THEME.textPrimary, padding: '10px 12px', borderRadius: '8px',
                fontSize: '0.85rem', outline: 'none', cursor: 'pointer'
              }}
            >
              {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <button
            id="btn-scan-behaviour"
            onClick={runAnalysis}
            disabled={loading}
            style={{
              padding: '10px 22px', borderRadius: '8px', border: 'none',
              background: loading ? 'rgba(155,93,229,0.3)' : 'linear-gradient(135deg, #f7941d, #9b5de5)',
              color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(155,93,229,0.35)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⌛</span>
                Scanning patterns…
              </>
            ) : (
              <> 🔬 Scan Behaviour </>
            )}
          </button>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.3)',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
            color: THEME.red, fontSize: '0.82rem', display: 'flex', gap: '10px', alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '4px' }}>
          {[
            { id: 'live',    label: '🔬 Live Signals' },
            { id: 'streak',  label: '📊 Streak Profile' },
            { id: 'history', label: '📋 Signal History' },
          ].map(tab => (
            <button
              key={tab.id}
              id={`bpe-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 400, fontSize: '0.8rem',
                background: activeTab === tab.id ? 'rgba(155,93,229,0.2)' : 'none',
                color: activeTab === tab.id ? THEME.purple : THEME.textSecondary,
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* TAB: Live Signals                                               */}
        {/* ──────────────────────────────────────────────────────────────── */}
        {activeTab === 'live' && (
          <div>
            {signals.length === 0 && !loading && !error && (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                background: THEME.panel, border: `1px dashed ${THEME.border}`, borderRadius: '16px'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🧬</div>
                <p style={{ color: THEME.textMuted, margin: 0, fontSize: '0.88rem' }}>
                  Select a league and click <strong style={{ color: THEME.purple }}>Scan Behaviour</strong> to detect win streak fatigue,
                  big-team clashes, and loss reversal signals from your Database data.
                </p>
                <p style={{ color: THEME.textMuted, margin: '10px 0 0', fontSize: '0.75rem' }}>
                  ✅ All signals are automatically injected into every AI prediction prompt
                </p>
              </div>
            )}

            {signals.length > 0 && (
              <>
                {signals.map((fd, i) => <FixtureGroup key={i} fixtureData={fd} />)}

                {/* Screenshot Comparison */}
                {comparison && <ComparisonPanel report={comparison} />}

                {/* AI Injection Preview */}
                <div style={{
                  marginTop: '24px', background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,255,157,0.2)`,
                  borderRadius: '10px', padding: '14px 16px'
                }}>
                  <p style={{ fontSize: '0.72rem', color: THEME.neon, fontWeight: 700, margin: '0 0 6px' }}>
                    ✅ These signals are automatically injected into prediction prompts
                  </p>
                  <p style={{ fontSize: '0.7rem', color: THEME.textMuted, margin: 0 }}>
                    Every time you run <em>Daily Tips</em> or <em>Predict Live</em>, the AI receives
                    the full set of behaviour signals above. It reduces confidence in streaking favourites
                    and boosts upset probability for reversal teams.
                  </p>
                </div>
              </>
            )}

            {liveFixtures.length > 0 && signals.length === 0 && !loading && (
              <div style={{
                marginTop: '16px', background: THEME.panel, border: `1px solid ${THEME.border}`,
                borderRadius: '10px', padding: '14px',
              }}>
                <p style={{ fontSize: '0.78rem', color: THEME.textSecondary, margin: 0 }}>
                  ✅ Found <strong style={{ color: THEME.neon }}>{liveFixtures.length} live fixtures</strong> but none triggered anomalous patterns.
                  All teams appear to be in normal statistical ranges — straightforward predictions apply.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* TAB: Streak Profile                                              */}
        {/* ──────────────────────────────────────────────────────────────── */}
        {activeTab === 'streak' && (
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: THEME.textPrimary }}>
                📊 Current Win/Loss Streaks — {league}
              </h3>
              <button
                onClick={loadStreakProfile}
                disabled={streakLoading}
                style={{
                  background: 'rgba(155,93,229,0.15)', border: '1px solid rgba(155,93,229,0.3)',
                  color: THEME.purple, padding: '6px 12px', borderRadius: '8px',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                }}
              >
                {streakLoading ? '⌛ Refreshing…' : '🔄 Refresh'}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: THEME.textMuted, marginBottom: '16px' }}>
              Teams on 3+ game streaks. <span style={{ color: THEME.orange }}>🔥 FATIGUE</span> = win streak ≥{4} games.{' '}
              <span style={{ color: THEME.neon }}>📈 REVERSAL</span> = loss streak ≥{4} games (overdue win).
            </p>
            <StreakProfileTable profile={streakProfile} loading={streakLoading} />
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* TAB: Signal History                                              */}
        {/* ──────────────────────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div>
            {historyDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: THEME.textMuted, fontSize: '0.85rem' }}>
                No saved signal history found for {league}.
                Run a behaviour scan above to generate and save signals.
              </div>
            ) : (
              historyDocs.map((doc, i) => (
                <div key={doc.id || i} style={{
                  background: THEME.panel, border: `1px solid ${THEME.border}`,
                  borderRadius: '12px', padding: '16px', marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: THEME.textPrimary, fontSize: '0.85rem' }}>{doc.league}</span>
                      <span style={{ marginLeft: '10px', fontSize: '0.72rem', color: THEME.textMuted }}>{doc.date}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ background: 'rgba(155,93,229,0.12)', color: THEME.purple, border: '1px solid rgba(155,93,229,0.25)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700 }}>
                        {doc.totalSignals} signals
                      </span>
                      {doc.signalTypes?.map(t => (
                        <span key={t} style={{ background: 'rgba(0,0,0,0.3)', color: THEME.textMuted, padding: '2px 8px', borderRadius: '12px', fontSize: '0.6rem' }}>
                          {PATTERN_META[t]?.icon || '📊'} {t.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  {doc.signals?.map((fd, j) => <FixtureGroup key={j} fixtureData={fd} />)}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Loading overlay ───────────────────────────────────────────── */}
        {loading && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(10,11,15,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999, backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: '#12141c', border: `1px solid ${THEME.border}`, borderRadius: '16px',
              padding: '32px 40px', textAlign: 'center', maxWidth: '340px'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px', animation: 'pulse 1.5s infinite' }}>🧬</div>
              <p style={{ color: THEME.textPrimary, fontWeight: 700, margin: '0 0 8px', fontSize: '1rem' }}>
                Scanning Behaviour Patterns
              </p>
              <p style={{ color: THEME.textMuted, margin: 0, fontSize: '0.78rem', lineHeight: 1.6 }}>
                Checking last {15} matches per team for win streaks,
                loss reversals, and big team clash dynamics…
              </p>
              <div style={{ marginTop: '20px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: 'linear-gradient(90deg, #f7941d, #9b5de5)',
                  borderRadius: '2px', animation: 'shimmer 1.5s ease-in-out infinite',
                  backgroundSize: '200% 100%'
                }} />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── CSS animations ─────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@400;700;800&display=swap');
        @keyframes spin    { from { transform: rotate(0deg); }  to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
    </div>
  );
}
