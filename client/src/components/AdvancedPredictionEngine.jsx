import React, { useState } from 'react';

export default function AdvancedPredictionEngine() {
  const [league, setLeague] = useState('England Virtual');
  const [homeTeam, setHomeTeam] = useState('ARS');
  const [awayTeam, setAwayTeam] = useState('CHE');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runAnalysis = async () => {
    if (!homeTeam || !awayTeam) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/advanced-engine/analyze?league=${encodeURIComponent(league)}&homeTeam=${encodeURIComponent(homeTeam)}&awayTeam=${encodeURIComponent(awayTeam)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <header style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
          <span className="glow-text">Advanced AI Engine</span> <span style={{ fontSize: '1rem', color: 'var(--accent-purple)' }}>V1 Sandbox</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Test the deep mathematical and AI-driven prediction models. This engine computes Elo rating proxies, Form momentum, and Poisson distribution, then feeds the raw math to the LLM for a contextual risk assessment.
        </p>
      </header>

      {/* Control Panel */}
      <div className="ultra-glass premium-glow-border" style={{ padding: '30px', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: 'var(--accent-neon)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🎛️</span> Engine Controls
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>League</label>
            <input 
              value={league} onChange={e => setLeague(e.target.value)} 
              style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.5)', color: 'white', outline: 'none' }} 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Home Team</label>
            <input 
              value={homeTeam} onChange={e => setHomeTeam(e.target.value)} 
              style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.5)', color: 'white', outline: 'none' }} 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Away Team</label>
            <input 
              value={awayTeam} onChange={e => setAwayTeam(e.target.value)} 
              style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.5)', color: 'white', outline: 'none' }} 
            />
          </div>
        </div>
        <button 
          onClick={runAnalysis} 
          disabled={loading}
          style={{ 
            marginTop: '24px', width: '100%', padding: '16px', borderRadius: 'var(--radius-md)',
            background: loading ? 'rgba(0, 229, 255, 0.1)' : 'linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(167, 139, 250, 0.2))',
            border: '1px solid var(--accent-neon)', color: 'var(--accent-neon)', fontSize: '1.1rem', fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', boxShadow: '0 0 20px rgba(0, 229, 255, 0.1)'
          }}
          className="hover-lift"
        >
          {loading ? 'Crunching Numbers & Prompting AI...' : '🚀 Run Deep Analysis'}
        </button>
      </div>

      {/* Results Panel */}
      {error && (
        <div style={{ padding: '20px', background: 'rgba(255, 51, 85, 0.1)', border: '1px solid var(--accent-live)', color: 'var(--accent-live)', borderRadius: 'var(--radius-md)' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeUp 0.5s ease forwards' }}>
          <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-purple)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--accent-purple)' }}>📊 Mathematical Baseline (Layer 1)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>Home: {result.stats.homeTeam}</h4>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div><strong>Win Rate (Last 10):</strong> {result.stats.homeForm.winRate}%</div>
                  <div><strong>Avg Goals Scored:</strong> {result.stats.homeForm.avgScored}</div>
                  <div><strong>Avg Goals Conceded:</strong> {result.stats.homeForm.avgConceded}</div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>Away: {result.stats.awayTeam}</h4>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div><strong>Win Rate (Last 10):</strong> {result.stats.awayForm.winRate}%</div>
                  <div><strong>Avg Goals Scored:</strong> {result.stats.awayForm.avgScored}</div>
                  <div><strong>Avg Goals Conceded:</strong> {result.stats.awayForm.avgConceded}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-neon)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--accent-neon)', display: 'flex', justifyContent: 'space-between' }}>
              <span>🤖 AI Contextual Risk Assessment (Layer 2)</span>
              {result.aiAnalysis && <span style={{ background: 'rgba(0, 229, 255, 0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem' }}>Confidence Check Done</span>}
            </h3>
            
            {result.aiAnalysis ? (
              <div style={{ fontSize: '1rem', lineHeight: '1.6', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                {result.aiAnalysis}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>AI response parsing failed.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
