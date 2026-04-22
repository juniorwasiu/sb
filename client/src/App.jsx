import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import ScoreBoard from './components/ScoreBoard';
import HowToGuide from './components/HowToGuide';
import HistoricalResults from './components/HistoricalResults';
import LandingPage from './components/LandingPage';
import DailyTips from './components/DailyTips';
import AILog from './components/AILog';
import BehaviourPatterns from './components/BehaviourPatterns';
import ServerHealthWidget from './components/ServerHealthWidget';
import LeagueIntelligencePanel from './components/LeagueIntelligencePanel';
import './index.css';

// ── Live scores SSE hook ──────────────────────────────────────────────────────
// Connects to /api/live-stream via Server-Sent Events (SSE).
// The server PUSHES data on every scraper update — no polling needed.
// Falls back to a 60s polling heartbeat to handle reconnects gracefully.
function useLiveScores(enabled = true) {
  const [scores,      setScores]      = useState([]);
  const [status,      setStatus]      = useState('loading');   // loading | initializing | live | error
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error,       setError]       = useState(null);
  const [batchId,     setBatchId]     = useState(null);

  // Handle a data payload (shared between SSE and fallback poll)
  const handlePayload = (json) => {
    const scraperStatus = json.status;
    const rawData       = json.data || [];

    console.log(`[LiveScores] 📡 Received update — ${rawData.length} league groups, status=${scraperStatus}`);

    if (scraperStatus === 'initializing') {
      setStatus('initializing');
      setScores([]);
      setBatchId(null);
    } else {
      setStatus('live');
      setScores(rawData);
      // Compute batchId from all match codes — changes when the lineup rotates
      const currentBatchId = rawData.flatMap(l => (l.matches || []).map(m => m.code)).join('-');
      if (currentBatchId) setBatchId(currentBatchId);
    }
    setLastUpdated(new Date());
    setError(null);
  };

  useEffect(() => {
    if (!enabled) return;

    console.log('[LiveScores] 🚀 Connecting to /api/live-stream (SSE)...');
    let es;
    let fallbackTimer;

    const connect = () => {
      try {
        es = new EventSource('/api/live-stream');

        es.onmessage = (evt) => {
          try {
            const json = JSON.parse(evt.data);
            handlePayload(json);
          } catch (parseErr) {
            console.warn('[LiveScores] SSE parse error:', parseErr);
          }
        };

        es.onerror = (evt) => {
          console.warn('[LiveScores] ⚠️ SSE connection error — will auto-reconnect.', evt);
          setStatus('error');
          setError('Live stream disconnected. Reconnecting...');
          // Browser auto-reconnects SSE on error — no manual action needed.
          // Set a fallback timer to poll /api/scores once in case SSE is blocked.
          clearTimeout(fallbackTimer);
          fallbackTimer = setTimeout(fallbackPoll, 8000);
        };

        es.onopen = () => {
          console.log('[LiveScores] ✅ SSE connection established.');
        };
      } catch (err) {
        console.error('[LiveScores] ❌ SSE not supported, falling back to polling:', err);
        fallbackPoll();
      }
    };

    // Fallback: poll /api/scores directly when SSE is unavailable / blocked
    const fallbackPoll = async () => {
      try {
        console.log('[LiveScores] 🔄 Fallback polling /api/scores...');
        const res = await fetch('/api/scores');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'API error');
        handlePayload({ data: json.data || [], status: json.status || 'live' });
      } catch (err) {
        console.error('[LiveScores] ❌ Fallback poll error:', err.message);
        setStatus('error');
        setError(err.message);
      }
    };

    connect();

    // 60s heartbeat poll — catches cases where SSE stalls silently
    const heartbeat = setInterval(fallbackPoll, 60000);

    return () => {
      console.log('[LiveScores] 🛑 Closing SSE connection.');
      if (es) es.close();
      clearTimeout(fallbackTimer);
      clearInterval(heartbeat);
    };
  }, [enabled]);

  return { scores, status, lastUpdated, error, batchId };
}




// ── League Management Panel ──────────────────────────────────────────────────
function LeagueManager() {
  const [leagues, setLeagues] = useState([]);
  const [leagueDates, setLeagueDates] = useState({}); // league -> dates[]
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null); // stores league name being deleted
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false); // active deletion in progress
  const [selectedDate, setSelectedDate] = useState(''); // '' means ALL
  const [syncStatus, setSyncStatus] = useState(''); // Global status message
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const fetchLeagues = async () => {
    try {
      const res = await fetch('/api/vfootball/available-dates');
      const data = await res.json();
      if (data.success) {
        setLeagues(data.availableLeagues || []);
      }
    } catch (err) {
      console.error('[LeagueManager] Failed to fetch leagues:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatesForLeague = async (league) => {
    if (leagueDates[league]) return; // already have them
    try {
      const res = await fetch(`/api/vfootball/available-dates?league=${encodeURIComponent(league)}`);
      const data = await res.json();
      if (data.success) {
        setLeagueDates(prev => ({ ...prev, [league]: data.dates || [] }));
      }
    } catch (err) {
      console.error(`[LeagueManager] Failed to fetch dates for ${league}:`, err);
    }
  };

  useEffect(() => {
    fetchLeagues();
  }, []);

  const handleDelete = async (league) => {
    const dateParam = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : '';
    setIsDeletingConfirm(true);
    setSyncStatus(`Deleting ${league}...`);
    try {
      const res = await fetch(`/api/admin/league/${encodeURIComponent(league)}${dateParam}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSyncStatus(`✅ ${data.message}`);
        fetchLeagues();
        setDeleting(null);
        setSelectedDate('');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('[LeagueManager] Delete failed:', err);
      setSyncStatus(`❌ Delete failed: ${err.message}`);
    } finally {
      setIsDeletingConfirm(false);
    }
  };

  const handleSyncAll = async () => {
    if (!window.confirm('Trigger full native sync for all 4 primary leagues? This will update thousands of records.')) return;
    setIsSyncingAll(true);
    setSyncStatus('🚀 Starting Global Auto-Sync...');
    try {
      const res = await fetch('/api/admin/vfootball/sync-all');
      const data = await res.json();
      if (data.success) {
        setSyncStatus('✅ Global Sync Complete!');
        fetchLeagues();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('[LeagueManager] Sync All failed:', err);
      setSyncStatus(`❌ Sync failed: ${err.message}`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  if (loading) return <div className="glass-panel" style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading leagues...</div>;

  return (
    <div className="glass-panel" style={{ padding: '20px', border: '1px solid var(--glass-border)', position: 'relative', overflow: 'hidden' }}>
      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏆</span> Manage Leagues
        </div>
        <button 
           onClick={handleSyncAll}
           disabled={isSyncingAll || isDeletingConfirm}
           style={{
             background: 'var(--accent-purple)', color: 'white', border: 'none',
             padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700,
             cursor: 'pointer', opacity: (isSyncingAll || isDeletingConfirm) ? 0.5 : 1
           }}
        >
           {isSyncingAll ? 'Syncing...' : '🚀 Sync All'}
        </button>
      </h3>

      {syncStatus && (
          <div style={{ 
              fontSize: '0.7rem', padding: '8px', background: 'rgba(0,0,0,0.3)', 
              borderRadius: '6px', marginBottom: '12px', color: 'var(--accent-neon)',
              border: '1px solid rgba(0, 255, 157, 0.2)', animation: 'pulse 2s infinite'
          }}>
              {syncStatus}
          </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: (isDeletingConfirm || isSyncingAll) ? 0.5 : 1, pointerEvents: (isDeletingConfirm || isSyncingAll) ? 'none' : 'auto' }}>
        {leagues.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>No active leagues found.</div>
        ) : (
          leagues.map(lg => (
            <div key={lg} style={{ 
              display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', 
              borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{lg}</span>
                <button
                  onClick={() => {
                    if (deleting === lg) {
                      setDeleting(null);
                      setSelectedDate('');
                    } else {
                      setDeleting(lg);
                      setSelectedDate('');
                      fetchDatesForLeague(lg);
                    }
                  }}
                  style={{
                    background: deleting === lg ? 'var(--text-muted)' : 'rgba(255, 71, 71, 0.1)',
                    color: deleting === lg ? 'white' : '#ff4747',
                    border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer'
                  }}
                >
                  {deleting === lg ? 'Cancel' : 'Delete'}
                </button>
              </div>

              {deleting === lg && (
                <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(255, 71, 71, 0.05)', borderRadius: '6px', border: '1px solid rgba(255, 71, 71, 0.2)' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Scope:
                    </label>
                    <select
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      style={{
                        width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                        color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', outline: 'none'
                      }}
                    >
                      <option value="">Full History (Deep Wipe)</option>
                      {leagueDates[lg]?.map(d => (
                        <option key={d} value={d}>Only {d}</option>
                      ))}
                    </select>
                  </div>

                  <p style={{ fontSize: '0.7rem', color: '#ff4747', marginBottom: '12px', fontWeight: 600 }}>
                    ⚠️ {selectedDate ? `Surgical Wipe: Only ${selectedDate} will be deleted.` : 'CRITICAL: This wipes all matches, AI intelligence, and tips for this league.'}
                  </p>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (window.confirm(selectedDate ? `Are you sure you want to delete data for ${lg} on ${selectedDate}?` : `ARE YOU ABSOLUTELY SURE? This will deep-wipe ALL data for ${lg}.`)) {
                          handleDelete(lg);
                        }
                      }}
                      disabled={isDeletingConfirm}
                      style={{
                        flex: 1, background: '#ff4747',
                        color: 'white', border: 'none', padding: '10px 12px', borderRadius: '4px',
                        fontSize: '0.8rem', fontWeight: 700, cursor: isDeletingConfirm ? 'default' : 'pointer',
                        transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(255, 71, 71, 0.2)',
                        opacity: isDeletingConfirm ? 0.7 : 1
                      }}
                    >
                      {isDeletingConfirm ? 'DELETING...' : (selectedDate ? `CONFIRM DELETE: ${selectedDate}` : 'CONFIRM DEEP WIPE')}
                    </button>
                    <button
                      onClick={() => setDeleting(null)}
                      style={{
                        background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                        border: '1px solid var(--glass-border)', padding: '10px 12px', borderRadius: '4px',
                        fontSize: '0.8rem', cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('history');

  // Only poll when on the live tab to avoid unnecessary requests
  const isLiveTab = activeTab === 'live';
  const { scores, status, lastUpdated, error, batchId } = useLiveScores(isLiveTab);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px', display: 'flex', gap: '32px', flexDirection: 'column' }}>
      <header>
        {/* Admin breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textDecoration: 'none' }}>← Public Dashboard</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <Link to="/daily-tips" style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', textDecoration: 'none' }}>🧠 Daily Tips</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <Link to="/behaviour" style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', textDecoration: 'none' }}>🧬 Behaviour</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <span style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', fontWeight: 700 }}>⚙️ Admin</span>
        </div>

        <h1 style={{ fontSize: '3rem', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
          <span className="pulse-dot"></span> vFootball <span className="glow-text">Terminal</span>
          <span style={{ fontSize: '1rem', marginLeft: '12px', color: 'var(--accent-purple)', fontWeight: 600 }}>Admin</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-neon)', fontWeight: 700, background: 'rgba(0,255,136,0.08)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0,255,136,0.2)', fontSize: '0.82rem' }}>⚡ HIGH SPEED NATIVE SYNC</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Direct DOM extraction · No AI Vision · Zero token cost</span>
        </p>

        <div style={{ marginTop: '20px' }}>
           <ServerHealthWidget />
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '24px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
          {[
            { id: 'live',    label: '📡 Live Odds' },
            { id: 'history', label: '📋 Results' },
          ].map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', fontSize: '1.2rem', cursor: 'pointer',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                borderBottom: activeTab === tab.id ? '3px solid var(--accent-neon)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="dashboard-layout">
        <main>
          {activeTab === 'live'    && <ScoreBoard scores={scores} status={status} lastUpdated={lastUpdated} pollError={error} batchId={batchId} />}
          {activeTab === 'history' && <HistoricalResults />}
        </main>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <LeagueManager />
          <LeagueIntelligencePanel />
          {activeTab === 'live'    && <HowToGuide activeTab={activeTab} />}
          {activeTab === 'history' && <AILog />}
        </aside>
      </div>
    </div>
  );
}

// ── Root App with routing ────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      <Route path="/"          element={<LandingPage />} />
      <Route path="/daily-tips" element={<DailyTips />} />
      <Route path="/admin"     element={<AdminDashboard />} />
      <Route path="/behaviour" element={<BehaviourPatterns />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}
