import React, { useState, useEffect } from 'react';

const PURPLE = '#A78BFA';
const NEON   = '#00E5FF';
const GOLD   = '#FFD700';
const ORANGE = '#FF6B35';
const GREEN  = '#00FF88';

// ── AI Provider logos / brand colours ────────────────────────────────────────
const PROVIDER_META = {
  claude: {
    label: 'Claude Sonnet 4.6',
    brand: 'Anthropic',
    color: '#D97706',
    bg:    'rgba(217,119,6,0.08)',
    border:'rgba(217,119,6,0.35)',
    icon:  '🧠',
    model: 'claude-sonnet-4-6',
    envKey: 'ANTHROPIC_API_KEY',
  },
  gemini: {
    label: 'Gemini 2.5 Pro',
    brand: 'Google',
    color: '#34d399',
    bg:    'rgba(52,211,153,0.08)',
    border:'rgba(52,211,153,0.35)',
    icon:  '✨',
    model: 'gemini-2.5-pro',
    envKey: 'GEMINI_API_KEY',
  },
  openai: {
    label: 'GPT-4o',
    brand: 'OpenAI',
    color: '#10B981',
    bg:    'rgba(16,185,129,0.08)',
    border:'rgba(16,185,129,0.35)',
    icon:  '⚡',
    model: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
  },
};

export default function AILog() {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [strategyHistory, setStrategyHistory] = useState([]);

  // ── AI Provider state ──────────────────────────────────────────────────────
  const [aiProvider, setAiProvider]         = useState('claude');
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerSaving, setProviderSaving]   = useState(false);
  const [providerMsg, setProviderMsg]         = useState(null); // { type: 'success'|'error', text }

  // Deep Learning form state
  const [trainLeague, setTrainLeague] = useState('England - Virtual');
  const [trainDate, setTrainDate]     = useState(new Intl.DateTimeFormat('en-GB').format(new Date()));
  const [trainStatus, setTrainStatus] = useState(null);
  const [trainMsg, setTrainMsg]       = useState('');
  const [trainProfile, setTrainProfile] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [datesLoading, setDatesLoading]     = useState(false);

  // ── Fetch active AI provider on mount ────────────────────────────────────
  useEffect(() => {
    console.log('[AILog] Fetching active AI provider...');
    fetch('/api/ai-provider')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setAiProvider(data.provider || 'claude');
          console.log('[AILog] Active provider:', data.provider);
        }
        setProviderLoading(false);
      })
      .catch(err => {
        console.error('[AILog] Failed to fetch AI provider:', err);
        setProviderLoading(false);
      });
  }, []);

  // ── Save provider selection ───────────────────────────────────────────────
  const handleProviderChange = async (newProvider) => {
    if (newProvider === aiProvider || providerSaving) return;
    console.log('[AILog] Switching AI provider to:', newProvider);
    setProviderSaving(true);
    setProviderMsg(null);
    try {
      const res  = await fetch('/api/ai-provider', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider: newProvider }),
      });
      const data = await res.json();
      if (data.success) {
        setAiProvider(data.provider);
        setProviderMsg({ type: 'success', text: `✅ Switched to ${PROVIDER_META[data.provider]?.brand ?? data.provider} successfully!` });
        console.log('[AILog] Provider saved:', data.provider);
      } else {
        setProviderMsg({ type: 'error', text: `❌ ${data.error}` });
        console.error('[AILog] Provider save failed:', data.error);
      }
    } catch (err) {
      setProviderMsg({ type: 'error', text: `❌ Network error: ${err.message}` });
      console.error('[AILog] Provider save error:', err);
    } finally {
      setProviderSaving(false);
      // Auto-clear message after 4s
      setTimeout(() => setProviderMsg(null), 4000);
    }
  };

  // ── Available dates for Deep Learning module ──────────────────────────────
  useEffect(() => {
    setDatesLoading(true);
    fetch(`/api/vfootball/available-dates?league=${encodeURIComponent(trainLeague)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setAvailableDates(data.dates || []);
          if (data.dates && data.dates.length > 0 && !data.dates.includes(trainDate)) {
            setTrainDate(data.dates[0]);
          }
        }
        setDatesLoading(false);
      })
      .catch(err => {
        console.error('[Deep Learning] Error fetching available dates:', err);
        setDatesLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainLeague]);


  const refresh = () => {
    setLoading(true);
    
    // Fetch memory logs
    fetch('/api/ai-memory').then(r => r.json())
    .then(memoryData => {
        console.log('[AILog] Memory data fetched:', memoryData.log?.length ?? 0, 'entries');
        if (memoryData.success) setLogs(memoryData.log || []);
    })
    .catch(console.error);

    // Fetch brain ledger (strategy history)
    fetch('/api/ai/strategy-history').then(r => r.json())
    .then(data => {
        if (data.success) setStrategyHistory(data.history || []);
        setFetchError(null);
        setLoading(false);
    })
    .catch(err => {
      console.error('[AILog] Failed to load ledger:', err);
      setFetchError('Could not connect to backend.');
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const handleLearn = async () => {
    if (!trainLeague || !trainDate) return;
    setTrainStatus('loading');
    setTrainProfile(null);
    setTrainMsg('Sending match data to DeepSeek for deep league analysis...');
    console.log(`[Deep Learning] 🚀 Starting training — league: ${trainLeague}, date: ${trainDate}`);
    try {
      const rs = await fetch('/api/vfootball/learning-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: trainLeague, targetDate: trainDate })
      });

      // Always read as text first — avoids JSON parse crash on HTML error pages
      const rawText = await rs.text();
      console.log(`[Deep Learning] HTTP ${rs.status} — response length: ${rawText.length}`);

      let data;
      try { data = JSON.parse(rawText); }
      catch {
        // Server returned raw HTML (gateway error) — surface a clean message
        console.error('[Deep Learning] Non-JSON response:', rawText.slice(0, 200));
        setTrainStatus('error');
        setTrainMsg('⚠️ DeepSeek is temporarily unreachable (gateway error). Please wait 1–2 minutes and try again.');
        return;
      }

      if (data.success) {
        setTrainStatus('success');
        setTrainProfile(data.profile);
        const cached = data.cached ? ' (cached — already trained for this date)' : '';
        setTrainMsg(`✅ Intelligence Profile built! Analyzed ${data.matchesAnalyzed} matches for ${trainLeague} on ${trainDate}.${cached}`);
        console.log('[Deep Learning] ✅ Profile updated:', data.profile);
      } else {
        setTrainStatus('error');
        // Sanitise: if error is raw HTML, show friendly message
        const errText = (data.error || 'Unknown error');
        const friendlyErr = errText.trim().startsWith('<')
          ? '⚠️ DeepSeek is temporarily unreachable. Please wait 1–2 minutes and try again.'
          : `❌ ${errText}`;
        setTrainMsg(friendlyErr);
        console.error('[Deep Learning] Backend error:', data.error);
      }
    } catch(err) {
      setTrainStatus('error');
      setTrainMsg(`❌ Network error: ${err.message}`);
      console.error('[Deep Learning] Fetch error:', err);
    }
  };

  const handleLearnAll = async () => {
    if (!trainDate || availableDates.length === 0) return;
    const allLeagues = ["England - Virtual", "Germany - Virtual", "Italy - Virtual", "Spain - Virtual"];
    setTrainStatus('loadingAll');
    setTrainProfile(null);
    let successCount = 0;
    
    for (const lg of allLeagues) {
      setTrainLeague(lg);
      setTrainMsg(`⏳ Deep Learning ${lg} for ${trainDate} (${successCount}/${allLeagues.length} done) ...`);
      
      try {
        const rs = await fetch('/api/vfootball/learning-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ league: lg, targetDate: trainDate })
        });
        
        const rawText = await rs.text();
        let data;
        try { data = JSON.parse(rawText); } catch { continue; }
        
        if (data.success) {
           successCount++;
           setTrainProfile(data.profile); // Keep updating the profile box so user sees live iterations
        } else {
           console.error(`[Learn All] ${lg} failed: `, data);
        }
      } catch (err) {
         console.error(`[Learn All] Failed on ${lg}`, err);
      }
    }
    
    setTrainStatus('success');
    setTrainMsg(`✅ Global Training Complete! Integrated intelligence for ${successCount}/${allLeagues.length} leagues on ${trainDate}.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── AI Provider Selector ──────────────────────────────────────────── */}
      <div style={{
        padding: '16px', borderRadius: 10,
        background: 'rgba(0,0,0,0.35)',
        border: `1px solid ${PROVIDER_META[aiProvider]?.border ?? 'rgba(255,255,255,0.1)'}`,
        transition: 'border-color 0.3s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: NEON }}>
            🤖 AI Analysis Provider
          </div>
          {providerLoading ? (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Loading...</span>
          ) : (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 20,
              background: `${PROVIDER_META[aiProvider]?.color ?? '#fff'}22`,
              color: PROVIDER_META[aiProvider]?.color ?? '#fff',
              border: `1px solid ${PROVIDER_META[aiProvider]?.color ?? '#fff'}44`,
            }}>
              {PROVIDER_META[aiProvider]?.icon} {PROVIDER_META[aiProvider]?.brand ?? aiProvider} ACTIVE
            </span>
          )}
        </div>

        {/* How it works blurb */}
        <p style={{ margin: '0 0 14px', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Choose which AI model analyses natively scraped match data to evaluate results.
          Switching takes effect immediately — no server restart needed.
        </p>

        {/* Provider Option Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {Object.entries(PROVIDER_META).map(([key, meta]) => {
            const isActive = aiProvider === key;
            return (
              <button
                key={key}
                id={`provider-btn-${key}`}
                disabled={providerSaving || providerLoading}
                onClick={() => handleProviderChange(key)}
                style={{
                  padding: '12px 10px', borderRadius: 8, cursor: providerSaving ? 'wait' : 'pointer',
                  border: `2px solid ${isActive ? meta.color : 'rgba(255,255,255,0.1)'}`,
                  background: isActive ? meta.bg : 'rgba(255,255,255,0.02)',
                  textAlign: 'left', transition: 'all 0.2s ease',
                  transform: isActive ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isActive ? `0 0 12px ${meta.color}30` : 'none',
                  opacity: providerSaving ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>{meta.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: isActive ? meta.color : 'var(--text-primary)', marginBottom: 2 }}>
                  {meta.brand}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: 6 }}>{meta.label}</div>
                {isActive && (
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ● Active
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Required API Key reminder */}
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: providerMsg ? 10 : 0 }}>
          🔑 Requires <code style={{ color: GOLD, fontFamily: 'monospace' }}>{PROVIDER_META[aiProvider]?.envKey}</code> in server <code style={{ color: '#aaa', fontFamily: 'monospace' }}>.env</code>
        </div>

        {/* Save feedback */}
        {providerSaving && (
          <div style={{ fontSize: '0.75rem', color: NEON, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> Saving provider config...
          </div>
        )}
        {providerMsg && !providerSaving && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: '0.75rem',
            background: providerMsg.type === 'success' ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,85,0.08)',
            borderLeft: `3px solid ${providerMsg.type === 'success' ? GREEN : '#FF3355'}`,
            color: providerMsg.type === 'success' ? GREEN : '#FF6B6B',
          }}>
            {providerMsg.text}
          </div>
        )}
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px' }}>
          Loading AI Admin Parameters...
        </div>
      )}
      {fetchError && !loading && (
        <div style={{ color: '#FF3355', fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(255,51,85,0.08)', borderRadius: 6, borderLeft: '3px solid #FF3355' }}>
          ⚠️ {fetchError}
        </div>
      )}

      {/* ── 🧠 AI Brain Ledger ── */}
      <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(0,229,255,0.05)', border: `1px solid ${NEON}60` }}>
        <div style={{ color: NEON, fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🧠</span> AI Brain Ledger &amp; Live Rules
        </div>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          The autonomous rule engine. The AI evaluates its own errors daily and perfectly targets old rules for deprecation while spinning up new strategies.
        </p>

        {strategyHistory.length === 0 && !loading && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No brain updates have occurred yet. Waiting for first daily AI tip analysis...</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
          {strategyHistory.map((entry, idx) => {
            const hasAdded = entry.added && entry.added.length > 0;
            const hasRemoved = entry.removed && entry.removed.length > 0;
            const hasMonitored = entry.monitored && entry.monitored.length > 0;
            
            // Only render actions if there are actual items inside
            if (!hasAdded && !hasRemoved && !hasMonitored && entry.action !== 'pivot') return null;

            return (
              <div key={entry.id || idx} style={{ padding: '12px', borderRadius: 6, background: '#111', borderLeft: `3px solid ${NEON}` }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{new Date(entry.date).toLocaleString()}</span>
                      <span style={{ color: NEON, textTransform: 'uppercase', fontWeight: 700 }}>{entry.action.replace('_', ' ')}</span>
                  </div>
                  
                  {hasAdded && (
                      <div style={{ marginBottom: '6px' }}>
                          <div style={{ fontSize: '0.68rem', color: GREEN, fontWeight: 700, marginBottom: '2px' }}>🟢 ADDED RULES</div>
                          {entry.added.map((r, i) => <div key={i} style={{ fontSize: '0.78rem', paddingLeft: '8px', borderLeft: `1px solid ${GREEN}40`, marginBottom: '4px' }}>{r}</div>)}
                      </div>
                  )}
                  
                  {hasRemoved && (
                      <div style={{ marginBottom: '6px' }}>
                          <div style={{ fontSize: '0.68rem', color: '#FF3355', fontWeight: 700, marginBottom: '2px' }}>🔴 DEPRECATED (FAILED) RULES</div>
                          {entry.removed.map((r, i) => <div key={i} style={{ fontSize: '0.78rem', color: '#aaa', textDecoration: 'line-through', paddingLeft: '8px', borderLeft: `1px solid #FF335540`, marginBottom: '4px' }}>{r}</div>)}
                      </div>
                  )}

                  {hasMonitored && (
                      <div>
                          <div style={{ fontSize: '0.68rem', color: GOLD, fontWeight: 700, marginBottom: '2px' }}>🟡 UNDER OBSERVATION</div>
                          {entry.monitored.map((r, i) => <div key={i} style={{ fontSize: '0.78rem', paddingLeft: '8px', borderLeft: `1px solid ${GOLD}40`, marginBottom: '4px' }}>{r}</div>)}
                      </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>      {/* ── Deep Learning Module (ALWAYS VISIBLE) ── */}
      <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(255,107,53,0.05)', border: `1px solid ${ORANGE}60` }}>
        <div style={{ color: ORANGE, fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📚</span> Train Database Module
        </div>
        <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Select a league and date to inject a full raw day of match results into DeepSeek. 
          The AI builds a permanent <strong style={{color: ORANGE}}>League Intelligence Profile</strong> 
          detailing top/worst teams, recurring patterns, and draw tendencies.
        </p>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginBottom: 12, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, lineHeight: 1.5 }}>
          ℹ️ <strong>How this works:</strong> The selected date&apos;s match results are pulled from Database, compressed, and sent to DeepSeek for deep pattern analysis. The resulting profile is saved permanently and used by the AI during future predictions for that league.
          <span style={{ color: ORANGE }}> Requires DEEPSEEK_API_KEY in server .env.</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <select
            value={trainLeague}
            onChange={e => setTrainLeague(e.target.value)}
            style={{ padding: '8px 12px', background: '#0a0a0a', color: '#fff', border: `1px solid ${ORANGE}50`, borderRadius: 6, outline: 'none', cursor: 'pointer' }}
          >
            <option value="England - Virtual">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England</option>
            <option value="Germany - Virtual">🇩🇪 Germany</option>
            <option value="Italy - Virtual">🇮🇹 Italy</option>
            <option value="Spain - Virtual">🇪🇸 Spain</option>
          </select>
          <select
            value={trainDate}
            onChange={e => setTrainDate(e.target.value)}
            disabled={datesLoading || availableDates.length === 0}
            style={{ 
              padding: '8px 12px', background: '#0a0a0a', color: '#fff', 
              border: `1px solid ${ORANGE}50`, borderRadius: 6, outline: 'none', 
              width: '140px', cursor: datesLoading ? 'wait' : 'pointer' 
            }}
          >
            {datesLoading && <option value={trainDate}>Loading...</option>}
            {!datesLoading && availableDates.length === 0 && <option value="">No Dates — upload results first</option>}
            {!datesLoading && availableDates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
            {/* Fallback if current text-date not in list */}
            {!datesLoading && availableDates.length > 0 && !availableDates.includes(trainDate) && trainDate && (
              <option value={trainDate}>{trainDate}</option>
            )}
          </select>
          <button
            onClick={handleLearn}
            disabled={trainStatus === 'loading' || trainStatus === 'loadingAll' || !trainDate || availableDates.length === 0}
            style={{
              padding: '8px 18px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 6,
              fontWeight: 700, cursor: (trainStatus === 'loading' || trainStatus === 'loadingAll' || availableDates.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (trainStatus === 'loading' || trainStatus === 'loadingAll' || availableDates.length === 0) ? 0.7 : 1, transition: 'opacity 0.2s'
            }}
          >
            {trainStatus === 'loading' ? '⏳ Training...' : '🚀 Commence Learning'}
          </button>
          
          <button
            onClick={handleLearnAll}
            disabled={trainStatus === 'loading' || trainStatus === 'loadingAll' || !trainDate || availableDates.length === 0}
            style={{
              padding: '8px 18px', background: 'rgba(255,107,53,0.1)', color: ORANGE, border: `1px solid ${ORANGE}`, borderRadius: 6,
              fontWeight: 700, cursor: (trainStatus === 'loading' || trainStatus === 'loadingAll' || availableDates.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (trainStatus === 'loading' || trainStatus === 'loadingAll' || availableDates.length === 0) ? 0.5 : 1, transition: 'opacity 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            {trainStatus === 'loadingAll' ? '⏳ Deep Scanning...' : '🌐 Learn All Leagues'}
          </button>

          {/* Retry button — visible only after an error */}
          {trainStatus === 'error' && (
            <button
              onClick={handleLearn}
              style={{
                padding: '8px 14px', background: 'transparent', color: ORANGE,
                border: `1px solid ${ORANGE}`, borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem'
              }}
            >
              ↺ Retry
            </button>
          )}
        </div>
        {trainMsg && (
          <div style={{
            padding: '10px 12px', borderRadius: 6, fontSize: '0.78rem', lineHeight: 1.5,
            background: trainStatus === 'success' ? 'rgba(0,255,136,0.08)' : trainStatus === 'error' ? 'rgba(255,51,85,0.08)' : 'rgba(255,255,255,0.04)',
            borderLeft: `3px solid ${trainStatus === 'success' ? '#00FF88' : trainStatus === 'error' ? '#FF3355' : ORANGE}`,
            color: trainStatus === 'success' ? '#00FF88' : trainStatus === 'error' ? '#FF6B6B' : 'rgba(255,255,255,0.7)'
          }}>
            {trainMsg}
          </div>
        )}
        {trainProfile && (
          <div style={{ marginTop: '12px', padding: '16px', background: '#0a0a0a', border: `1px solid ${ORANGE}40`, borderRadius: 8 }}>
            <h4 style={{ color: ORANGE, margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase' }}>📊 League Overview ({trainLeague})</h4>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>{trainProfile.leagueVibe}</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div>
                <h5 style={{ color: '#00FF88', margin: '0 0 8px 0', fontSize: '0.75rem' }}>🏆 Top Teams</h5>
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                  {(trainProfile.topPerformingTeams || []).slice(0, 3).map((t, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>
                      <strong>{t.team}:</strong> <span style={{ color: 'var(--text-muted)' }}>{t.reason || `${t.homeWinPct}% HW`}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 style={{ color: '#FF3355', margin: '0 0 8px 0', fontSize: '0.75rem' }}>⚠️ Struggling Teams</h5>
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                  {(trainProfile.worstPerformingTeams || []).slice(0, 3).map((t, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>
                      <strong>{t.team}:</strong> <span style={{ color: 'var(--text-muted)' }}>{t.reason || `${t.awayWinPct}% AW`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <h5 style={{ color: ORANGE, margin: '0 0 8px 0', fontSize: '0.75rem' }}>💡 Extracted Actionable Rules</h5>
            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.75rem', color: '#fff' }}>
              {(trainProfile.recurringRules || []).slice(0, 4).map((r, i) => (
                <li key={i} style={{ marginBottom: '6px' }}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>



      {/* ── Memory Log ── */}
      <h3 style={{ margin: '4px 0', color: PURPLE, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
        🧠 AI Collective Memory Log
        {logs.length > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>({logs.length} entries)</span>}
      </h3>

      {!loading && logs.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.08)' }}>
          No analysis logs yet. Run an analysis on the Landing Page to populate memory, or use the Deep Learning module above to train a league profile.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {logs.map(log => (
          <div key={log.id} style={{
            background: 'rgba(167,139,250,0.06)', border: `1px solid rgba(167,139,250,0.15)`,
            borderRadius: 8, padding: '12px 14px', fontSize: '0.8rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700, color: '#fff' }}>{log.dateLabel}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{new Date(log.createdAt).toLocaleString()}</span>
            </div>
            <div style={{ color: PURPLE, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
              [{log.scope}] {log.league ? `⚽ ${log.league}` : '🌐 Global'} · {log.matchCount} matches
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5, fontSize: '0.78rem' }}>
              {log.summary}
            </div>
            {log.reflection && (
              <div style={{ background: 'rgba(255,215,0,0.05)', padding: '8px', borderRadius: 6, borderLeft: `2px solid ${GOLD}`, marginBottom: log.strategyCommand ? '8px' : '0' }}>
                <span style={{ color: GOLD, fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>⚠️ SELF REFLECTION</span>
                <span style={{ color: 'var(--text-primary)', fontSize: '0.78rem' }}>{log.reflection}</span>
              </div>
            )}
            {log.strategyCommand?.action && (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: 6, borderLeft: `2px solid ${log.strategyCommand.action === 'pivot' ? '#FF3355' : NEON}` }}>
                <span style={{ color: log.strategyCommand.action === 'pivot' ? '#FF3355' : NEON, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  STRATEGY ACTION: {log.strategyCommand.action}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}


