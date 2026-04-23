import React, { useState, useEffect, useCallback, useRef } from 'react';
import RecommendedPicks from './RecommendedPicks';

// ── Colour helpers ─────────────────────────────────────────────────────────
const NEON    = '#00E5FF';
const GREEN   = '#00FF88';
const GOLD    = '#FFD700';
const PURPLE  = '#A78BFA';
const RED     = '#FF3355';
const ORANGE  = '#FF6B35';

// ── Known league metadata — any league NOT listed here gets a dynamic fallback
const KNOWN_LEAGUES = {
  'England - Virtual': { icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#00E5FF' },
  'Germany - Virtual': { icon: '🇩🇪', color: '#FFD700' },
  'Italy - Virtual':   { icon: '🇮🇹', color: '#00FF88' },
  'Spain - Virtual':   { icon: '🇪🇸', color: '#FF3355' },
  'France - Virtual':  { icon: '🇫🇷', color: '#FF6B35' },
  'Portugal - Virtual':{ icon: '🇵🇹', color: '#A78BFA' },
  'Netherlands - Virtual': { icon: '🇳🇱', color: '#FF8C00' },
  'Turkey - Virtual':  { icon: '🇹🇷', color: '#FF4500' },
};

// Dynamic colour palette for unknown leagues (cycles through these)
const FALLBACK_COLORS = ['#A78BFA', '#FF6B35', '#00E5FF', '#FFD700', '#00FF88', '#FF3355', '#FF8C00', '#4BD4FB'];
const colorCache = {};

const leagueColor = (lg) => {
  if (KNOWN_LEAGUES[lg]) return KNOWN_LEAGUES[lg].color;
  if (!colorCache[lg]) {
    // Assign a deterministic colour based on string hash
    let hash = 0;
    for (let i = 0; i < lg.length; i++) hash = (hash * 31 + lg.charCodeAt(i)) >>> 0;
    colorCache[lg] = FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
  }
  return colorCache[lg];
};

const leagueIcon = (lg) => KNOWN_LEAGUES[lg]?.icon || '🌐';

// ── Score parser ───────────────────────────────────────────────────────────
function parseScore(score) {
  if (!score || typeof score !== 'string') score = '0:0';
  const [h, a] = score.split(':').map(Number);
  return { home: h || 0, away: a || 0, total: (h || 0) + (a || 0) };
}

// ── Chart config util ──────────────────────────────────────────────────────
const CHART_OPTS = {
  plugins: { legend: { labels: { color: '#7A8AA0', font: { family: 'Inter', size: 11 } } } },
  responsive: true,
  maintainAspectRatio: false,
};

export default function LandingPage() {
  // ── State ────────────────────────────────────────────────────────────────
  const [data,           setData]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [page,           setPage]           = useState(1);
  const [pageSize]                          = useState(3);
  const [leagueFilter,   setLeagueFilter]   = useState('');
  
  // ── Dedicated state for ALL available leagues (never lost when a filter is active)
  const [allLeagues,     setAllLeagues]     = useState([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [allDates,       setAllDates]       = useState([]);
  const [datesLoading,   setDatesLoading]   = useState(true);

  // Date filtering
  const [dateFrom,       setDateFrom]       = useState(''); // YYYY-MM-DD for input
  const [dateTo,         setDateTo]         = useState(''); // YYYY-MM-DD for input
  
  const [expandedDates,  setExpandedDates]  = useState({});
  const [analyzing,      setAnalyzing]      = useState(null); // date string being analyzed
  const [analysisMap,    setAnalysisMap]    = useState({});   // date → analysis object
  const [analysisError,  setAnalysisError]  = useState({});
  const analysisRef = useRef({});
  analysisRef.current = analysisMap;

  // ── Helper: Convert YYYY-MM-DD to DD/MM/YYYY for API ───────────────────────
  const formatForApi = (isoStr) => {
    if (!isoStr) return '';
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const formatToIso = (apiStr) => {
    if (!apiStr) return '';
    const [d, m, y] = apiStr.split('/');
    return `${y}-${m}-${d}`;
  };

  // ── Fetch ALL leagues once on mount (unfiltered — always shows the full list) ─
  useEffect(() => {
    const fetchAllLeagues = async () => {
      setLeaguesLoading(true);
      try {
        console.log('[LandingPage] 🔍 Step 1: Fetching all available leagues from Database...');
        const res = await fetch('/api/public/results?page=1&pageSize=1');
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load leagues');
        setAllLeagues(json.availableLeagues || []);
      } catch {
        setAllLeagues(Object.keys(KNOWN_LEAGUES));
      }
      setLeaguesLoading(false);
    };
    const fetchAllDates = async () => {
        setDatesLoading(true);
        try {
            const res = await fetch('/api/vfootball/available-dates');
            const data = await res.json();
            if (data.success) {
                setAllDates(data.dates || []);
            }
        } catch (err) {
            console.error('[LandingPage] Failed to fetch all dates:', err);
        }
        setDatesLoading(false);
    };
    fetchAllLeagues();
    fetchAllDates();
  }, []); // runs only once on mount

  // ── Fetch paginated results (reacts to filters) ──────────────────────────
  const fetchResults = useCallback(async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, pageSize });
      if (leagueFilter) params.set('league', leagueFilter);
      if (dateFrom) params.set('dateFrom', formatForApi(dateFrom));
      if (dateTo)   params.set('dateTo', formatForApi(dateTo));
      
      console.log(`[LandingPage] 🔍 Step 2: Fetching results page=${p} league=${leagueFilter || 'ALL'} dateFrom=${dateFrom||'ANY'} dateTo=${dateTo||'ANY'}`);
      const res = await fetch(`/api/public/results?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown server error');
      console.log(`[LandingPage] ✅ Step 2 done: ${json.dates.length} date blocks, totalDates=${json.totalDates}, pages=${json.totalPages}`);
      setData(json);

      // Also update allLeagues if the response contains more (e.g. fresh data)
      if (json.availableLeagues && json.availableLeagues.length > allLeagues.length) {
        console.log(`[LandingPage] 🔄 Updating league list from results response: ${json.availableLeagues.length} leagues`);
        setAllLeagues(json.availableLeagues);
      }
      
      // Auto-expand first date if not already set
      setExpandedDates(prev => {
        if (Object.keys(prev).length === 0 && json.dates.length > 0) {
          return { [json.dates[0].date]: true };
        }
        return prev;
      });
    } catch (err) {
      console.error('[LandingPage] ❌ Fetch error:', err);
      setError(err.message);
    }
    setLoading(false);
  }, [page, pageSize, leagueFilter, dateFrom, dateTo, allLeagues.length]);

  useEffect(() => { fetchResults(page); }, [page, fetchResults]);

  // ── Pagination handlers ───────────────────────────────────────────────────
  const goPage = (p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ── Toggle date expansion ─────────────────────────────────────────────────
  const toggleDate = (d) => setExpandedDates(prev => ({ ...prev, [d]: !prev[d] }));

  // ── DeepSeek Analysis ─────────────────────────────────────────────────────
  const analyze = async (dateBlock, scopeType = 'date') => {
    let scope, dateLabel;
    
    if (scopeType === 'today') {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        const todayStr = `${dd}/${mm}/${yy}`;
        if (dateBlock.date !== todayStr) {
           alert("The 'Today Only' analysis is meant for today's results.");
           return;
        }
        scope = 'today';
        dateLabel = "Today's Matches";
    } else if (scopeType === 'range' && (dateFrom || dateTo)) {
        scope = 'range';
        dateLabel = `Range: ${formatForApi(dateFrom) || 'Start'} to ${formatForApi(dateTo) || 'End'}`;
    } else {
        scope = 'date';
        dateLabel = `Specific Date: ${dateBlock.date}`;
    }

    const { date } = dateBlock;

    setAnalyzing(date);
    setAnalysisError(prev => ({ ...prev, [date]: null }));
    console.log(`[LandingPage] Requesting AI Analysis scope=${scope} for ${date}`);

    try {
      console.log(`[LandingPage] 🤖 Step 1: Sending analysis request scope=${scope}, date=${date}...`);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          dateLabel,
          dateFrom: scope === 'range' ? formatForApi(dateFrom) : undefined,
          dateTo:   scope === 'range' ? formatForApi(dateTo)   : undefined,
          league:   leagueFilter || '',
        }),
      });
      const json = await res.json();
      console.log(`[LandingPage] 📨 Analysis API response: status=${res.status}, success=${json.success}, errorType=${json.errorType || 'none'}`);
      
      if (!json.success) {
        // Special handling for Database quota/index error (errorType: FIREBASE_QUOTA)
        if (json.errorType === 'FIREBASE_QUOTA') {
          console.error('[LandingPage] ❌ Database quota/index error detected:', json.error);
          if (json.indexUrl) {
            console.error('[LandingPage] 🔗 CREATE FIREBASE INDEX HERE:', json.indexUrl);
          }
          // Show a clear, friendly message with instructions
          const tipMsg = json.indexUrl
            ? `⚠️ Database needs a composite index to run this query.\n\n👉 Click here to create it:\n${json.indexUrl}\n\nAfter creating the index (takes ~1 min), retry the analysis.`
            : '⚠️ Database quota exceeded or a required index is missing.\n\nThis resets daily. Try again later, or check the server console for the index creation link.';
          throw new Error(tipMsg);
        }
        throw new Error(json.error || 'Analysis failed');
      }
      
      console.log(`[LandingPage] ✅ Analysis complete for ${date}, tokens=${json.tokensUsed}, cached=${json.cached}`);
      setAnalysisMap(prev => ({ ...prev, [date]: json.analysis }));
      // Scroll to analysis
      setTimeout(() => document.getElementById(`analysis-${date}`)?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('[LandingPage] ❌ Analysis error:', err.message);
      setAnalysisError(prev => ({ ...prev, [date]: err.message }));
    }
    setAnalyzing(null);
  };

  // ── Collect all flat matches for a date ───────────────────────────────────
  const allMatchesFor = (dateBlock) => Object.values(dateBlock.leagues).flat();

  // ── Helper UI for quick date selecting ─────────────────────────────────────
  const setToday = () => {
    const d = new Date();
    const iso = d.toISOString().split('T')[0];
    setDateFrom(iso);
    setDateTo(iso);
    setPage(1);
  };
  const clearDates = () => {
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };


  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'Inter, sans-serif' }}>

      {/* ── HERO HEADER ──────────────────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(180deg, rgba(0,229,255,0.06) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(0,229,255,0.1)',
        padding: '0 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN, boxShadow: `0 0 12px ${GREEN}`, animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>High-Speed Native Sync</span>
              </div>
              <h1 style={{ margin: 0, fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                vFootball <span style={{ color: NEON, textShadow: `0 0 20px ${NEON}55` }}>Terminal</span>
              </h1>
              <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Real-time Native Extraction · AI Pattern Memory · Live Database Sync
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Leagues count — always visible, uses allLeagues which is fetched independently */}
                <div style={{
                  background: `${PURPLE}15`, border: `1px solid ${PURPLE}35`,
                  borderRadius: 10, padding: '8px 16px', textAlign: 'center', minWidth: 72,
                }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: PURPLE }}>
                    {leaguesLoading ? '…' : allLeagues.length}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Leagues</div>
                </div>

                {/* Dates found — only when data loaded */}
                {data && (
                  <div style={{
                    background: `${NEON}15`, border: `1px solid ${NEON}35`,
                    borderRadius: 10, padding: '8px 16px', textAlign: 'center', minWidth: 72,
                  }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: NEON }}>{data.totalDates}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dates Found</div>
                  </div>
                )}
              </div>
              <a href="/pattern-intel" style={{
                background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)',
                color: GREEN, borderRadius: 10, padding: '10px 18px',
                textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.12)'}
              >
                🧠 Pattern Intel
              </a>
              <a href="/daily-tips" style={{
                background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.35)',
                color: NEON, borderRadius: 10, padding: '10px 18px',
                textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,229,255,0.12)'}
              >
                🔮 Daily Tips
              </a>
              <a href="/admin" style={{
                background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)',
                color: PURPLE, borderRadius: 10, padding: '10px 18px',
                textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(167,139,250,0.12)'}
              >
                ⚙️ Admin Panel
              </a>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>

        <RecommendedPicks />
        <LivePredictionHub />

        {/* ── FILTERS BAR ──────────────────────────────────────────────────── */}
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* League Filter — always uses allLeagues which is independently fetched */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              League:
              {leaguesLoading && (
                <span style={{ marginLeft: 6, fontSize: '0.68rem', color: NEON, opacity: 0.7 }}>loading…</span>
              )}
              {!leaguesLoading && allLeagues.length > 0 && (
                <span style={{
                  marginLeft: 8, background: `${PURPLE}20`, border: `1px solid ${PURPLE}40`,
                  borderRadius: 20, padding: '2px 8px', fontSize: '0.65rem', color: PURPLE, fontWeight: 800,
                }}>{allLeagues.length} active</span>
              )}
            </span>
            {/* All button */}
            <button
              onClick={() => { setLeagueFilter(''); setPage(1); }}
              style={{
                background: leagueFilter === '' ? NEON : 'rgba(255,255,255,0.04)',
                color: leagueFilter === '' ? '#000' : 'var(--text-secondary)',
                border: `1px solid ${leagueFilter === '' ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 20, padding: '6px 14px', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.2s ease',
              }}
            >🌍 All</button>

            {/* Per-league filter buttons — always renders from allLeagues (independent of page data) */}
            {leaguesLoading && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Discovering leagues…</span>
            )}
            {!leaguesLoading && allLeagues.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: RED, fontStyle: 'italic' }}>⚠️ No leagues found in Database</span>
            )}
            {allLeagues.map(lg => (
              <button key={lg} onClick={() => { setLeagueFilter(lg); setPage(1); }}
                style={{
                  background: leagueFilter === lg ? leagueColor(lg) : 'rgba(255,255,255,0.04)',
                  color: leagueFilter === lg ? '#000' : 'var(--text-secondary)',
                  border: `1px solid ${leagueFilter === lg ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 20, padding: '6px 14px', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.2s ease',
                  boxShadow: leagueFilter === lg ? `0 0 10px ${leagueColor(lg)}55` : 'none',
                }}
              >
                {leagueIcon(lg)} {lg.replace(' - Virtual', '')}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

          {/* Date Filter */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Filter by Date:</span>
            
            <select
              value={dateFrom === dateTo ? dateFrom : ''}
              onChange={(e) => {
                const iso = e.target.value;
                setDateFrom(iso);
                setDateTo(iso);
                setPage(1);
              }}
              style={{
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'white', borderRadius: 6, padding: '7px 12px', fontSize: '0.8rem', outline: 'none',
                cursor: 'pointer', minWidth: '140px'
              }}
              disabled={datesLoading}
            >
              <option value="">🌍 All Available Dates</option>
              {allDates.map(d => (
                <option key={d} value={formatToIso(d)}>{d}</option>
              ))}
            </select>

            <button onClick={setToday} style={{ background: `${GREEN}15`, color: GREEN, border: `1px solid ${GREEN}40`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
              Today
            </button>
            {(dateFrom || dateTo) && (
              <button 
                onClick={() => {
                   clearDates();
                   setPage(1);
                }} 
                style={{ background: 'rgba(255,51,85,0.1)', color: RED, border: `1px solid rgba(255,51,85,0.3)`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
              >
                Clear
              </button>
            )}
          </div>
        </div>


        {/* ── LOADING / ERROR ───────────────────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading match results...</p>
          </div>
        )}

        {error && !loading && (
          <div className="glass-panel" style={{ borderLeft: `4px solid ${RED}`, background: 'rgba(255,51,85,0.05)', textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ color: RED, margin: '0 0 8px' }}>Could Not Load Results</h3>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px', fontSize: '0.88rem' }}>{error}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 16px' }}>Make sure the Node.js server is running on port 3001</p>
            <button onClick={() => fetchResults(page)} style={{ background: RED, color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 700 }}>
              ↺ Retry
            </button>
          </div>
        )}

        {!loading && !error && data?.dates.length === 0 && (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📭</div>
            <h3 style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No Results Found</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {leagueFilter ? `No data for ${leagueFilter}` : 'Trigger a native sync via the Admin panel to populate results'}
            </p>
          </div>
        )}

        {/* ── DATE BLOCKS ───────────────────────────────────────────────────── */}
        {!loading && !error && data?.dates.map((dateBlock) => {
          const isExpanded = expandedDates[dateBlock.date] !== false;
          const matches = allMatchesFor(dateBlock);
          const analysis = analysisMap[dateBlock.date];
          const isAnalyzing = analyzing === dateBlock.date;
          const aError = analysisError[dateBlock.date];

          return (
            <div key={dateBlock.date} className="glass-panel" style={{ marginBottom: '20px', padding: 0, overflow: 'hidden' }}>

              {/* Date header */}
              <div
                onClick={() => toggleDate(dateBlock.date)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '18px 24px', cursor: 'pointer',
                  borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  background: 'linear-gradient(90deg, rgba(0,229,255,0.04) 0%, transparent 100%)',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: 3, height: 36, background: `linear-gradient(180deg, ${NEON}, ${PURPLE})`, borderRadius: 3 }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>📅 {dateBlock.date}</span>
                      <span style={{
                        background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)',
                        borderRadius: 20, padding: '2px 10px', fontSize: '0.7rem', color: NEON, fontWeight: 700,
                      }}>{dateBlock.totalMatches} matches</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                      {Object.keys(dateBlock.leagues).map(lg => (
                        <span key={lg} style={{
                          fontSize: '0.68rem', color: leagueColor(lg), fontWeight: 600,
                          background: `${leagueColor(lg)}15`, borderRadius: 20, padding: '1px 8px',
                        }}>{leagueIcon(lg)} {lg.replace(' - Virtual', '')}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* AI Analysis Dropdown */}
                  <div style={{ position: 'relative' }} className="analyze-dropdown">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        // If no range filter is active, just do the single date.
                        // Otherwise, we can just trigger the single date by default on click,
                        // but provide a dropdown for other options
                        analyze(dateBlock, 'date');
                      }}
                      disabled={isAnalyzing}
                      style={{
                        background: analysis ? 'rgba(0,255,136,0.1)' : 'rgba(167,139,250,0.12)',
                        border: `1px solid ${analysis ? 'rgba(0,255,136,0.3)' : 'rgba(167,139,250,0.3)'}`,
                        color: analysis ? GREEN : PURPLE, borderRadius: '8px 0 0 8px', padding: '7px 14px',
                        cursor: isAnalyzing ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 700,
                        transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '6px',
                        borderRight: 'none'
                      }}
                    >
                      {isAnalyzing ? (
                        <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} /> Analyzing...</>
                      ) : analysis ? '✅ Re-Analyze Date' : '🤖 Analyze Date'}
                    </button>
                    {/* The small dropdown trigger next to the button */}
                    <button
                      style={{
                        background: analysis ? 'rgba(0,255,136,0.05)' : 'rgba(167,139,250,0.05)',
                        border: `1px solid ${analysis ? 'rgba(0,255,136,0.3)' : 'rgba(167,139,250,0.3)'}`,
                        color: analysis ? GREEN : PURPLE, borderRadius: '0 8px 8px 0', padding: '7px 8px',
                        cursor: isAnalyzing ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 700,
                      }}
                      disabled={isAnalyzing}
                      onClick={(e) => {
                        e.stopPropagation();
                        const menu = e.currentTarget.nextElementSibling;
                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                      }}
                      onBlur={(e) => {
                        // Small timeout to allow click to register before hiding
                        const menu = e.currentTarget.nextElementSibling;
                        setTimeout(() => { if (menu) menu.style.display = 'none'; }, 200);
                      }}
                    >▼</button>
                    {/* Dropdown Menu */}
                    <div style={{
                      display: 'none', position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                      background: '#1A2235', border: '1px solid rgba(167,139,250,0.3)',
                      borderRadius: 8, overflow: 'hidden', zIndex: 10, minWidth: 150,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}>
                      <div
                        style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={(e) => { e.stopPropagation(); e.currentTarget.parentElement.style.display = 'none'; analyze(dateBlock, 'today'); }}
                      >📅 Analyze Today Only</div>
                      {(dateFrom || dateTo) && (
                        <div
                          style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#fff', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={(e) => { e.stopPropagation(); e.currentTarget.parentElement.style.display = 'none'; analyze(dateBlock, 'range'); }}
                        >📊 Analyze Filtered Range</div>
                      )}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
                </div>
              </div>


              {/* Match results */}
              {isExpanded && (
                <div style={{ padding: '0 24px 24px' }}>
                  {Object.entries(dateBlock.leagues).map(([lg, lgMatches]) => (
                    <div key={lg} style={{ marginTop: '20px' }}>
                      {/* League header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ width: 20, height: 2, background: leagueColor(lg), borderRadius: 2 }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: leagueColor(lg), textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          {leagueIcon(lg)} {lg}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{lgMatches.length} matches</span>
                      </div>

                      {/* Match table */}
                      <div style={{
                        background: 'rgba(0,0,0,0.2)', borderRadius: 10,
                        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div className="match-row-grid" style={{
                          padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
                        }}>
                          <span>Time</span>
                          <span style={{ textAlign: 'right' }}>Home</span>
                          <span style={{ textAlign: 'center' }}>Score</span>
                          <span>Away</span>
                          <span style={{ textAlign: 'right' }}>ID</span>
                        </div>
                        {/* Rows */}
                        {lgMatches.map((m, i) => {
                          const s = parseScore(m.score);
                          const homeWin = s.home > s.away;
                          const awayWin = s.away > s.home;
                          const draw    = s.home === s.away;
                          return (
                            <div key={m.gameId || i} className="match-row-grid" style={{
                              padding: '11px 16px', alignItems: 'center',
                              borderBottom: i < lgMatches.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                              transition: 'background 0.15s ease',
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                            >
                              {/* Time */}
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: NEON, fontFamily: 'monospace' }}>{m.time}</span>
                              {/* Home */}
                              <span style={{
                                fontSize: '0.88rem', fontWeight: homeWin ? 800 : 400,
                                color: homeWin ? 'white' : 'var(--text-secondary)',
                                textAlign: 'right', paddingRight: 12,
                              }}>
                                {homeWin && <span style={{ marginRight: 4, fontSize: '0.75rem' }}>👑</span>}
                                {m.homeTeam}
                              </span>
                              {/* Score badge */}
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <span style={{
                                  border: `1.5px solid ${draw ? GOLD : homeWin ? GREEN : RED}`,
                                  borderRadius: 6, padding: '4px 12px',
                                  fontSize: '0.88rem', fontWeight: 900, letterSpacing: '0.05em',
                                  color: draw ? GOLD : homeWin ? GREEN : RED,
                                  background: `${draw ? GOLD : homeWin ? GREEN : RED}12`,
                                  fontFamily: 'monospace',
                                }}>{m.score}</span>
                              </div>
                              {/* Away */}
                              <span style={{
                                fontSize: '0.88rem', fontWeight: awayWin ? 800 : 400,
                                color: awayWin ? 'white' : 'var(--text-secondary)',
                                paddingLeft: 12,
                              }}>
                                {m.awayTeam}
                                {awayWin && <span style={{ marginLeft: 4, fontSize: '0.75rem' }}>👑</span>}
                              </span>
                              {/* Game ID */}
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'monospace' }}>#{m.gameId}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Quick stats bar */}
                  <QuickStats matches={matches} />

                  {/* AI Analysis error */}
                  {aError && (
                    <div style={{ marginTop: 16, background: 'rgba(255,51,85,0.06)', border: '1px solid rgba(255,51,85,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                      <span style={{ color: RED, fontSize: '0.83rem' }}>❌ Analysis failed: {aError}</span>
                    </div>
                  )}

                  {/* AI Analysis panel */}
                  {analysis && (
                    <AnalysisPanel id={`analysis-${dateBlock.date}`} analysis={analysis} date={dateBlock.date} matches={matches} />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── PAGINATION ──────────────────────────────────────────────────── */}
        {data && data.totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => goPage(1)} disabled={page === 1}
              style={paginBtn(page === 1)}>«</button>
            <button onClick={() => goPage(page - 1)} disabled={page === 1}
              style={paginBtn(page === 1)}>‹ Prev</button>

            {Array.from({ length: data.totalPages }, (_, i) => i + 1)
              .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === data.totalPages)
              .reduce((acc, p, i, arr) => {
                if (i > 0 && arr[i - 1] !== p - 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => p === '...'
                ? <span key={`e${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px' }}>…</span>
                : <button key={p} onClick={() => goPage(p)}
                    style={{ ...paginBtn(false), ...(p === page ? { background: NEON, color: '#000', borderColor: NEON } : {}) }}>
                    {p}
                  </button>
              )
            }

            <button onClick={() => goPage(page + 1)} disabled={page === data.totalPages}
              style={paginBtn(page === data.totalPages)}>Next ›</button>
            <button onClick={() => goPage(data.totalPages)} disabled={page === data.totalPages}
              style={paginBtn(page === data.totalPages)}>»</button>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
              Page {page} of {data.totalPages} · {data.totalDates} dates total
            </span>
          </div>
        )}
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '24px', textAlign: 'center', marginTop: '40px' }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          vFootball Terminal · Real-time results powered by AI extraction ·{' '}
          <a href="/admin" style={{ color: PURPLE, textDecoration: 'none' }}>Admin</a>
        </p>
      </footer>
    </div>
  );
}

// ── Pagination button style helper ─────────────────────────────────────────
function paginBtn(disabled) {
  return {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    borderRadius: 8, padding: '7px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.2s ease',
    opacity: disabled ? 0.4 : 1,
  };
}

// ── Quick stats bar ────────────────────────────────────────────────────────
function QuickStats({ matches }) {
  const stats = matches.reduce((acc, m) => {
    const s = parseScore(m.score);
    acc.total += s.total;
    if (s.home > s.away) acc.homeWins++;
    else if (s.away > s.home) acc.awayWins++;
    else acc.draws++;
    return acc;
  }, { total: 0, homeWins: 0, awayWins: 0, draws: 0 });

  const avg = matches.length > 0 ? (stats.total / matches.length).toFixed(1) : 0;

  return (
    <div className="stats-grid-mobile">
      {[
        { label: 'Avg Goals/Match', value: avg, color: NEON },
        { label: 'Home Wins', value: stats.homeWins, color: GREEN },
        { label: 'Draws', value: stats.draws, color: GOLD },
        { label: 'Away Wins', value: stats.awayWins, color: RED },
      ].map(s => (
        <div key={s.label} style={{
          background: `${s.color}08`, border: `1px solid ${s.color}25`,
          borderRadius: 10, padding: '10px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── AI Predictive Engine Panel ──────────────────────────────────────────────
function AnalysisPanel({ id, analysis, date, matches }) {
  if (!analysis) return null;

  return (
    <div id={id} style={{
      marginTop: 20,
      background: 'linear-gradient(135deg, rgba(167,139,250,0.04) 0%, rgba(0,0,0,0.4) 100%)',
      border: '1px solid rgba(167,139,250,0.3)', borderRadius: 12, overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '16px 20px', borderBottom: '1px solid rgba(167,139,250,0.1)',
        background: 'rgba(167,139,250,0.08)',
      }}>
        <span style={{ fontSize: '1.4rem', marginRight: 12 }}>🤖</span>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: PURPLE, letterSpacing: '0.04em' }}>DeepSeek AI Predictive Engine</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{date} · {matches.length} matches analyzed in memory</div>
        </div>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── Summary ── */}
        <div style={{
            fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6,
            padding: '16px', background: 'rgba(255,255,255,0.03)',
            borderLeft: `4px solid ${PURPLE}`, borderRadius: '4px 10px 10px 4px',
        }}>{analysis.summary}</div>

        {/* ── AI Self-Reflection & Strategy ── */}
        {(analysis.reflection || analysis.strategyCommand) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '16px' }}>
                {analysis.reflection && (
                    <div style={{ padding: '16px', background: 'rgba(255,215,0,0.05)', border: `1px solid ${GOLD}40`, borderRadius: 10 }}>
                        <div style={{ fontSize: '0.75rem', color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>🧠</span> Past Prediction Reflection
                        </div>
                        <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                            {analysis.reflection}
                        </p>
                    </div>
                )}
                {analysis.strategyCommand && (
                    <div style={{ padding: '16px', background: 'rgba(0,229,255,0.05)', border: `1px solid ${NEON}40`, borderRadius: 10 }}>
                        <div style={{ fontSize: '0.75rem', color: NEON, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>⚙️</span> Strategy Pulse
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'white', marginBottom: '8px' }}>
                            Action: <strong style={{ color: analysis.strategyCommand.action === 'pivot' ? RED : GREEN, textTransform: 'uppercase' }}>{analysis.strategyCommand.action}</strong>
                        </div>
                        {(analysis.strategyCommand.newRules || []).length > 0 && analysis.strategyCommand.action === 'pivot' && (
                            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                                {analysis.strategyCommand.newRules.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                        )}
                        {analysis.strategyCommand.action === 'maintain' && (
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Maintaining current trajectory and constraints.</p>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* ── Draw Analysis ── */}
        {analysis.drawAnalysis && (
            <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>🤝 Specific Draw Analysis</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ background: '#111', padding: '12px', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{analysis.drawAnalysis['0:0'] || 0}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>0:0 DRAWS</div>
                    </div>
                    <div style={{ background: '#111', padding: '12px', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{analysis.drawAnalysis['1:1'] || 0}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>1:1 DRAWS</div>
                    </div>
                    <div style={{ background: '#111', padding: '12px', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{analysis.drawAnalysis['2:2'] || 0}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>2:2 DRAWS</div>
                    </div>
                </div>
                {analysis.drawAnalysis.insights && (
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
                        {analysis.drawAnalysis.insights}
                    </div>
                )}
            </div>
        )}

        {/* ── Betting Predictions Engine ── */}
        {analysis.bettingPredictions && (
            <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>🎯 Predictive Targets</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    
                    <div style={{ padding: '14px', background: 'rgba(0,255,136,0.05)', border: `1px solid ${GREEN}40`, borderRadius: 10 }}>
                        <div style={{ fontSize: '0.7rem', color: GREEN, fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>OVER 1.5 GOALS</div>
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: 1.5 }}>{analysis.bettingPredictions.over1_5 || 'No specific targets.'}</div>
                    </div>

                    <div style={{ padding: '14px', background: 'rgba(255,107,53,0.05)', border: `1px solid ${ORANGE}40`, borderRadius: 10 }}>
                        <div style={{ fontSize: '0.7rem', color: ORANGE, fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>OVER 2.5 GOALS</div>
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: 1.5 }}>{analysis.bettingPredictions.over2_5 || 'No specific targets.'}</div>
                    </div>

                    <div style={{ padding: '14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>BOTH TEAMS TO SCORE (GG)</div>
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: 1.5 }}>{analysis.bettingPredictions.GG || 'No specific targets.'}</div>
                    </div>

                    <div style={{ padding: '14px', background: 'rgba(167,139,250,0.05)', border: `1px solid ${PURPLE}40`, borderRadius: 10 }}>
                        <div style={{ fontSize: '0.7rem', color: PURPLE, fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>CORRECT SCORE</div>
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: 1.5 }}>{analysis.bettingPredictions.correctScore || 'No specific targets.'}</div>
                    </div>

                </div>
            </div>
        )}

      </div>
    </div>
  );
}

// ── Live Prediction Hub ──────────────────────────────────────────────────────
function LivePredictionHub() {
  const LEAGUES = ['England - Virtual', 'Germany - Virtual', 'Italy - Virtual', 'Spain - Virtual'];
  const [league, setLeague] = useState(LEAGUES[0]);
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState(null);

  const handlePredict = async () => {
      if(!homeTeam || !awayTeam) return alert('Enter both teams!');
      setPredicting(true);
      console.log(`[LivePredictionHub] Requesting venue-aware prediction: ${homeTeam} (HOME) vs ${awayTeam} (AWAY) in ${league}`);
      try {
          const rs = await fetch('/api/vfootball/predict-live', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ league, homeTeam, awayTeam })
          });
          const data = await rs.json();
          if(data.success) {
              setResult(data.prediction);
              console.log(`[LivePredictionHub] ✅ Prediction received. match_winner=${data.prediction.match_winner} winner_team=${data.prediction.winner_team_name}`);
          } else {
              console.error('[LivePredictionHub] Prediction failed:', data.error);
              alert('Prediction failed: ' + data.error);
          }
      } catch(err) {
          console.error('[LivePredictionHub] Network error:', err.message);
          alert('Error predicting: ' + err.message);
      }
      setPredicting(false);
  };

  return (
      <div style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(0,0,0,0.8) 100%)', border: `1px solid ${GREEN}40`, borderRadius: 12, overflow: 'hidden' }}>
          
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${GREEN}20`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>🎯</span>
                  <div>
                      <div style={{ color: GREEN, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Match Predictor</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Uses Home/Away Win% · H2H Venue Bias · League Baseline — <span style={{ color: ORANGE, fontWeight: 700 }}>Odds never used</span>
                      </div>
                  </div>
              </div>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
              <select value={league} onChange={e => setLeague(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, outline: 'none', minWidth: 200 }}>
                  {LEAGUES.map(l => <option key={l} value={l}>{l.replace(' - Virtual', '')}</option>)}
              </select>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                  <input type="text" placeholder="Home Team (e.g. Arsenal)" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, outline: 'none' }} />
                  <strong style={{ color: 'var(--text-muted)' }}>VS</strong>
                  <input type="text" placeholder="Away Team (e.g. Chelsea)" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, outline: 'none' }} />
              </div>

              <button onClick={handlePredict} disabled={predicting} style={{ padding: '10px 24px', background: GREEN, color: '#000', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer', opacity: predicting ? 0.7 : 1 }}>
                  {predicting ? 'Computing...' : 'Predict Match'}
              </button>
          </div>

          {result && (() => {
            // match_winner is 'Home', 'Away', or 'Draw' — NOT a team name
            const winnerColor = result.match_winner === 'Home' ? GREEN
                              : result.match_winner === 'Away' ? ORANGE
                              : GOLD;
            const winnerEmoji = result.match_winner === 'Home' ? '🏠'
                              : result.match_winner === 'Away' ? '🛘'
                              : '🤝';
            return (
              <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Analysis text + confidence */}
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, borderLeft: `4px solid ${GREEN}` }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#fff', lineHeight: 1.5 }}>{result.predictionText}</p>
                      <div style={{ fontSize: '0.7rem', color: GOLD, fontWeight: 800, letterSpacing: '0.04em', marginTop: 8 }}>CONFIDENCE: {result.confidenceScore}/100</div>
                  </div>

                  {/* Match Winner venue pill */}
                  {result.match_winner && (
                    <div style={{ background: `${winnerColor}10`, border: `1px solid ${winnerColor}50`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: '1.6rem' }}>{winnerEmoji}</span>
                      <div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Predicted Match Outcome</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: winnerColor }}>
                          {result.match_winner} Win
                          {result.winner_team_name && <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400, fontSize: '0.82rem', marginLeft: 8 }}>({result.winner_team_name})</span>}
                        </div>
                        {result.winner_reasoning && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{result.winner_reasoning}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bet markets grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: '10px' }}>
                      <div style={{ padding: '12px', background: '#111', border: `1px solid ${NEON}40`, borderRadius: 8 }}>
                          <div style={{ fontSize: '0.65rem', color: NEON, fontWeight: 800, marginBottom: 6 }}>OVER 1.5 GOALS</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>{result.over1_5}</div>
                      </div>
                      <div style={{ padding: '12px', background: '#111', border: `1px solid ${ORANGE}40`, borderRadius: 8 }}>
                          <div style={{ fontSize: '0.65rem', color: ORANGE, fontWeight: 800, marginBottom: 6 }}>OVER 2.5 GOALS</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>{result.over2_5}</div>
                      </div>
                      <div style={{ padding: '12px', background: '#111', border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 8 }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: 6 }}>GG (BOTH TO SCORE)</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>{result.GG}</div>
                      </div>
                      <div style={{ padding: '12px', background: '#111', border: `1px solid ${PURPLE}40`, borderRadius: 8 }}>
                          <div style={{ fontSize: '0.65rem', color: PURPLE, fontWeight: 800, marginBottom: 6 }}>CORRECT SCORE</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>{result.correctScore}</div>
                      </div>
                  </div>

                  {/* How this prediction was made */}
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, lineHeight: 1.6 }}>
                    ℹ️ <strong>How this works:</strong> The AI fetched {homeTeam}&apos;s <strong>HomeWin%</strong>, {awayTeam}&apos;s <strong>AwayWin%</strong>,
                    head-to-head venue bias, and the {league} home/away baseline — then predicted using these stats only. <span style={{ color: ORANGE }}>Betting odds were excluded.</span>
                  </div>
              </div>
            );
          })()}

      </div>
  );
}
