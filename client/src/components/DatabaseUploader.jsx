import React, { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// DatabaseUploader.jsx (Simplified)
// ─────────────────────────────────────────────────────────────────────────────

export default function DatabaseUploader() {
  const [syncRunning, setSyncRunning]   = useState(false);
  const [syncLogs, setSyncLogs]         = useState([]);
  const [syncResult, setSyncResult]     = useState(null);

  const handleSync = async (leagueFilter) => {
    setSyncRunning(true);
    setSyncLogs([]);
    setSyncResult(null);
    const addLog = (msg) => setSyncLogs(prev => [...prev, msg]);
    console.log('[DatabaseUploader] Starting local DB → Database sync, filter:', leagueFilter || 'ALL');
    try {
      const res = await fetch('/api/sync-local-to-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leagueFilter ? { leagueFilter } : {}),
      });
      if (!res.body) throw new Error('No SSE stream returned');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') { addLog(event.message); }
            if (event.type === 'done') { setSyncResult(event); setSyncRunning(false); return; }
            if (event.type === 'error') { addLog('❌ ' + event.message); setSyncRunning(false); return; }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      addLog('❌ Network error: ' + err.message);
      setSyncRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Sync Local DB → Database Panel ─────────────────────────── */}
      <div className="glass-panel" style={{ borderLeft: '4px solid #ffd700', padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: syncLogs.length > 0 || syncResult ? '16px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>🔄</span>
            <div>
              <h4 style={{ margin: 0, color: '#ffd700', fontSize: '0.95rem' }}>Sync Local DB → Database</h4>
              <p style={{ margin: 0, fontSize: '0.73rem', opacity: 0.55 }}>
                Push all records already extracted (but not yet uploaded) directly to the Database.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleSync(null)}
            disabled={syncRunning}
            style={{
              background: syncRunning ? 'rgba(255,215,0,0.1)' : 'linear-gradient(135deg, #ffd700, #ffaa00)',
              color: syncRunning ? 'rgba(255,255,255,0.4)' : '#000',
              border: syncRunning ? '1px solid rgba(255,215,0,0.3)' : 'none',
              borderRadius: '10px', padding: '10px 20px',
              cursor: syncRunning ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 900, transition: 'all 0.3s ease', whiteSpace: 'nowrap',
              boxShadow: !syncRunning ? '0 4px 15px rgba(255,215,0,0.3)' : 'none',
            }}
          >
            {syncRunning ? <div style={{display:'flex', alignItems:'center', gap:'6px'}}><div className="spinner" style={{width: 14, height: 14, borderWidth: 2, borderColor: 'rgba(255,215,0,0.3)', borderTopColor: '#ffd700', margin: 0}} /> Syncing...</div> : '🚀 Push All to Database'}
          </button>
        </div>

        {/* Live sync log */}
        {(syncLogs.length > 0 || syncRunning) && (
          <div style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px 14px',
            maxHeight: '120px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.72rem',
            display: 'flex', flexDirection: 'column', gap: '3px', border: '1px solid rgba(255,215,0,0.1)',
          }}>
            {syncRunning && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,215,0,0.2)', borderTop: '2px solid #ffd700', flexShrink: 0 }} />
              <span style={{ color: '#ffd700', fontSize: '0.72rem' }}>Syncing to Database...</span>
            </div>}
            {syncLogs.map((log, i) => (
              <span key={i} style={{ color: log.startsWith('❌') ? '#ff6b6b' : 'rgba(255,255,255,0.75)' }}>{log}</span>
            ))}
          </div>
        )}

        {/* Sync result */}
        {syncResult && !syncRunning && (
          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
            {[{ label: 'Total Records', value: syncResult.total, color: '#ffd700' }, { label: 'Uploaded', value: syncResult.uploaded, color: 'var(--accent-neon)' }, { label: 'Skipped', value: syncResult.skipped, color: 'rgba(255,255,255,0.4)' }].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 3px', fontSize: '1.3rem', fontWeight: 900, color }}>{value}</p>
                <p style={{ margin: 0, fontSize: '0.67rem', opacity: 0.5 }}>{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
