import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// HistoricalResults.jsx
//
// 1. Fully autonomous headless browser runs scrape results on any date.
// 2. After capture, an inline "Upload to Database" panel appears immediately.
// 3. The process completely bypasses screenshot vision dependencies.
// 4. Full 4-stage SSE pipeline runs inline — no need to switch tabs.
// ─────────────────────────────────────────────────────────────────────────────

const LEAGUES = ['England League', 'Spain League', 'Italy League', 'Germany League', 'France League'];
const DB_LEAGUE_NAMES = {
  'England League': 'England - Virtual',
  'Spain League':   'Spain - Virtual',
  'Italy League':   'Italy - Virtual',
  'Germany League': 'Germany - Virtual',
  'France League':  'France - Virtual',
};

const PIPELINE_STEPS = [
  { id: 'dedup',    icon: '🔄', label: 'Database Deduplication',      desc: 'Comparing DOM-extracted Game IDs against local JSON database' },
  { id: 'database', icon: '🔥', label: 'Database Firestore Upload',             desc: 'Batch uploading new records to Database cloud database' },
];

export default function HistoricalResults() {
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0]);
  // Default to today so captures always have a date unless user manually clears it
  const todayISO = new Date().toISOString().split('T')[0]; // e.g. "2026-04-07"
  const [targetDate, setTargetDate]         = useState(todayISO);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [resultData, setResultData]         = useState(null);
  const [syncAllProgress, setSyncAllProgress] = useState(null);
  const [showHowTo, setShowHowTo]           = useState(false);
  const [pendingCount, setPendingCount]     = useState(0);
  const [historyLogs, setHistoryLogs]       = useState({});
  const [expandedDate, setExpandedDate]     = useState(null);
  const [forceUpdate, setForceUpdate]       = useState(false);
  const [processingPending, setProcessingPending] = useState(false);

  const [capturedImages, setCapturedImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Live sync status tracking via SSE
  const [syncLog, setSyncLog] = useState([]);
  const [isSyncActive, setIsSyncActive] = useState(false);
  const syncLogEndRef = React.useRef(null);
  const historyRefreshTimerRef = React.useRef(null);

  // Action badge colours (reuse DailyTips palette)
  const syncActionColor = {
    start: '#A78BFA', fetching: '#00E5FF', tool: '#FFD700',
    analyzing: '#FF6B35', progress: '#A78BFA',
    success: '#00FF88', error: '#FF3355', info: '#94a3b8'
  };

  // Poll for pending (unprocessed) screenshot count
  const checkPending = useCallback(async () => {
    try {
      const res = await fetch('/api/screenshots');
      const data = await res.json();
      if (data.success) {
        setPendingCount(data.screenshots.filter(s => s.isNew).length);
      }
    } catch (e) {
      console.warn('[HistoricalResults] Could not check pending count:', e.message);
    }
  }, []);

  const fetchHistoryLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/vfootball/history-logs');
      const data = await res.json();
      if (data.success) setHistoryLogs(data.logs);
    } catch (e) {
      console.warn('[HistoricalResults] Could not fetch history logs:', e.message);
    }
  }, []);

  // Connect to AI status SSE stream to show live sync progress in Archive Tracker
  useEffect(() => {
    console.log('[HistoricalResults] 📡 Connecting to AI status stream for sync tracking...');
    const es = new EventSource('/api/ai-status-stream');
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        const time = new Date(data.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const isSync = data.action === 'progress' || (data.message || '').toLowerCase().includes('sync') || (data.message || '').toLowerCase().includes('page');
        const isFinal = data.action === 'success' || data.action === 'error';

        if (isSync || data.action === 'tool') {
          setIsSyncActive(true);
          setSyncLog(prev => [...prev.slice(-49), { ...data, displayTime: time }]);

          // Auto-refresh history logs when we receive sync progress messages
          clearTimeout(historyRefreshTimerRef.current);
          historyRefreshTimerRef.current = setTimeout(() => {
            fetchHistoryLogs();
            checkPending();
          }, 2000);
        }

        if (isFinal) {
          setIsSyncActive(false);
          // Final refresh after sync completes
          setTimeout(() => {
            fetchHistoryLogs();
            checkPending();
          }, 3000);
        }
      } catch (e) {
        console.warn('[HistoricalResults] SSE parse error:', e);
      }
    };
    es.onerror = () => console.warn('[HistoricalResults] ⚠️ AI status stream disconnected.');
    return () => {
      es.close();
      clearTimeout(historyRefreshTimerRef.current);
    };
  }, [fetchHistoryLogs, checkPending]);

  // Auto-scroll sync log to bottom
  useEffect(() => {
    syncLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [syncLog]);

  // ── Process Pending Screenshots
  const handleProcessPending = async () => {
    setProcessingPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/vfootball/sync-all');
      await res.json();
      if (!res.ok) throw new Error('Failed to run backend data sync');
      console.log(`[HistoricalResults] Triggered sync-all API`);
    } catch (err) {
      setError(err.message || 'Error communicating with the backend server.');
    } finally {
      setProcessingPending(false);
      await checkPending();
      await fetchHistoryLogs();
    }
  };

  // ── Capture Screenshot
  const handleFetchResults = async (overrideLeague = null, overrideDate = null) => {
    setLoading(true);
    setError(null);
    setResultData(null);
    setCapturedImages([]);
    setCurrentImageIndex(0);
    const targetLg = overrideLeague || selectedLeague;
    const targetDt = overrideDate || targetDate;
    
    console.log(`[HistoricalResults] Capturing: ${targetLg} date=${targetDt || 'today'}`);

    try {
      const params = new URLSearchParams({ league: targetLg });
      if (targetDt) params.append('date', targetDt);
      if (forceUpdate) params.append('force', 'true');
      const response = await fetch(`/api/vfootball/screenshot-results?${params}`);

      if (!response.ok) {
          let errorDetail = `HTTP Error ${response.status}`;
          try {
              const errData = await response.json();
              if (errData && errData.error) errorDetail = errData.error;
          } catch (err) {
              console.warn(`[HistoricalResults] Error parsing JSON from response: ${err.message}`);
          }

          throw new Error(errorDetail);
      }
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Server failed to capture screenshot');

      if (data.fullyAvailable) {
         setResultData({
           league: targetLg,
           image: null,
           matchData: [],
           fullyAvailable: true
         });
         return;
      }

      setCapturedImages([{
          image: data.base64Image,
          league: data.league || targetLg,
          matchData: data.matchData || [],
          tokenStats: data.tokenStats || null
      }]);

      await checkPending();
    } catch (err) {
      console.error('[Database Index Debug/Error Details]: [HistoricalResults]', err.message);
      setError(err.message || 'Error communicating with the backend server.');
    } finally {
      setLoading(false);
      await fetchHistoryLogs();
    }
  };

  // ── Sync All Leagues (Server-Side Orchestration)
  const handleSyncAllLeagues = async () => {
    setLoading(true);
    setError(null);
    setResultData(null);
    setCapturedImages([]);
    setCurrentImageIndex(0);
    console.log(`[HistoricalResults] Triggering Server-Side Sync All for date=${targetDate || 'today'}`);

    try {
      const params = new URLSearchParams();
      if (targetDate) params.append('date', targetDate);
      
      const response = await fetch(`/api/admin/vfootball/sync-all?${params}`);
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to trigger global sync');

      setSyncAllProgress({ details: '✅ Global Sync Triggered! Monitor the status bar for progress.' });
      
      // Auto-trigger a log refresh
      await fetchHistoryLogs();
    } catch (err) {
      console.error('[HistoricalResults Global Sync Error]', err.message);
      setError(err.message || 'Error occurred during global synchronization.');
    } finally {
      setTimeout(() => setSyncAllProgress(null), 3000);
      setLoading(false);
      await checkPending();
      await fetchHistoryLogs();
    }
  };



  return (
    <div className="history-root">

      {/* ── Pending Reminder Banner ────────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(255,154,108,0.08))',
          border: '1px solid rgba(255,107,53,0.35)', borderRadius: '12px',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
          marginBottom: '4px',
        }}>
          <span style={{ fontSize: '1.4rem' }}>🔔</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#ff9a6c' }}>
              {pendingCount} unprocessed batch{pendingCount !== 1 ? 'es' : ''} waiting to be uploaded!
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.65 }}>
              Click the button below to extract match data and push it gracefully to Database.
            </p>
            <button 
              onClick={handleProcessPending} 
              disabled={processingPending}
              style={{
                marginTop: '8px', background: processingPending ? 'rgba(255,107,53,0.3)' : 'linear-gradient(135deg, #ff6b35, #ff9a6c)',
                color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px',
                cursor: processingPending ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.8rem',
                transition: 'all 0.2s'
              }}>
              {processingPending ? '⏳ Processing Pending...' : '🚀 Process Pending Uploads'}
            </button>
          </div>
          <span style={{
            background: 'linear-gradient(135deg, #ff6b35, #ff9a6c)', color: '#000',
            fontWeight: 900, fontSize: '0.75rem', padding: '4px 12px', borderRadius: '20px',
          }}>{pendingCount} PENDING</span>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="history-header glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="history-header-left">
            <div className="history-icon">📸</div>
            <div>
              <h2 className="history-title">Live Snapshot Results</h2>
              <p className="history-subtitle">
                Capture · Upload to Database — all in one flow.
              </p>
            </div>
          </div>
          <button className="how-to-toggle" onClick={() => setShowHowTo(v => !v)}>
            {showHowTo ? '✕ Close' : '⚡ How It Works'}
          </button>
        </div>

        {/* ── League Selector + Date Picker + Capture ───────────────────── */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          {LEAGUES.map(lg => (
            <button key={lg} onClick={() => setSelectedLeague(lg)} disabled={loading}
              style={{
                background: selectedLeague === lg ? 'var(--accent-neon)' : 'transparent',
                color: selectedLeague === lg ? '#000' : 'white',
                border: '1px solid var(--accent-neon)', padding: '8px 16px', borderRadius: '20px',
                cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
                transition: 'all 0.25s ease', opacity: loading ? 0.5 : 1,
              }}>
              {lg.replace(' League', '')}
            </button>
          ))}

          <input id="history-date-picker" type="date" value={targetDate}
            onChange={e => setTargetDate(e.target.value)} disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '0.85rem',
              cursor: 'pointer', colorScheme: 'dark', outline: 'none', opacity: loading ? 0.5 : 1,
            }} />
          {targetDate && targetDate !== todayISO && (
            <button onClick={() => setTargetDate(todayISO)} disabled={loading}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 6px' }}>
              ✕ Reset to Today
            </button>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: forceUpdate ? 'var(--accent-neon)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: '6px', border: forceUpdate ? '1px solid var(--accent-neon)' : '1px solid rgba(255,255,255,0.1)' }}>
             <input type="checkbox" checked={forceUpdate} onChange={(e) => setForceUpdate(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--accent-neon)' }} disabled={loading} />
             Force Refresh
          </label>

          <button id="history-fetch-btn" onClick={() => handleFetchResults()} disabled={loading}
            style={{
              marginLeft: 'auto',
              background: loading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #ffd700, var(--accent-neon))',
              color: '#000', border: 'none', padding: '10px 24px', borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '900', fontSize: '0.95rem',
              boxShadow: loading ? 'none' : '0 4px 15px rgba(0,255,136,0.25)', transition: 'all 0.3s ease',
            }}>
            {loading && !syncAllProgress ? '⏳...' : `⚡ Sync ${selectedLeague.replace(' League', '')}`}
          </button>
          
          <button onClick={handleSyncAllLeagues} disabled={loading}
            style={{
              background: loading ? 'rgba(255,255,255,0.1)' : 'rgba(0, 255, 136, 0.1)',
              color: loading ? 'rgba(255,255,255,0.4)' : 'var(--accent)', 
              border: '1px solid var(--accent)', padding: '10px 24px', borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.95rem',
              transition: 'all 0.3s ease',
            }}>
            {syncAllProgress ? '⏳ Syncing All...' : '🚀 Sync All Leagues'}
          </button>
        </div>
      </div>

      {/* ── How It Works Accordion ─────────────────────────────────────────── */}
      <div className={`how-to-accordion ${showHowTo ? 'how-to-open' : ''}`}>
        <div className="glass-panel how-to-body">
          <h3 className="how-to-heading">Capture → Extract → Upload — How It Works</h3>
          <div className="how-to-steps">
            {[
              { n: 1, label: 'Select League & Date', body: 'Pick any available virtual league. You can optionally pick a specific date to view historical match results.' },
              { n: 2, label: 'Capture Results', body: 'Click Sync to automatically trigger a headless browser to cleanly pull the platform\'s native result table.' },
              { n: 3, label: 'Extract Information', body: 'The data payload is instantly parsed and native match details like team names and exact scores are mapped securely.' },
              { n: 4, label: 'Duplicate Prevention', body: 'We ensure that duplicate matches or overlapping data frames are never uploaded twice.' },
              { n: 5, label: 'Save to Database', body: 'The verified new match records are safely stored in your cloud database, ready to be viewed.' },
            ].map(step => (
              <div key={step.n} className="how-to-step">
                <div className="step-number">{step.n}</div>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live Sync Terminal (visible when sync is active) ──────────────── */}
      {(isSyncActive || syncLog.length > 0) && (
        <div className="glass-panel" style={{ marginTop: '24px', padding: 0, overflow: 'hidden', border: `1px solid ${isSyncActive ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '12px', transition: 'border-color 0.3s ease' }}>
          <div style={{ padding: '12px 18px', background: 'rgba(167,139,250,0.08)', borderBottom: '1px solid rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: isSyncActive ? '#28c840' : '#555' }} />
              </div>
              <span style={{ fontSize: '0.72rem', color: '#A78BFA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>
                {isSyncActive ? '⚡ Sync In Progress — Live Terminal' : '📋 Last Sync Log'}
              </span>
              {isSyncActive && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00FF88', boxShadow: '0 0 8px #00FF88', animation: 'pulse 1.2s infinite' }} />
              )}
            </div>
            {syncLog.length > 0 && !isSyncActive && (
              <button onClick={() => setSyncLog([])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}>Clear</button>
            )}
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(0,0,0,0.4)', minHeight: 50 }}>
            {syncLog.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', paddingTop: 10 }}>Waiting for sync activity...</div>
            ) : (
              syncLog.map((log, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: '0.65rem', flexShrink: 0, marginTop: 2, minWidth: 66 }}>{log.displayTime}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: syncActionColor[log.action] || '#fff', flexShrink: 0, marginTop: 5, boxShadow: `0 0 5px ${syncActionColor[log.action] || '#fff'}` }} />
                  <span style={{ color: syncActionColor[log.action] || 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{log.message}</span>
                </div>
              ))
            )}
            <div ref={syncLogEndRef} />
          </div>
        </div>
      )}

      {/* ── Archive Tracker ─────────────────────────────────────────── */}
      {Object.keys(historyLogs).length > 0 && (
          <div className="glass-panel" style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--accent)' }}>🗂️ Sync Archive Status Tracker</h3>
                <button onClick={fetchHistoryLogs} style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--accent)', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>↺ Refresh</button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   {Object.keys(historyLogs).sort((a,b) => new Date(b) - new Date(a)).map(date => {
                        const isExpanded = expandedDate === date;
                        const leagueMap = historyLogs[date];

                        // History-log keys store scraper league names (e.g. "England League")
                        // Check both scraper names and DB names
                        const TRACKER_LEAGUES = [
                          { scraperName: 'England League', displayName: 'England' },
                          { scraperName: 'Spain League',   displayName: 'Spain' },
                          { scraperName: 'Italy League',   displayName: 'Italy' },
                          { scraperName: 'Germany League', displayName: 'Germany' },
                          { scraperName: 'France League',  displayName: 'France' },
                        ];
                        const totalLeagues = TRACKER_LEAGUES.length;
                        const completedLeagues = TRACKER_LEAGUES.filter(l => leagueMap[l.scraperName]?.status === 'completed').length;
                        let generalColor = completedLeagues === totalLeagues ? 'var(--accent)' : completedLeagues > 0 ? '#ffd700' : '#ff4747';

                        return (
                            <div key={date} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${completedLeagues === totalLeagues ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
                                <div onClick={() => setExpandedDate(isExpanded ? null : date)}
                                     style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderLeft: `4px solid ${generalColor}`, gap: 12 }}>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                       <strong style={{ fontSize: '0.95rem', color: 'white' }}>📅 {date}</strong>
                                       <div style={{ display: 'flex', gap: 4 }}>
                                         {TRACKER_LEAGUES.map(l => {
                                           const lg = leagueMap[l.scraperName];
                                           const done = lg?.status === 'completed';
                                           return (
                                             <span key={l.scraperName} title={l.displayName} style={{ width: 8, height: 8, borderRadius: '50%', background: done ? '#00FF88' : lg ? '#FFD700' : '#333', boxShadow: done ? '0 0 6px #00FF88' : 'none' }} />
                                           );
                                         })}
                                       </div>
                                     </div>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                       <span style={{ fontSize: '0.85rem', color: completedLeagues === totalLeagues ? 'var(--accent)' : 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                                         {completedLeagues}/{totalLeagues} Synced
                                       </span>
                                       <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                                     </div>
                                </div>
                                
                                {isExpanded && (
                                    <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                         <div style={{ paddingBottom: '6px', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}></div>
                                         {TRACKER_LEAGUES.map(({ scraperName, displayName }) => {
                                              const lgData = leagueMap[scraperName];
                                              const isCompleted = lgData?.status === 'completed';
                                              const pagesCount = lgData?.uploadedPages?.length || 0;
                                              return (
                                                  <div key={scraperName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '10px 14px', background: isCompleted ? 'rgba(0,255,136,0.04)' : 'rgba(0,0,0,0.3)', borderRadius: '8px', border: `1px solid ${isCompleted ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)'}` }}>
                                                       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                         <span style={{ fontSize: '1rem' }}>{isCompleted ? '✅' : lgData ? '⏳' : '❌'}</span>
                                                         <span style={{ color: isCompleted ? 'var(--accent)' : lgData ? '#ffd700' : 'rgba(255,255,255,0.4)', fontWeight: isCompleted ? 700 : 400 }}>
                                                            {displayName}
                                                         </span>
                                                       </div>
                                                       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                         {lgData ? (
                                                            isCompleted ? (
                                                              <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                                {pagesCount} page{pagesCount !== 1 ? 's' : ''} synced
                                                              </span>
                                                            ) : (
                                                               <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#ffd700' }}>
                                                                 Pages: [{lgData.uploadedPages?.join(', ') || '—'}]
                                                                 <button onClick={() => handleFetchResults(scraperName, date)} style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>↺ Retry</button>
                                                               </span>
                                                            )
                                                         ) : (
                                                            <span style={{ opacity: 0.35, fontSize: '0.78rem' }}>Not synced</span>
                                                         )}
                                                       </div>
                                                  </div>
                                              );
                                         })}
                                    </div>
                                )}
                            </div>
                        );
                   })}
              </div>
          </div>
      )}

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="glass-panel history-error" style={{ marginTop: '20px' }}>
          <div className="history-error-icon">⚠️</div>
          <div>
            <h4 className="history-error-title">Capture Error</h4>
            <p className="history-error-body">{error}</p>
            <p style={{ marginTop: '6px', fontSize: '0.82rem', opacity: 0.7 }}>
              Common causes: WAF blocking, or the backend server is not running. Check the terminal running <code>node index.js</code>.
            </p>
            <button className="retry-btn" style={{ marginTop: '12px' }} onClick={() => handleFetchResults()}>↺ Try Again</button>
          </div>
        </div>
      )}

      {/* ── Loading State ──────────────────────────────────────────────────── */}
      {loading && !error && (
        <div className="glass-panel" style={{ marginTop: '20px', padding: '48px 40px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 20px' }} />
          <p style={{ color: 'var(--accent-neon)', fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>
            {syncAllProgress
              ? `Syncing all leagues${syncAllProgress.currentLeague ? ` — ${syncAllProgress.currentLeague}` : ''}…`
              : `Syncing ${selectedLeague.replace(' League', '')}${targetDate ? ` · ${targetDate}` : ''}…`}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            {syncAllProgress ? 'All 5 leagues · ~2–5 min' : 'This takes ~15–60 seconds. Please wait.'}
          </p>
        </div>
      )}

      {/* ── Results: Screenshot + Match Cards (Carousel) ─────────────────────────────── */}
      {capturedImages.length > 0 && !loading && !error && (() => {
        const currentData = capturedImages[currentImageIndex];
        return (
        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <React.Fragment>
                <div className="history-league-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '12px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <div className="history-league-bar" />
                     <span>{currentData.league} — Live Snapshot · {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                  
                  {capturedImages.length > 1 && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))} 
                                  disabled={currentImageIndex === 0}
                                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: currentImageIndex === 0 ? 'not-allowed' : 'pointer', opacity: currentImageIndex === 0 ? 0.3 : 1 }}>
                              ◀ Prev
                          </button>
                          <span style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', fontSize: '0.9rem' }}>
                              {currentImageIndex + 1} / {capturedImages.length}
                          </span>
                          <button onClick={() => setCurrentImageIndex(Math.min(capturedImages.length - 1, currentImageIndex + 1))} 
                                  disabled={currentImageIndex === capturedImages.length - 1}
                                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: currentImageIndex === capturedImages.length - 1 ? 'not-allowed' : 'pointer', opacity: currentImageIndex === capturedImages.length - 1 ? 0.3 : 1 }}>
                              Next ▶
                          </button>
                      </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>

                  {/* ── Left: Screenshot ── */}
                  <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>📸</span>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>Authentic Live Screenshot</h3>
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#888' }}>
                        {new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ background: '#050505', padding: '8px', textAlign: 'center' }}>
                      <img src={currentData.image} alt={`Screenshot for ${currentData.league}`}
                        style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px', boxShadow: '0 4px 24px rgba(0,0,0,0.7)' }} />
                    </div>
                  </div>

                  {/* ── Right: Match Cards ── */}
                  <div className="glass-panel" style={{ maxHeight: '620px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🤖</span>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--accent-neon)' }}>Gemini AI Analyzed Match Data</h3>
                    </div>
                    {currentData.tokenStats && (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span><strong>Key Status:</strong> <span style={{ color: '#fbbf24' }}>Active Key {currentData.tokenStats.keyIndex} of {currentData.tokenStats.totalKeys}</span></span>
                              <span><strong>⏱️ Duration:</strong> <span style={{ color: '#4ade80' }}>{(currentData.tokenStats.durationMs / 1000).toFixed(2)}s</span></span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                <span><strong>RPM:</strong> {currentData.tokenStats.rpm || 0} / 5</span>
                                <span><strong>TPM:</strong> {(currentData.tokenStats.tpm || 0).toLocaleString()} / 250K</span>
                                <span><strong>RPD (Today):</strong> <span style={{color: currentData.tokenStats.rpd >= 20 ? '#ef4444' : 'inherit'}}>{currentData.tokenStats.rpd || 0}</span> / 20</span>
                            </div>
                         </div>
                    )}
                    <p style={{ fontSize: '0.78rem', opacity: 0.55, marginBottom: '16px' }}>
                      Auto-synced to Cloud • {currentData.matchData.length} match{currentData.matchData.length !== 1 ? 'es' : ''} parsed
                    </p>
                    {currentData.matchData.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {currentData.matchData.map((match, i) => (
                          <div key={i} style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: '10px', padding: '10px 14px',
                            display: 'grid', gridTemplateColumns: 'minmax(36px, auto) 1fr auto 1fr', gap: '8px', alignItems: 'center',
                          }}>
                            <span style={{ fontSize: '0.72rem', color: '#aaa', fontFamily: 'monospace' }}>{match.time || '--'}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', textAlign: 'right' }}>{match.homeTeam || match.home}</span>
                            <span style={{ border: '1px solid var(--accent-neon)', color: 'var(--accent-neon)', background: 'rgba(0,255,136,0.05)', borderRadius: '6px', padding: '3px 9px', fontSize: '0.72rem', fontFamily: 'monospace', textAlign: 'center' }}>
                              {match.score || match.odds || 'LIVE'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{match.awayTeam || match.away}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '30px 20px', opacity: 0.5 }}>
                        <p style={{ fontSize: '1.5rem' }}>🔍</p>
                        <p>No matches were detected by the AI.</p>
                      </div>
                    )}
                  </div>
                </div>
            </React.Fragment>
        </div>
        );
      })()}

      {/* ── Fully Available Fallback ─────────────────────────────── */}
      {resultData && resultData.fullyAvailable && !loading && !error && (
        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', borderLeft: '4px solid var(--accent)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>✅</div>
                <h3 style={{ margin: 0, color: 'var(--accent)' }}>Fully Available</h3>
                <p style={{ opacity: 0.8, marginTop: '8px', marginBottom: '20px' }}>
                   All historical match data for <strong>{resultData.league}</strong> on {targetDate || 'this date'} has been successfully extracted and uploaded to your cloud database. No further action needed.
                </p>
                <a href={resultData.landingUrl || '/'} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.9rem', fontWeight: 'bold', transition: 'all 0.2s' }}>
                    🔗 Verify Database on Landing Page
                </a>
            </div>
        </div>
      )}


    </div>
  );
}
