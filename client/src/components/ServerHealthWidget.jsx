import React, { useState, useEffect } from 'react';

const NEON = '#00E5FF';
const GREEN = '#00FF88';
const RED = '#FF3355';

export default function ServerHealthWidget() {
  const [health, setHealth] = useState(null);
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.success) {
        setHealth(data);
        setError(null);
      } else {
        throw new Error(data.error || 'Health API failed');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const runDiag = async () => {
    setLoading(true);
    setDiag(null);
    try {
      const res = await fetch('/api/scraper-diag');
      const data = await res.json();
      setDiag(data);
    } catch (err) {
      setDiag({ success: false, error: err.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 15000); // 15s check
    return () => clearInterval(t);
  }, []);

  if (error) {
    return (
      <div style={{ background: 'rgba(255,51,85,0.1)', border: `1px solid ${RED}`, padding: 12, borderRadius: 8, fontSize: '0.8rem', color: RED }}>
        ❌ Server Unreachable: {error}
      </div>
    );
  }

  if (!health) return null;

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12
    }}>
      {/* ── Status Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: NEON, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          🖥️ Server Status
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{health.uptime}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{health.memoryMB}MB Mem</span>
        </div>
      </div>

      {/* ── Scraper Status ── */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Live Scraper Status
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {health.scraper.active
              ? `Tracking ${health.scraper.liveMatches} active matches across ${health.scraper.liveLeagues.length} leagues.`
              : 'Waiting for browser DOM...'}
          </div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800,
          background: health.scraper.active ? `${GREEN}22` : `${RED}22`,
          color: health.scraper.active ? GREEN : RED,
          border: `1px solid ${health.scraper.active ? GREEN : RED}44`
        }}>
          {health.scraper.active ? '● LIVE' : '○ IDLE'}
        </div>
      </div>

      {/* ── Diagnostic Tool ── */}
      <button
        onClick={runDiag}
        disabled={loading}
        style={{
          background: 'rgba(0,229,255,0.1)', border: `1px solid ${NEON}44`,
          color: NEON, borderRadius: 6, padding: '8px', cursor: 'pointer',
          fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s',
          opacity: loading ? 0.7 : 1
        }}
      >
        {loading && diag === null ? 'Running Diagnostics...' : '🔍 Run DOM Diagnostics'}
      </button>

      {/* ── Diagnostic Results ── */}
      {diag && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 8,
          background: diag.success ? 'rgba(0,255,136,0.05)' : 'rgba(255,51,85,0.05)',
          border: `1px solid ${diag.success ? GREEN : RED}33`,
          fontSize: '0.7rem', color: 'var(--text-secondary)',
          maxHeight: 200, overflowY: 'auto'
        }}>
          {diag.success ? (
            <>
              <div style={{ color: GREEN, fontWeight: 700, marginBottom: 8 }}>✅ Scraper Diagnostic Data</div>
              <div style={{ marginBottom: 4 }}><strong>Page Title:</strong> {diag.pageTitle}</div>
              <div style={{ marginBottom: 4 }}><strong>URL:</strong> {diag.url}</div>
              <div style={{ marginTop: 8, fontWeight: 700, color: '#fff' }}>Selectors Matching:</div>
              {Object.entries(diag.selectorResults).map(([sel, res]) => res.count > 0 && (
                <div key={sel} style={{ marginLeft: 8, marginTop: 4 }}>
                  <code style={{ color: NEON }}>{sel}</code> : {res.count} items
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ color: RED, fontWeight: 700, marginBottom: 8 }}>❌ Diagnostic Failed</div>
              <div>{diag.error}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
