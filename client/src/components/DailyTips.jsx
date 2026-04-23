import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AIProviderSelector from './AIProviderSelector';

const NEON    = '#00E5FF';
const GREEN   = '#00FF88';
const GOLD    = '#FFD700';
const PURPLE  = '#A78BFA';
const RED     = '#FF3355';
const ORANGE  = '#FF6B35';

// ── Inline Form Badges Component ─────────────────────────────────────────────
function FormBadges({ form }) {
    if (!form || form === 'N/A' || form === 'Error') return null;
    const colorMap = { W: GREEN, L: RED, D: '#94a3b8' };
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {form.split('').map((r, i) => (
                <span key={i} style={{
                    width: 22, height: 22,
                    background: colorMap[r] || '#444',
                    color: r === 'D' ? '#fff' : '#000',
                    borderRadius: 4,
                    fontSize: '0.65rem',
                    fontWeight: 900,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: `0 0 6px ${colorMap[r] || '#444'}80`,
                }}>{r}</span>
            ))}
        </div>
    );
}

export default function DailyTips() {
    const LEAGUES = ['England - Virtual', 'Germany - Virtual', 'Italy - Virtual', 'Spain - Virtual'];
    const [league, setLeague] = useState(LEAGUES[0]);
    
    // Default date is today at YYYY-MM-DD
    const d = new Date();
    const initDate = d.toISOString().split('T')[0];
    
    const [analyzing, setAnalyzing] = useState(false);
    const [tipData, setTipData] = useState(null);
    const [error, setError] = useState(null);
    const [teamForms, setTeamForms] = useState({}); // { 'TeamName': formProfile }

    // Sidebar Data states
    const [strategyData, setStrategyData]         = useState(null);
    const [intelligenceData, setIntelligenceData] = useState(null);
    const [predictionHistory, setPredictionHistory] = useState([]);
    const [leagueDNA, setLeagueDNA]               = useState(null); // League DNA baseline
    const [aiProvider, setAiProvider]             = useState('deepseek'); // Selected AI provider

    // Real-time AI activity log (SSE stream from /api/ai-status-stream)
    const [aiLog, setAiLog] = useState([]);
    const aiLogEndRef = React.useRef(null);

    // Action badge colour by type
    const actionColor = { start: PURPLE, fetching: NEON, tool: GOLD, analyzing: ORANGE, success: GREEN, error: RED, info: '#94a3b8' };

    // Connect to SSE stream — auto-reconnects on unmount/remount
    useEffect(() => {
        console.log('[DailyTips] 📡 Connecting to AI status stream...');
        const es = new EventSource('/api/ai-status-stream');
        es.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                const time = new Date(data.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setAiLog(prev => [...prev.slice(-79), { ...data, displayTime: time }]);
                console.log(`[AI Stream] [${data.action}] ${data.message}`);
            } catch (e) {
                console.warn('[DailyTips] SSE parse error:', e);
            }
        };
        es.onerror = () => console.warn('[DailyTips] AI status stream disconnected — server may have restarted.');
        return () => es.close();
    }, []);

    // Auto-scroll AI log to bottom
    useEffect(() => {
        aiLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiLog]);

    const formatForApi = (isoStr) => {
        if (!isoStr) return '';
        const [y, m, dLocal] = isoStr.split('-');
        return `${dLocal}/${m}/${y}`;
    };
    const todayApi = formatForApi(initDate);

    // Load static sidebar assets
    const fetchSidebarData = async () => {
        try {
            const resStrat = await fetch('/api/ai-strategy');
            const dataStrat = await resStrat.json();
            if (dataStrat.success) setStrategyData(dataStrat.strategy);

            const resIntel = await fetch(`/api/vfootball/league-intelligence/${encodeURIComponent(league)}`);
            const dataIntel = await resIntel.json();
            if (dataIntel.success) setIntelligenceData(dataIntel.data);

            // 🧬 Fetch League DNA Baseline for the selected league
            console.log(`[DailyTips] 🧬 Fetching League DNA baseline for ${league}...`);
            const resDNA = await fetch(`/api/vfootball/league-baselines?league=${encodeURIComponent(league)}`);
            const dataDNA = await resDNA.json();
            if (dataDNA.success && dataDNA.baselines?.length > 0) {
                setLeagueDNA(dataDNA.baselines[0]);
                console.log(`[DailyTips] ✅ League DNA: O1.5=${dataDNA.baselines[0].stats?.over1_5Percent}% BTTS=${dataDNA.baselines[0].stats?.bttsPercent}%`);
            } else {
                setLeagueDNA(null);
                console.warn(`[DailyTips] ⚠️ No DNA baseline found for ${league} — run Sync All + Recompute DNA.`);
            }
        } catch (err) {
            console.error('[Sidebar] Failed to load AI Data', err);
        }
    };

    const fetchPredictionHistory = async () => {
        try {
            const resHist = await fetch(`/api/vfootball/daily-tips/history?league=${encodeURIComponent(league)}`);
            const dataHist = await resHist.json();
            if (dataHist.success) setPredictionHistory(dataHist.history || []);
        } catch (err) {
            console.error('[Sidebar] Failed to load prediction history', err);
        }
    };

    // Fetch W/D/L form for all teams in the upcoming matches list
    const fetchTeamForms = async (matches, currentLeague) => {
        if (!matches || matches.length === 0) return;
        const teams = new Set();
        matches.forEach(m => {
            if (m.fixture) {
                const parts = m.fixture.split(' vs ');
                if (parts[0]) teams.add(parts[0].trim());
                if (parts[1]) teams.add(parts[1].trim());
            }
        });
        const forms = {};
        await Promise.all([...teams].map(async (team) => {
            try {
                const res = await fetch(`/api/vfootball/team-form?league=${encodeURIComponent(currentLeague)}&team=${encodeURIComponent(team)}&limit=5`);
                const data = await res.json();
                if (data.success) forms[team] = data.form;
            } catch (e) {
                console.warn(`[DailyTips] Could not fetch form for ${team}:`, e.message);
            }
        }));
        setTeamForms(forms);
        console.log(`[DailyTips] 📊 Loaded form for ${Object.keys(forms).length} teams.`);
    };

    // Whenever tipData changes and has upcoming matches, load their form
    useEffect(() => {
        if (tipData?.upcoming_matches?.length > 0) {
            fetchTeamForms(tipData.upcoming_matches, league);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipData]);

    const fetchTips = async () => {
        setTipData(null);
        setError(null);
        setAnalyzing(true);
        console.log(`[DailyTips] 🔍 Checking if tips exist for ${todayApi}...`);
        try {
            const res = await fetch(`/api/vfootball/daily-tips?date=${todayApi}&league=${encodeURIComponent(league)}`);
            const data = await res.json();
            if (data.success && data.tipData) {
                console.log('[DailyTips] ✅ Found cached insight in Database.');
                setTipData(data.tipData);
            } else {
                console.log('[DailyTips] ⚠️ No tips found for this date. Run "Predict" to generate.');
            }
        } catch (err) {
            console.error('[DailyTips] ❌ Fetch Error:', err);
            setError('Could not reach backend API.');
        }
        setAnalyzing(false);
    };

    useEffect(() => {
        const load = () => {
            fetchSidebarData();
            fetchPredictionHistory();
            fetchTips();
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [league]);

    const handleAnalyze = async () => {
        setTipData(null);
        setError(null);
        setAnalyzing(true);
        console.log(`[DailyTips] 🚀 Starting AI Prediction for ${todayApi} | League: ${league}...`);
        try {
            const res = await fetch('/api/vfootball/daily-tips/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: todayApi, league, provider: aiProvider })
            });
            const data = await res.json();
            console.log(`[DailyTips] 📨 API response: status=${res.status} success=${data.success} errorType=${data.errorType || 'none'}`);
            
            if (data.success) {
                console.log('[DailyTips] ✅ AI Prediction complete! Tips saved to Database.');
                setTipData(data.tipData);
                fetchPredictionHistory();
            } else {
                // Special case: Database quota exceeded or missing composite index
                if (data.errorType === 'FIREBASE_QUOTA') {
                    console.error('[DailyTips] ❌ Database quota/index error:', data.error);
                    if (data.indexUrl) console.error('[DailyTips] 🔗 CREATE FIREBASE INDEX:', data.indexUrl);
                    const friendlyMsg = data.indexUrl
                        ? `⚠️ Database needs a composite index to process this query.\n\n👉 Create it here:\n${data.indexUrl}\n\nAfter creating the index (takes ~1 min), click Retry.`
                        : '⚠️ Database quota exceeded or a required Firestore index is missing.\n\nThis resets daily. Check the server console for the index creation link, or try again later.';
                    setError(friendlyMsg);
                } else {
                    console.error('[DailyTips] ❌ AI Prediction failed:', data.error);
                    setError(data.error || 'Analysis failed. Check server logs.');
                }
            }
        } catch(err) {
            console.error('[DailyTips] ❌ Request Error (network/server down?):', err.message);
            setError(`Network error: ${err.message}. Is the server running on port 3001?`);
        }
        setAnalyzing(false);
    };

    const handleReAnalyze = async () => {
        setTipData(null);
        setError(null);
        setAnalyzing(true);
        console.log(`[DailyTips] 🔄 Force Re-Analyzing ${todayApi} for ${league} — bypassing cache...`);
        try {
            const res = await fetch('/api/vfootball/daily-tips/analyze?force=true', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: todayApi, league, force: true, provider: aiProvider })
            });
            const data = await res.json();
            console.log(`[DailyTips] 📨 Re-Analyze response: status=${res.status} success=${data.success} errorType=${data.errorType || 'none'}`);
            
            if (data.success) {
                console.log('[DailyTips] ✅ Force Re-Analysis complete!');
                setTipData(data.tipData);
                fetchPredictionHistory();
            } else {
                // Special case: Database quota exceeded or missing composite index
                if (data.errorType === 'FIREBASE_QUOTA') {
                    console.error('[DailyTips] ❌ Database quota/index error on re-analyze:', data.error);
                    if (data.indexUrl) console.error('[DailyTips] 🔗 CREATE FIREBASE INDEX:', data.indexUrl);
                    const friendlyMsg = data.indexUrl
                        ? `⚠️ Database quota/index error during Re-Analyze.\n\n👉 Create the required index here:\n${data.indexUrl}\n\nAfter creation (takes ~1 min), click Re-Analyze again.`
                        : '⚠️ Database quota exceeded. The Re-Analyze was blocked. Try again in a few hours or check the server console.';
                    setError(friendlyMsg);
                } else {
                    console.error('[DailyTips] ❌ Re-Analyze failed:', data.error);
                    setError(data.error || 'Re-Analysis failed. Check server logs.');
                }
            }
        } catch(err) {
            console.error('[DailyTips] ❌ Re-Analyze Error (network?):', err.message);
            setError(`Network error: ${err.message}`);
        }
        setAnalyzing(false);
    };

    const selectStyle = {
        padding: '12px 18px',
        background: 'rgba(10,10,20,0.7)',
        color: '#fff',
        border: '1px solid rgba(167,139,250,0.25)',
        borderRadius: 12,
        outline: 'none',
        fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
        fontSize: '0.9rem',
        backdropFilter: 'blur(10px)',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease',
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'Inter, sans-serif' }}>
            
            {/* Premium Header */}
            <header style={{
                background: 'linear-gradient(180deg, rgba(167,139,250,0.08) 0%, rgba(10,10,20,0.0) 100%)',
                borderBottom: '1px solid rgba(167,139,250,0.15)',
                padding: '28px 24px',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
            }}>
                <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
                            <Link to="/results" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.03em', transition: 'color 0.2s' }}
                                onMouseOver={e => e.currentTarget.style.color = 'white'}
                                onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                            >← Dashboard</Link>
                            <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '1rem' }}>|</span>
                            <Link to="/admin" style={{ color: PURPLE, textDecoration: 'none', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.03em', opacity: 0.85, transition: 'opacity 0.2s' }}
                                onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                onMouseOut={e => e.currentTarget.style.opacity = '0.85'}
                            >⚙️ Admin Terminal</Link>
                            <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '1rem' }}>|</span>
                            <Link to="/behaviour" style={{ color: '#f7941d', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.03em', opacity: 0.85, transition: 'opacity 0.2s' }}
                                onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                onMouseOut={e => e.currentTarget.style.opacity = '0.85'}
                            >🧬 Behaviour Patterns</Link>
                        </div>
                        <h1 style={{ margin: 0, fontSize: '2.6rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                            Daily{' '}
                            <span style={{ backgroundImage: `linear-gradient(135deg, ${PURPLE}, #c4b5fd)`, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: `drop-shadow(0 0 20px ${PURPLE}55)` }}>Tips</span>
                            {' '}&amp; Intelligence
                        </h1>
                        <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem', letterSpacing: '0.02em' }}>
                            AI-powered match tips based on real historical data from your database.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select id="dt-league-select" value={league} onChange={e => setLeague(e.target.value)} style={{ ...selectStyle, borderColor: `${GREEN}40` }}>
                            {LEAGUES.map(l => <option key={l} value={l}>{l.replace(' - Virtual', '')}</option>)}
                        </select>

                        <button 
                            id="dt-analyze-btn"
                            onClick={handleAnalyze} 
                            disabled={analyzing} 
                            style={{
                                background: analyzing ? 'rgba(0,255,136,0.15)' : `linear-gradient(135deg, ${GREEN}, #00b359)`,
                                color: analyzing ? GREEN : '#000',
                                border: `1px solid ${GREEN}60`,
                                borderRadius: 12,
                                padding: '12px 28px',
                                cursor: analyzing ? 'not-allowed' : 'pointer',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                fontFamily: 'Inter, sans-serif',
                                transition: 'all 0.25s ease',
                                boxShadow: analyzing ? 'none' : `0 4px 20px ${GREEN}40`,
                                letterSpacing: '0.02em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>⚡</span> {analyzing ? 'Predicting...' : 'Predict Upcoming Matches'}
                        </button>

                        {tipData && (
                            <button
                                id="dt-reanalyze-btn"
                                onClick={handleReAnalyze}
                                disabled={analyzing}
                                title="Force regenerate — bypasses cache and re-runs AI"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: 12,
                                    padding: '12px 16px',
                                    cursor: analyzing ? 'not-allowed' : 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    fontFamily: 'Inter, sans-serif',
                                    transition: 'all 0.2s ease',
                                    letterSpacing: '0.02em',
                                }}
                            >
                                🔄 Re-Analyze
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="daily-tips-layout" style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
                
                {/* ─── LEFT/MAIN VIEW: Daily Tips Output ──────────────────────────────── */}
                <div>
                    {error && (
                        <div className="ultra-glass animate-fade-up" style={{ borderLeft: `4px solid ${RED}`, background: `linear-gradient(90deg, rgba(255,51,85,0.08) 0%, transparent 100%)`, padding: '20px 24px', marginBottom: 28, borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                <div style={{ fontSize: '2rem', flexShrink: 0 }}>❌</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: RED, fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Analysis Error</div>
                                    <div style={{ color: '#eee', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</div>
                                    {error.includes('index') && (
                                        <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#94a3b8', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
                                            💡 <strong style={{ color: '#fbbf24' }}>How to fix:</strong> Open your server console, copy the Database index URL from the error log, and visit it to create the required index. After ~1 minute the index will be ready.
                                        </div>
                                    )}
                                    <button onClick={handleAnalyze} style={{ marginTop: 12, background: 'rgba(255,51,85,0.15)', border: `1px solid ${RED}50`, color: RED, borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>↺ Retry</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {analyzing && !tipData && (
                        <div className="ultra-glass animate-fade-up" style={{ padding: '40px 24px', borderRadius: 'var(--radius-lg)' }}>
                            {/* Spinner Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
                                <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                                    <div className="spinner" style={{ width: 56, height: 56, borderWidth: 3, borderTopColor: PURPLE, position: 'absolute', inset: 0 }} />
                                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: '1.6rem' }}>🧠</div>
                                </div>
                                <div>
                                    <p style={{ color: PURPLE, fontWeight: 800, fontSize: '1.1rem', margin: '0 0 6px', letterSpacing: '-0.01em' }}>AI is Working…</p>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Analyzing <strong style={{ color: 'white' }}>{league}</strong> for <strong style={{ color: 'white' }}>{todayApi}</strong></p>
                                </div>
                            </div>

                            {/* Real-time AI terminal log */}
                            <div style={{
                                background: 'rgba(0,0,0,0.5)',
                                borderRadius: 12,
                                border: `1px solid rgba(167,139,250,0.2)`,
                                overflow: 'hidden',
                            }}>
                                <div style={{ padding: '10px 16px', background: 'rgba(167,139,250,0.08)', borderBottom: '1px solid rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: PURPLE, boxShadow: `0 0 8px ${PURPLE}`, animation: 'pulse 1.5s infinite' }} />
                                    <span style={{ fontSize: '0.72rem', color: PURPLE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Activity Log — Live</span>
                                </div>
                                <div style={{ maxHeight: 200, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {aiLog.length === 0 && (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>Waiting for AI pipeline to start...</div>
                                    )}
                                    {aiLog.map((log, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.8rem' }}>
                                            <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0, marginTop: 2 }}>[{log.displayTime}]</span>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: actionColor[log.action] || '#fff', flexShrink: 0, marginTop: 5 }} />
                                            <span style={{ color: actionColor[log.action] || '#fff', lineHeight: 1.4 }}>{log.message}</span>
                                        </div>
                                    ))}
                                    <div ref={aiLogEndRef} />
                                </div>
                            </div>
                        </div>
                    )}

                    {tipData && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            
                            {/* Analysis Mode Banner — switches based on analysisMode flag */}
                            {(() => {
                                const isLive = tipData.analysisMode === 'live';
                                const modeColor = isLive ? GREEN : NEON;
                                const modeBg    = isLive ? 'rgba(0,255,136,0.06)' : 'rgba(0,229,255,0.06)';
                                return (
                                    <div className="ultra-glass animate-fade-up" style={{
                                        padding: '14px 20px',
                                        borderRadius: 'var(--radius-md)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: 12,
                                        borderLeft: `4px solid ${modeColor}`,
                                        background: `linear-gradient(90deg, ${modeBg} 0%, transparent 100%)`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="pulse-dot" style={{ backgroundColor: modeColor, boxShadow: `0 0 8px ${modeColor}` }}></div>
                                            <span style={{ color: modeColor, fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                                {isLive ? '⚡ Live Odds Mode' : '📋 History-Based Analysis'}
                                            </span>
                                        </div>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                            {isLive
                                                ? '🟢 Live match data was available — predictions are based on real upcoming teams and live odds.'
                                                : '📊 No live matches were active — tips are based on past match patterns from this date.'}
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* AI Tool Request Warning (if any) */}
                            {tipData.Tool_Requests && (tipData.Tool_Requests.capture_league || tipData.Tool_Requests.team_track_request) && (
                                <div className="ultra-glass" style={{ borderLeft: `4px solid ${ORANGE}`, background: `linear-gradient(90deg, rgba(255,107,53,0.1) 0%, transparent 100%)`, padding: '20px' }}>
                                    <h4 style={{ color: ORANGE, margin: '0 0 10px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}><span className="pulse-dot" style={{ backgroundColor: ORANGE, boxShadow: `0 0 10px ${ORANGE}` }}></span> AI Tool Action Requested</h4>
                                    {tipData.Tool_Requests.capture_league && <p style={{ margin: '0 0 6px', fontSize: '0.9rem', color: '#eee' }}>• The model requested a live automated data sync to bypass memory cache.</p>}
                                    {tipData.Tool_Requests.team_track_request && <p style={{ margin: 0, fontSize: '0.9rem', color: '#eee' }}>• The model requested deep historic tracking specifically on: <strong style={{ color: ORANGE }}>{tipData.Tool_Requests.team_track_request}</strong>.</p>}
                                </div>
                            )}

                            {/* Self Evaluation Card */}
                            {tipData.Self_Evaluation && (
                                <div className="ultra-glass hover-lift animate-fade-up premium-glow-border" style={{ padding: '30px', marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
                                        <div style={{ flex: 1, minWidth: '300px' }}>
                                            <h2 style={{ margin: '0 0 12px', fontSize: '1.4rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ fontSize: '1.8rem' }}>{tipData.Self_Evaluation.emoji || '🎯'}</span> How Accurate Were Yesterday's Tips?
                                            </h2>
                                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                                {tipData.Self_Evaluation.review}
                                            </p>
                                        </div>
                                        <div style={{ textAlign: 'right', background: 'rgba(0,0,0,0.3)', padding: '20px 30px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div className="text-gradient" style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1, backgroundImage: `linear-gradient(135deg, ${tipData.Self_Evaluation.score?.includes('10/') || tipData.Self_Evaluation.score?.includes('9/') || tipData.Self_Evaluation.score?.includes('8/') ? GREEN + ', #00cc66' : ORANGE + ', #ff3300'})` }}>
                                                {tipData.Self_Evaluation.score}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 8, fontWeight: 700 }}>Tip Accuracy Score</div>
                                        </div>
                                    </div>
                                    
                                    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{ background: `rgba(0, 229, 255, 0.1)`, padding: '6px 12px', borderRadius: '20px', color: NEON, fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>What to Improve</div>
                                        <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.5 }}>{tipData.Self_Evaluation.improvement}</div>
                                    </div>
                                </div>
                            )}

                            {/* Context */}
                            <div className="hud-panel animate-fade-up hover-lift" style={{ padding: '28px', marginBottom: '8px', animationDelay: '0.1s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                    <div className="pulse-dot" style={{ backgroundColor: PURPLE, boxShadow: `0 0 10px ${PURPLE}` }}></div>
                                    <div style={{ fontSize: '0.8rem', color: PURPLE, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today's Match Context</div>
                                </div>
                                <div style={{ color: '#fff', lineHeight: 1.6, fontSize: '1.05rem', fontWeight: 300 }}>{tipData.context}</div>
                            </div>

                            {/* Upcoming Match Predictions Grid */}
                            <div className="animate-fade-up" style={{ animationDelay: '0.2s', marginTop: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                    <span style={{ fontSize: '1.5rem' }}>⚡</span>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                                        Live Upcoming Predictions
                                    </h3>
                                </div>

                                {tipData.upcoming_matches && tipData.upcoming_matches.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                                        {tipData.upcoming_matches.map((match, idx) => {
                                            const [homeTeam, awayTeam] = (match.fixture || '').split(' vs ').map(s => s?.trim());
                                            const homeForm = teamForms[homeTeam];
                                            const awayForm = teamForms[awayTeam];
                                            return (
                                            <div key={idx} className="ultra-glass hover-lift" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', borderTop: `4px solid ${GREEN}` }}>
                                                {/* Fixture Header with Form Badges */}
                                                <div style={{ marginBottom: '16px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '8px' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Home</div>
                                                            <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{homeTeam || '?'}</div>
                                                            {homeForm && <div style={{ marginTop: 6 }}><FormBadges form={homeForm.recentForm} /></div>}
                                                            {homeForm?.streak && (
                                                                <div style={{ fontSize: '0.68rem', color: homeForm.streak.includes('winning') ? GREEN : homeForm.streak.includes('losing') ? RED : 'var(--text-muted)', marginTop: 4, fontWeight: 700 }}>
                                                                    {homeForm.streak}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ padding: '0 16px', color: 'rgba(255,255,255,0.25)', fontWeight: 900, fontSize: '1.2rem' }}>vs</div>
                                                        <div style={{ flex: 1, textAlign: 'right' }}>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Away</div>
                                                            <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{awayTeam || '?'}</div>
                                                            {awayForm && <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}><FormBadges form={awayForm.recentForm} /></div>}
                                                            {awayForm?.streak && (
                                                                <div style={{ fontSize: '0.68rem', color: awayForm.streak.includes('winning') ? GREEN : awayForm.streak.includes('losing') ? RED : 'var(--text-muted)', marginTop: 4, fontWeight: 700, textAlign: 'right' }}>
                                                                    {awayForm.streak}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Behaviour Pattern Signals */}
                                                {tipData.behaviourSignals && (() => {
                                                    const bData = tipData.behaviourSignals.find(s => s.fixture === match.fixture);
                                                    if (!bData || bData.signals.length === 0) return null;
                                                    return (
                                                        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {bData.signals.map((sig, sIdx) => (
                                                                <div key={sIdx} style={{ background: 'rgba(247, 148, 29, 0.1)', border: '1px solid rgba(247, 148, 29, 0.3)', borderLeft: '3px solid #f7941d', borderRadius: 4, padding: '8px 12px', fontSize: '0.75rem', color: '#f7941d' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                                        <span style={{ fontWeight: 800 }}>⚠️ {sig.patternType.replace(/_/g, ' ')}</span>
                                                                        <span style={{ fontSize: '0.65rem', background: 'rgba(247, 148, 29, 0.2)', padding: '2px 6px', borderRadius: 12, fontWeight: 700 }}>{sig.riskLevel} RISK</span>
                                                                    </div>
                                                                    <div style={{ color: 'white', lineHeight: 1.4 }}>{sig.message}</div>
                                                                    {sig.biasToward && <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#f7941d', fontWeight: 600 }}>→ AI Bias Adjusted: {sig.biasToward} ({sig.biasLabel})</div>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px' }}>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>🎯 Exact Score</span>
                                                        <span style={{ color: GOLD, fontWeight: 900, fontSize: '1.2rem', fontFamily: 'monospace' }}>{match.exact_score}</span>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>👑 Winner</span>
                                                        <span style={{ color: NEON, fontWeight: 700, fontSize: '0.95rem' }}>{match.match_winner}</span>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px' }}>
                                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>O 1.5</div>
                                                            <div style={{ fontSize: '0.9rem', color: match.over_1_5?.toLowerCase().includes('yes') ? GREEN : RED, fontWeight: 700, marginTop: '2px' }}>{match.over_1_5}</div>
                                                        </div>
                                                        <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px' }}>
                                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>O 2.5</div>
                                                            <div style={{ fontSize: '0.9rem', color: match.over_2_5?.toLowerCase().includes('yes') ? GREEN : RED, fontWeight: 700, marginTop: '2px' }}>{match.over_2_5}</div>
                                                        </div>
                                                        <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '6px' }}>
                                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>GG</div>
                                                            <div style={{ fontSize: '0.9rem', color: match.gg?.toLowerCase().includes('yes') ? GREEN : RED, fontWeight: 700, marginTop: '2px' }}>{match.gg}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ background: 'rgba(167,139,250,0.05)', borderLeft: `2px solid ${PURPLE}`, padding: '12px 14px', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                                    <strong style={{ color: PURPLE, display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>AI Reasoning</strong>
                                                    {match.prediction_reasoning}
                                                </div>
                                            </div>
                                        );
                                        })}
                                    </div>
                                ) : (
                                    <div className="ultra-glass" style={{ padding: '30px', textAlign: 'center', borderRadius: 'var(--radius-lg)' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>📡</div>
                                        <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: '1.2rem' }}>No Upcoming Matches Found</h4>
                                        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>The live scraper didn't detect any active upcoming matches for this league on the odds page.</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>

                {/* ─── RIGHT NAV / SIDEBAR: AI Knowledge & Strategy ─────────────────── */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* 🤖 AI Engine Selector — always pinned to top of sidebar */}
                    <div className="ultra-glass animate-fade-up" style={{ padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(167,139,250,0.2)', background: 'linear-gradient(180deg, rgba(167,139,250,0.04) 0%, transparent 100%)' }}>
                        <AIProviderSelector
                            selectedProvider={aiProvider}
                            onSelect={id => {
                                setAiProvider(id);
                                console.log(`[DailyTips] 🔄 AI provider set to: ${id}`);
                            }}
                        />
                    </div>

                    {/* How it works info panel */}
                    <div className="ultra-glass animate-fade-up" style={{ padding: '20px', borderRadius: 'var(--radius-md)', borderLeft: `4px solid ${GOLD}`, background: `linear-gradient(90deg, rgba(255,215,0,0.05) 0%, transparent 100%)` }}>
                        <div style={{ fontSize: '0.75rem', color: GOLD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>💡 How This Page Works</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { icon: '1️⃣', text: 'Select a league from the dropdown above.' },
                                { icon: '2️⃣', text: 'Click "Predict Upcoming Matches". The system fetches real-time upcoming odds from the scraper.' },
                                { icon: '3️⃣', text: 'The AI uses today\'s completed match database to detect form and scoring patterns.' },
                                { icon: '4️⃣', text: 'It generates a high-confidence prediction tile for every single upcoming match.' },
                                { icon: '5️⃣', text: 'Use "Re-Analyze" periodically to fetch the newest batch of upcoming matches.' },
                            ].map((step, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{step.icon}</span>
                                    <span>{step.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Strategy Panel */}
                    <div className="ultra-glass hover-lift animate-fade-up" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', animationDelay: '0.1s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16, marginBottom: 18 }}>
                            <div style={{ width: 38, height: 38, background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: `0 4px 16px ${PURPLE}50`, fontSize: '1.1rem', flexShrink: 0 }}>🧠</div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 800 }}>AI Prediction Rules</h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>What the AI is currently focusing on</div>
                            </div>
                        </div>

                        {strategyData ? (
                            <div>
                                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 18px' }}>
                                    {strategyData.currentStrategy}
                                </p>
                                <div style={{ fontSize: '0.72rem', color: PURPLE, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                                    Active Rules
                                </div>
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {strategyData.activeRules?.map((r, i) => (
                                        <li key={i} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '8px 12px', background: 'rgba(167,139,250,0.07)', borderRadius: 8, border: '1px solid rgba(167,139,250,0.12)', display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5 }}>
                                            <span style={{ color: NEON, fontWeight: 900, flexShrink: 0 }}>✓</span>{r}
                                        </li>
                                    ))}
                                </ul>
                                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Times Used</span>
                                    <span style={{ color: PURPLE, fontWeight: 800, fontSize: '1.1rem' }}>{strategyData.timesUsed || 0}</span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <div className="spinner spinner-small" style={{ borderTopColor: PURPLE }} />
                                Loading strategy parameters…
                            </div>
                        )}
                    </div>

                    {/* League Intelligence Panel */}
                    <div className="ultra-glass hover-lift animate-fade-up" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', border: `1px solid ${NEON}25`, background: `linear-gradient(180deg, rgba(0,229,255,0.04) 0%, transparent 100%)`, animationDelay: '0.2s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16, marginBottom: 18 }}>
                            <div style={{ width: 38, height: 38, background: `linear-gradient(135deg, ${NEON}90, #0284c7)`, borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: `0 4px 16px ${NEON}40`, fontSize: '1.1rem', flexShrink: 0 }}>📊</div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 800 }}>League Profile</h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>What the AI knows about this league</div>
                            </div>
                        </div>

                        {intelligenceData ? (
                            <div>
                                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
                                    {typeof intelligenceData.profile === 'string' ? intelligenceData.profile : intelligenceData.profile?.leagueVibe || "No formal intelligence report exists for this league yet."}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,229,255,0.06)', borderRadius: 8, border: '1px solid rgba(0,229,255,0.12)' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Last Validated:</span>
                                    <span style={{ fontSize: '0.8rem', color: NEON, fontWeight: 700 }}>{intelligenceData.lastTrainedDate || 'N/A'}</span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <div className="spinner spinner-small" style={{ borderTopColor: NEON }} />
                                Loading league profile…
                            </div>
                        )}
                    </div>

                    {/* 🧬 League DNA Baseline card — statistical priors driving AI predictions for this league */}
                    <div className="ultra-glass hover-lift animate-fade-up" style={{
                        padding: '24px', borderRadius: 'var(--radius-lg)',
                        border: `1px solid rgba(0,229,255,0.18)`,
                        background: `linear-gradient(180deg, rgba(0,229,255,0.04) 0%, transparent 100%)`,
                        animationDelay: '0.15s',
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16, marginBottom: 18 }}>
                            <div style={{ width: 38, height: 38, background: `linear-gradient(135deg, #00E5FF, #7c3aed)`, borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: `0 4px 16px rgba(0,229,255,0.3)`, fontSize: '1.1rem', flexShrink: 0 }}>🧬</div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 800 }}>League DNA Baseline</h3>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Statistical priors injected into AI predictions</div>
                            </div>
                        </div>

                        {leagueDNA?.stats ? (() => {
                            const s  = leagueDNA.stats;
                            const gc = (v, hi, mi) => v >= hi ? GREEN : v >= mi ? GOLD : RED;
                            const stats = [
                                { label: 'Over 1.5 Goals',     val: s.over1_5Percent, hi: 75, mi: 70 },
                                { label: 'Over 2.5 Goals',     val: s.over2_5Percent, hi: 55, mi: 49 },
                                { label: 'BTTS (GG)',          val: s.bttsPercent,    hi: 55, mi: 50 },
                                { label: 'Home Win Rate',      val: s.homeWinPercent, hi: 43, mi: 40 },
                                { label: 'Draw Rate',          val: s.drawPercent,    hi: 26, mi: 24 },
                            ];
                            const directives = [];
                            if (s.over1_5Percent >= 75)  directives.push({ icon: '⚡', color: GREEN,  text: `STRONG O1.5 — AI defaults to Over 1.5` });
                            if (s.drawPercent    >= 26)  directives.push({ icon: '⚠️', color: GOLD,   text: `DRAW MAGNET — Always assess 1X double chance` });
                            if (s.bttsPercent    >= 55)  directives.push({ icon: '⚽', color: NEON,   text: `STRONG BTTS — GG market is statistically sound` });
                            if (s.over2_5Percent < 45)   directives.push({ icon: '🛡️', color: ORANGE, text: `U2.5 SAFE — Caution on Over 2.5 bets` });
                            return (
                                <div>
                                    {/* Stat bars */}
                                    {stats.map((st, i) => (
                                        <div key={i} style={{ marginBottom: 11 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>{st.label}</span>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 900, color: gc(st.val, st.hi, st.mi), fontFamily: 'monospace' }}>{st.val ?? '?'}%</span>
                                            </div>
                                            <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.min(st.val ?? 0, 100)}%`, background: `linear-gradient(90deg, ${gc(st.val, st.hi, st.mi)}60, ${gc(st.val, st.hi, st.mi)})`, borderRadius: 2, transition: 'width 0.9s ease' }} />
                                            </div>
                                        </div>
                                    ))}

                                    {/* Top Scorelines */}
                                    {leagueDNA.topScores?.length > 0 && (
                                        <div style={{ marginTop: 16 }}>
                                            <div style={{ fontSize: '0.62rem', color: GOLD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>🎯 Top Scorelines</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                                {leagueDNA.topScores.slice(0, 3).map((sc, i) => (
                                                    <span key={i} style={{
                                                        fontSize: '0.7rem', fontWeight: 900, fontFamily: 'monospace',
                                                        padding: '3px 8px', borderRadius: 6,
                                                        background: i === 0 ? `${GOLD}15` : 'rgba(255,255,255,0.05)',
                                                        color: i === 0 ? GOLD : 'rgba(255,255,255,0.7)',
                                                        border: `1px solid ${i === 0 ? GOLD + '30' : 'rgba(255,255,255,0.08)'}`,
                                                    }}>
                                                        {sc.score} <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>({sc.percent}%)</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Active directives */}
                                    {directives.length > 0 && (
                                        <div style={{ marginTop: 14 }}>
                                            <div style={{ fontSize: '0.62rem', color: PURPLE, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>⚙️ Active AI Directives</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                {directives.map((d, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '0.7rem', color: d.color, padding: '4px 8px', background: `${d.color}08`, border: `1px solid ${d.color}20`, borderRadius: 5 }}>
                                                        <span style={{ flexShrink: 0 }}>{d.icon}</span>
                                                        <span>{d.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ marginTop: 12, fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{(leagueDNA.matchCount || 0).toLocaleString()} matches analysed</span>
                                        <span>𝑥̄ {Number(leagueDNA.stats?.avgGoals || 0).toFixed(2)} goals/match</span>
                                    </div>
                                </div>
                            );
                        })() : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                <span style={{ fontSize: '1.2rem' }}>📊</span>
                                <span>No DNA baseline for this league yet.<br/><span style={{ fontSize: '0.72rem', opacity: 0.7 }}>Run Admin → Sync All to generate.</span></span>
                            </div>
                        )}
                    </div>

                    {/* ── Historical Prediction Tracking ───────────────────────────────── */}
                    <div className="ultra-glass animate-fade-up" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', animationDelay: '0.2s', maxHeight: '500px', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div className="pulse-dot" style={{ backgroundColor: GOLD, boxShadow: `0 0 10px ${GOLD}` }}></div>
                            <h4 style={{ margin: 0, fontSize: '0.85rem', color: GOLD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>History Tracker</h4>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {predictionHistory.length > 0 ? predictionHistory.map((histLog) => (
                                <div key={histLog.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '14px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>📅 {histLog.date}</span>
                                        <span style={{ color: PURPLE }}>{histLog.tipData?.upcoming_matches?.length || 0} Matches</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {histLog.tipData?.upcoming_matches?.map((match, idx) => (
                                            <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#fff', fontWeight: 600 }}>{match.fixture?.split(' vs ').map(t => t.substring(0, 3)).join(' v ')}</span>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <span style={{ background: `rgba(255,215,0,0.15)`, color: GOLD, padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{match.exact_score}</span>
                                                    <span style={{ background: `rgba(0,255,136,0.15)`, color: GREEN, padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{match.match_winner?.substring(0,3)}</span>
                                                </div>
                                            </div>
                                        )) || <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>No individual matches available for this day.</div>}
                                    </div>
                                </div>
                            )) : (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '10px' }}>No prior predictions tracked for this league yet.</div>
                            )}
                        </div>
                    </div>

                    {/* ── AI Activity Terminal ──────────────────────────────────────────── */}
                    <div className="ultra-glass animate-fade-up" style={{
                        padding: '0',
                        borderRadius: 'var(--radius-lg)',
                        border: `1px solid rgba(167,139,250,0.2)`,
                        overflow: 'hidden',
                        animationDelay: '0.3s',
                    }}>
                        {/* Terminal header bar */}
                        <div style={{
                            padding: '12px 18px',
                            background: 'rgba(167,139,250,0.08)',
                            borderBottom: '1px solid rgba(167,139,250,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: PURPLE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>AI Pipeline Terminal</span>
                            </div>
                            {aiLog.length > 0 && (
                                <button onClick={() => setAiLog([])} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}>
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* How it works pill */}
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            ℹ️ Shows what the AI does in real-time: fetching from Database, building prompts, using live scraper data, calling DeepSeek, saving results.
                        </div>

                        {/* Log entries */}
                        <div style={{ maxHeight: 220, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,0,0,0.35)', minHeight: 80 }}>
                            {aiLog.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', paddingTop: 16 }}>
                                    Stream idle — trigger an analysis to see live AI steps here.
                                </div>
                            ) : (
                                aiLog.map((log, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.78rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: '0.65rem', flexShrink: 0, marginTop: 2, minWidth: 68 }}>{log.displayTime}</span>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: actionColor[log.action] || '#fff', flexShrink: 0, marginTop: 5, boxShadow: `0 0 6px ${actionColor[log.action] || '#fff'}` }} />
                                        <span style={{ color: actionColor[log.action] || 'rgba(255,255,255,0.85)', lineHeight: 1.45 }}>{log.message}</span>
                                    </div>
                                ))
                            )}
                            <div ref={aiLogEndRef} />
                        </div>
                    </div>

                </aside>

            </main>
        </div>
    );
}
