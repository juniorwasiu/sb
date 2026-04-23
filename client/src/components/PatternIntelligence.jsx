import React, { useState, useEffect, useCallback } from 'react';

const NEON = '#00E5FF'; const GREEN = '#00FF88'; const GOLD = '#FFD700';
const PURPLE = '#A78BFA'; const RED = '#FF3355'; const ORANGE = '#FF6B35';

const LEAGUES = {
  'England - Virtual': { icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: NEON },
  'Germany - Virtual': { icon: '🇩🇪', color: GOLD },
  'Italy - Virtual':   { icon: '🇮🇹', color: GREEN },
  'Spain - Virtual':   { icon: '🇪🇸', color: RED },
  'France - Virtual':  { icon: '🇫🇷', color: ORANGE },
};
const lc = (lg) => LEAGUES[lg]?.color || PURPLE;
const li = (lg) => LEAGUES[lg]?.icon || '🌐';

function NavBar() {
  const links = [
    { href: '/', label: '📊 Results', color: NEON },
    { href: '/daily-tips', label: '🔮 Daily Tips', color: PURPLE },
    { href: '/pattern-intel', label: '🧠 Pattern Intel', color: GREEN },
    { href: '/behaviour', label: '🧬 Behaviour', color: GOLD },
    { href: '/admin', label: '⚙️ Admin', color: 'rgba(255,255,255,0.4)' },
  ];
  const current = window.location.pathname;
  return (
    <nav style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
      <div style={{ fontWeight: 900, fontSize: '1rem', color: NEON, padding: '14px 16px 14px 0', marginRight: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
        vFootball <span style={{ color: PURPLE }}>Terminal</span>
      </div>
      {links.map(l => (
        <a key={l.href} href={l.href} style={{
          color: current === l.href ? l.color : 'rgba(255,255,255,0.5)',
          fontWeight: current === l.href ? 800 : 500, fontSize: '0.82rem',
          padding: '14px 14px', textDecoration: 'none', whiteSpace: 'nowrap',
          borderBottom: current === l.href ? `2px solid ${l.color}` : '2px solid transparent',
          transition: 'all 0.2s', flexShrink: 0,
        }}>{l.label}</a>
      ))}
    </nav>
  );
}

function OutcomePill({ o }) {
  const colorMap = { 'Win': GREEN, 'Loss': RED, 'Draw': GOLD, 'Over 1.5': NEON, 'Over 2.5': ORANGE, 'GG (BTTS)': PURPLE, 'Home Over 0.5': '#00BFFF', 'Away Over 0.5': '#FF69B4' };
  const c = colorMap[o.label] || NEON;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: `${c}12`, border: `1px solid ${c}40` }}>
      <span style={{ fontSize: '1rem' }}>{o.emoji}</span>
      <div>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: c }}>{o.label}</div>
        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>{o.pct}% · {o.hit}✓ {o.failed}✗</div>
      </div>
    </div>
  );
}

function PatternCard({ pattern, idx }) {
  const [expanded, setExpanded] = useState(false);
  const t = pattern.mostRecentTrigger;
  const c = lc(pattern.league);
  const topOutcome = pattern.eliteOutcomes[0];

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${c}25`, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      {/* Card Header */}
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: `linear-gradient(90deg, ${c}08, transparent)` }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 900, fontFamily: 'monospace', color: c, minWidth: 60, textAlign: 'center', background: `${c}15`, borderRadius: 8, padding: '4px 8px' }}>{pattern.score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', color: c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{li(pattern.league)} {pattern.league.replace(' - Virtual', '')} · <strong style={{color: 'white'}}>{pattern.team}</strong> was {pattern.role}</div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{pattern.sampleSize} samples · {pattern.eliteOutcomes.length} elite outcome{pattern.eliteOutcomes.length > 1 ? 's' : ''}</div>
        </div>
        {topOutcome && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: GREEN }}>{topOutcome.pct}%</div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{topOutcome.emoji} {topOutcome.label}</div>
          </div>
        )}
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1.1rem', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Elite Outcomes */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🎯 Elite Outcomes (Next Match)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pattern.eliteOutcomes.map(o => <OutcomePill key={o.key} o={o} />)}
            </div>
          </div>

          {/* Most Recent Trigger */}
          {t && (
            <div style={{ marginTop: 14, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: `1px solid ${c}20` }}>
              <div style={{ fontSize: '0.65rem', color: c, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 700 }}>📍 Most Recent Trigger — {t.triggerDate} {t.triggerTime}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{t.triggerHomeTeam}</span>
                <span style={{ fontWeight: 900, color: c, fontFamily: 'monospace', padding: '2px 8px', background: `${c}15`, borderRadius: 6 }}>{t.triggerScore}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{t.triggerAwayTeam}</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>({t.team} was {t.triggerRole})</span>
              </div>
            </div>
          )}

          {/* Prediction for Next Match */}
          {t && (
            <div style={{ marginTop: 10, padding: 12, background: `linear-gradient(135deg, ${GREEN}08, rgba(0,0,0,0.3))`, borderRadius: 10, border: `1px solid ${GREEN}30` }}>
              <div style={{ fontSize: '0.65rem', color: GREEN, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 700 }}>🔮 Predicted Signal for {t.team}'s Next Match</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
                Based on {pattern.sampleSize} historical cases where <strong style={{ color: c }}>{pattern.team}</strong> played a match ending <strong style={{ color: c }}>{pattern.score}</strong> as the {pattern.role} team:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pattern.eliteOutcomes.map(o => (
                  <div key={o.key} style={{ padding: '5px 12px', borderRadius: 20, background: `${GREEN}15`, border: `1px solid ${GREEN}40`, fontSize: '0.78rem', fontWeight: 700, color: GREEN }}>
                    {o.emoji} {o.label} — {o.pct}% likely
                  </div>
                ))}
              </div>
              {/* Recent trigger history */}
              {pattern.recentTriggers.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>Recent matches that triggered this pattern:</div>
                  {pattern.recentTriggers.slice(0, 4).map((tr, i) => (
                    <div key={i} style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 8, marginBottom: 3, alignItems: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', minWidth: 70 }}>{tr.triggerDate}</span>
                      <span>{tr.triggerHomeTeam} <strong style={{ color: c }}>{tr.triggerScore}</strong> {tr.triggerAwayTeam}</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>({tr.team})</span>
                      {tr.nextScore && <span style={{ color: GOLD, marginLeft: 'auto' }}>→ next: {tr.nextScore}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PatternIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leagueFilter, setLeagueFilter] = useState('');
  const [minPct, setMinPct] = useState(80);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [sortBy, setSortBy] = useState('pct'); // 'pct' | 'samples'

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ minPct, minSamples: 3 });
      if (leagueFilter) params.set('league', leagueFilter);
      console.log('[PatternIntel] 🔍 Fetching pattern data...', params.toString());
      const res = await fetch(`/api/pattern-intel?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load patterns');
      console.log(`[PatternIntel] ✅ Loaded ${json.totalPatterns} patterns. Range: ${json.dataRange?.from} → ${json.dataRange?.to}`);
      setData(json);
    } catch (err) {
      console.error('[PatternIntel] ❌ Error:', err.message);
      setError(err.message);
    }
    setLoading(false);
  }, [leagueFilter, minPct]);

  useEffect(() => { load(); }, [load]);

  const filteredPatterns = (data?.patterns || []).filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.score.includes(q) && !p.league.toLowerCase().includes(q) && !p.mostRecentTrigger?.team?.toLowerCase().includes(q)) return false;
    }
    if (outcomeFilter) {
      if (!p.eliteOutcomes.some(o => o.label === outcomeFilter)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'pct') return b.eliteOutcomes[0]?.pct - a.eliteOutcomes[0]?.pct;
    return b.sampleSize - a.sampleSize;
  });

  const leagues = data ? [...new Set(data.patterns.map(p => p.league))].sort() : [];
  const allOutcomes = ['Win', 'Loss', 'Draw', 'Over 1.5', 'Over 2.5', 'GG (BTTS)', 'Home Scores', 'Away Scores'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0A0F1E)', fontFamily: 'Inter, sans-serif', color: 'white' }}>
      <NavBar />

      {/* Header */}
      <header style={{ background: `linear-gradient(180deg, rgba(0,255,136,0.06) 0%, transparent 100%)`, borderBottom: '1px solid rgba(0,255,136,0.1)', padding: '32px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN, boxShadow: `0 0 12px ${GREEN}`, animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Pattern Intelligence Engine</span>
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
            🧠 Score <span style={{ color: GREEN, textShadow: `0 0 20px ${GREEN}55` }}>Pattern Intel</span>
          </h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
            Live daily prediction board — patterns triggered by <strong style={{ color: GOLD }}>today's matches</strong> that reach 80-100% probability
          </p>
          {data && (
            <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30`, borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: GOLD }}>{data.today}</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today's Date</div>
              </div>
              {[
                { label: "Today's Signals", value: data.totalPatterns, color: GREEN },
                { label: 'All-Time Patterns', value: data.totalAllTime, color: NEON },
                { label: 'Filtered', value: filteredPatterns.length, color: PURPLE },
              ].map(s => (
                <div key={s.label} style={{ background: `${s.color}10`, border: `1px solid ${s.color}25`, borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>

        {/* How It Works */}
        <div style={{ marginBottom: 20, padding: '14px 18px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 10 }}>
          <div style={{ fontSize: '0.75rem', color: NEON, fontWeight: 700, marginBottom: 6 }}>ℹ️ How This Works — Team Specific Mode</div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            This page only shows patterns where the <strong style={{ color: GOLD }}>trigger match happened today</strong>. When a team plays a match today ending in a specific scoreline, the engine looks at <strong>that exact team's history</strong> and calculates what happens to them in their <strong style={{ color: GREEN }}>next upcoming match</strong> 80-100% of the time. Refreshes with live data on every reload.
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
          <input
            id="pattern-search"
            placeholder="🔍 Search score, league, team..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, padding: '9px 14px', fontSize: '0.82rem', outline: 'none' }}
          />
          <select id="league-filter" value={leagueFilter} onChange={e => { setLeagueFilter(e.target.value); }}
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', outline: 'none' }}>
            <option value="">🌍 All Leagues</option>
            {leagues.map(lg => <option key={lg} value={lg}>{li(lg)} {lg.replace(' - Virtual', '')}</option>)}
          </select>
          <select id="outcome-filter" value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', outline: 'none' }}>
            <option value="">🎯 All Outcomes</option>
            {allOutcomes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select id="sort-filter" value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', outline: 'none' }}>
            <option value="pct">Sort: Highest %</option>
            <option value="samples">Sort: Most Samples</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>Min %:</span>
            <input id="min-pct" type="number" value={minPct} min={70} max={100}
              onChange={e => setMinPct(Number(e.target.value))}
              style={{ width: 60, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, padding: '9px 10px', fontSize: '0.82rem', outline: 'none', textAlign: 'center' }} />
          </div>
          <button id="reload-patterns" onClick={load}
            style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}40`, color: GREEN, borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
            ↺ Reload
          </button>
        </div>

        {/* States */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ width: 44, height: 44, border: `3px solid rgba(0,255,136,0.15)`, borderTopColor: GREEN, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>Scanning database for patterns...</p>
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: 24, textAlign: 'center', background: 'rgba(255,51,85,0.05)', border: '1px solid rgba(255,51,85,0.2)', borderRadius: 12 }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>⚠️</div>
            <div style={{ color: RED, fontWeight: 700, marginBottom: 8 }}>Failed to Load Patterns</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>
            <button onClick={load} style={{ background: RED, color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 700 }}>↺ Retry</button>
          </div>
        )}

        {/* Patterns by League */}
        {!loading && !error && data && (() => {
          const byLeague = {};
          filteredPatterns.forEach(p => { if (!byLeague[p.league]) byLeague[p.league] = []; byLeague[p.league].push(p); });
          return Object.keys(byLeague).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>📭</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>No Active Predictions for Today</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.3)', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
                No matches played today have triggered a high-probability pattern yet. Check back as today's matches roll in, or lower the <strong style={{ color: GOLD }}>Min %</strong> threshold.
              </div>
              {data.totalAllTime > 0 && (
                <div style={{ marginTop: 20, padding: '10px 16px', background: `${NEON}08`, border: `1px solid ${NEON}20`, borderRadius: 8, display: 'inline-block', fontSize: '0.78rem', color: NEON }}>
                  All-time patterns in database: <strong>{data.totalAllTime}</strong>
                </div>
              )}
            </div>
          ) : Object.keys(byLeague).sort().map(lg => (
            <div key={lg} style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 3, height: 24, background: lc(lg), borderRadius: 3 }} />
                <span style={{ fontSize: '1rem', fontWeight: 800, color: lc(lg) }}>{li(lg)} {lg}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', background: `${lc(lg)}15`, padding: '2px 8px', borderRadius: 20, border: `1px solid ${lc(lg)}25` }}>{byLeague[lg].length} patterns</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
              </div>
              {byLeague[lg].map((p, i) => <PatternCard key={`${p.score}-${p.role}-${i}`} pattern={p} idx={i} />)}
            </div>
          ));
        })()}
      </main>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px', textAlign: 'center', marginTop: 40 }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
          Pattern Intelligence Engine · vFootball Terminal ·{' '}
          <a href="/" style={{ color: PURPLE, textDecoration: 'none' }}>Back to Results</a>
        </p>
      </footer>

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}
