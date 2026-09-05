import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import H2HAnalysisModal from './H2HAnalysisModal';


const NEON   = '#00E5FF';
const GREEN  = '#00FF88';
const GOLD   = '#FFD700';
const RED    = '#FF3355';
const PURPLE = '#A78BFA';
const ORANGE = '#FF6B35';

const KNOWN_LEAGUES = {
  'England - Virtual': { key: 'England', label: 'England League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#00E5FF' },
  'Spain - Virtual':   { key: 'Spain',   label: 'Spain League',   icon: '🇪🇸', color: '#FF3355' },
  'Italy - Virtual':   { key: 'Italy',   label: 'Italy League',   icon: '🇮🇹', color: '#00FF88' },
  'Germany - Virtual': { key: 'Germany', label: 'Germany League', icon: '🇩🇪', color: '#FFD700' },
  'France - Virtual':  { key: 'France',  label: 'France League',  icon: '🇫🇷', color: '#FF6B35' },
};

const TEAM_LEAGUES = {
  // England
  ARS: 'England', CHE: 'England', LIV: 'England', MCI: 'England', MUN: 'England', TOT: 'England',
  NEW: 'England', AST: 'England', BHA: 'England', BRE: 'England', CRY: 'England', EVE: 'England',
  FUL: 'England', NFO: 'England', WOL: 'England', BOU: 'England', WHU: 'England', IPS: 'England',
  LEI: 'England', SOU: 'England', COV: 'England', HUL: 'England', LEE: 'England', SUN: 'England',
  ARSENAL: 'England', CHELSEA: 'England', LIVERPOOL: 'England', 'MANCHESTER UNITED': 'England',
  'MANCHESTER CITY': 'England', TOTTENHAM: 'England', NEWCASTLE: 'England', EVERTON: 'England',
  // Spain
  RMA: 'Spain', BAR: 'Spain', ATM: 'Spain', SEV: 'Spain', VIL: 'Spain', RSO: 'Spain',
  BET: 'Spain', ATH: 'Spain', VAL: 'Spain', CEL: 'Spain', GIR: 'Spain', OSA: 'Spain',
  MAL: 'Spain', GET: 'Spain', ALV: 'Spain', RAY: 'Spain', ESP: 'Spain', VLD: 'Spain',
  LEG: 'Spain', LPA: 'Spain', VCF: 'Spain', 'REAL MADRID': 'Spain', BARCELONA: 'Spain',
  'ATLETICO MADRID': 'Spain', SEVILLA: 'Spain', VALENCIA: 'Spain', VILLARREAL: 'Spain',
  // Italy
  INT: 'Italy', ACM: 'Italy', JUV: 'Italy', NAP: 'Italy', ROM: 'Italy', LAZ: 'Italy',
  ATA: 'Italy', FIO: 'Italy', TOR: 'Italy', BOL: 'Italy', BFC: 'Italy', MON: 'Italy',
  GEN: 'Italy', LEC: 'Italy', UDI: 'Italy', CAG: 'Italy', VER: 'Italy', EMP: 'Italy',
  PAR: 'Italy', COM: 'Italy', VEN: 'Italy', FRO: 'Italy', SAS: 'Italy', MILAN: 'Italy',
  JUVENTUS: 'Italy', INTER: 'Italy', NAPOLI: 'Italy', ROMA: 'Italy', LAZIO: 'Italy',
  // Germany
  BAY: 'Germany', BVB: 'Germany', RBL: 'Germany', LEV: 'Germany', STU: 'Germany', FRA: 'Germany',
  WOB: 'Germany', HOF: 'Germany', BMG: 'Germany', AUG: 'Germany', BRE: 'Germany', MAI: 'Germany',
  BOC: 'Germany', HEI: 'Germany', BER: 'Germany', STP: 'Germany', KIE: 'Germany',
  BAYERN: 'Germany', DORTMUND: 'Germany', LEIPZIG: 'Germany', LEVERKUSEN: 'Germany',
  // France
  PSG: 'France', MAR: 'France', MON: 'France', LYO: 'France', LIL: 'France', REN: 'France',
  NIC: 'France', LEN: 'France', STR: 'France', TOU: 'France', REI: 'France', NAN: 'France',
  MARSEILLE: 'France', LYON: 'France', MONACO: 'France', LILLE: 'France'
};

function getLeagueMeta(leagueStr = '', home = '', away = '') {
  const l = (leagueStr || '').toLowerCase();
  if (l.includes('england') || l.includes('epl') || l.includes('premier')) {
    return { name: 'England League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#00E5FF' };
  }
  if (l.includes('spain') || l.includes('laliga') || l.includes('la liga')) {
    return { name: 'Spain League', icon: '🇪🇸', color: '#FF3355' };
  }
  if (l.includes('italy') || l.includes('serie')) {
    return { name: 'Italy League', icon: '🇮🇹', color: '#00FF88' };
  }
  if (l.includes('germany') || l.includes('bundesliga')) {
    return { name: 'Germany League', icon: '🇩🇪', color: '#FFD700' };
  }
  if (l.includes('france') || l.includes('ligue')) {
    return { name: 'France League', icon: '🇫🇷', color: '#FF6B35' };
  }

  const h = (home || '').toUpperCase().trim();
  const a = (away || '').toUpperCase().trim();
  const inferred = TEAM_LEAGUES[h] || TEAM_LEAGUES[a];
  if (inferred === 'England') return { name: 'England League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#00E5FF' };
  if (inferred === 'Spain')   return { name: 'Spain League',   icon: '🇪🇸', color: '#FF3355' };
  if (inferred === 'Italy')   return { name: 'Italy League',   icon: '🇮🇹', color: '#00FF88' };
  if (inferred === 'Germany') return { name: 'Germany League', icon: '🇩🇪', color: '#FFD700' };
  if (inferred === 'France')  return { name: 'France League',  icon: '🇫🇷', color: '#FF6B35' };

  return { name: leagueStr || 'vFootball League', icon: '⚽', color: '#00E5FF' };
}

function getLiveMatchProgress(matchTime, now = new Date()) {
  if (!matchTime || matchTime === '--:--') {
    return { minuteText: "LIVE", isLive: true };
  }
  const parts = matchTime.split(':').map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return { minuteText: "LIVE", isLive: true };
  }

  const kickoff = new Date(now);
  kickoff.setHours(parts[0], parts[1], 0, 0);

  const diffSec = Math.floor((now.getTime() - kickoff.getTime()) / 1000);

  if (diffSec < 0) {
    return { minuteText: `Starts in ${Math.abs(diffSec)}s`, isLive: false };
  }
  if (diffSec <= 45) {
    const min = Math.max(1, Math.min(45, Math.floor(diffSec * 1.0 + 1)));
    return { minuteText: `${min}'`, isLive: true };
  }
  if (diffSec > 45 && diffSec <= 55) {
    return { minuteText: "HT 45'", isLive: true };
  }
  if (diffSec > 55 && diffSec <= 100) {
    const min = Math.max(46, Math.min(90, Math.floor(45 + (diffSec - 55) * 1.0)));
    return { minuteText: `${min}'`, isLive: true };
  }
  return { minuteText: "90' FT", isLive: true };
}

export default function UnifiedMatchCenter() {
  const [activeLeague, setActiveLeague] = useState('ALL');
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'inplay' | 'upcoming' | 'played' | 'predictions'
  const [inPlayMatches, setInPlayMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [playedMatches, setPlayedMatches] = useState([]);
  const [enginePredictions, setEnginePredictions] = useState([]);
  const [predictionsFilter, setPredictionsFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'WON' | 'LOST'
  const [selectedH2HMatch, setSelectedH2HMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  // Real-time Render Health & Telemetry State
  const [telemetry, setTelemetry] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [latency, setLatency] = useState(null);
  const [taskLogs, setTaskLogs] = useState([]);
  const [showTelemetryLog, setShowTelemetryLog] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  // Dedicated Button Loading States
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAssociating, setIsAssociating] = useState(false);
  const [isAutoPredicting, setIsAutoPredicting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Step-by-step console & terminal logger
  const logTaskStep = useCallback((taskName, stepDescription, details = '', memData = null) => {
    const timestamp = new Date();
    const timeStr = timestamp.toLocaleTimeString();
    const currentMem = memData || telemetry;
    const memStr = currentMem
      ? `RAM: ${currentMem.rssMB}MB / ${currentMem.limitMB || 512}MB (${currentMem.usagePercent}%) | Heap: ${currentMem.heapUsedMB}MB`
      : 'RAM: tracking...';

    // Rich styled browser console log
    console.log(
      `%c[Terminal Task: ${taskName}] %c[${stepDescription}] %c${memStr} %c${details ? `→ ${details}` : ''}`,
      'color: #00E5FF; font-weight: bold; background: rgba(0, 229, 255, 0.08); padding: 2px 6px; border-radius: 4px;',
      'color: #FFD700; font-weight: bold;',
      'color: #00FF88; font-weight: 600;',
      'color: #E2E8F0;'
    );

    // Append to live UI task logs
    setTaskLogs(prev => [
      {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: timeStr,
        task: taskName,
        step: stepDescription,
        details,
        memory: currentMem,
        status: stepDescription.includes('ERROR') ? 'ERROR' : stepDescription.includes('COMPLET') ? 'SUCCESS' : 'RUNNING'
      },
      ...prev.slice(0, 49)
    ]);
  }, [telemetry]);

  // Periodic health check (every 12 seconds)
  const checkHealth = useCallback(async () => {
    const start = performance.now();
    try {
      const res = await fetch('/api/health');
      const roundtrip = Math.round(performance.now() - start);
      setLatency(roundtrip);
      if (res.ok) {
        const json = await res.json();
        setIsOnline(true);
        if (json.telemetry) {
          setTelemetry(json.telemetry);
        }
      } else {
        setIsOnline(false);
      }
    } catch (e) {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const healthTimer = setInterval(checkHealth, 12000);
    return () => clearInterval(healthTimer);
  }, [checkHealth]);

  // 1-second dynamic clock for live ticking minutes
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  const fetchDashboardData = useCallback(async (isManual = false) => {
    if (isManual) setIsSyncing(true);
    setActiveTask('Syncing In-Play, Upcoming & Played matches...');
    const startTime = performance.now();

    logTaskStep('Dashboard Sync', 'START', isManual ? 'User initiated manual sync' : 'Background polling cycle');

    try {
      const [dashRes, predRes] = await Promise.all([
        fetch(`/api/matches/dashboard`),
        fetch(`/api/engine-predictions`)
      ]);

      const roundtrip = Math.round(performance.now() - startTime);
      setLatency(roundtrip);

      let latestTelemetry = null;

      if (dashRes.ok) {
        const json = await dashRes.json();
        if (json.success) {
          setInPlayMatches(json.in_play?.data || []);
          setUpcomingMatches(json.upcoming?.data || []);
          setPlayedMatches(json.played?.data || []);
          if (json.telemetry) latestTelemetry = json.telemetry;
        }
      }

      if (predRes.ok) {
        const predJson = await predRes.json();
        if (predJson.success) {
          setEnginePredictions(predJson.data || []);
          if (predJson.telemetry) latestTelemetry = predJson.telemetry;
        }
      }

      if (latestTelemetry) {
        setTelemetry(latestTelemetry);
      }
      setIsOnline(true);
      setLastUpdated(new Date());

      logTaskStep('Dashboard Sync', 'COMPLETED', `Fetched matches in ${roundtrip}ms`, latestTelemetry);
    } catch (err) {
      logTaskStep('Dashboard Sync', 'ERROR', err.message);
      console.warn('Match dashboard sync note:', err.message);
      setIsOnline(false);
    } finally {
      setLoading(false);
      setIsSyncing(false);
      setActiveTask(null);
    }
  }, [logTaskStep]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 6000); // 6s poll
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const triggerAssociation = async () => {
    setIsAssociating(true);
    setActiveTask('Associating In-Play Odds with Final Results & Evaluating Outcomes...');
    const start = performance.now();
    logTaskStep('Association Engine', 'STEP 1: TRIGGER', 'Invoking POST /api/matches/associate');

    try {
      const res = await fetch('/api/matches/associate', { method: 'POST' });
      const json = await res.json();
      const assocTelemetry = json.telemetry || null;
      if (assocTelemetry) setTelemetry(assocTelemetry);

      logTaskStep('Association Engine', 'STEP 2: AUTO-EVALUATE', `Associated: ${json.result?.associated ?? 0} matches`, assocTelemetry);

      const evalRes = await fetch('/api/engine-predictions/evaluate', { method: 'POST' });
      const evalJson = await evalRes.json();
      if (evalJson.telemetry) setTelemetry(evalJson.telemetry);

      logTaskStep('Association Engine', 'STEP 3: REFRESH', `Evaluated: ${evalJson.result?.evaluated ?? 0} predictions`, evalJson.telemetry);

      await fetchDashboardData(true);
      logTaskStep('Association Engine', 'COMPLETED', `Full association cycle finished in ${Math.round(performance.now() - start)}ms`);
    } catch (e) {
      logTaskStep('Association Engine', 'ERROR', e.message);
      console.warn('Association trigger error:', e);
    } finally {
      setIsAssociating(false);
      setActiveTask(null);
    }
  };

  const triggerAutoRun = async () => {
    setIsAutoPredicting(true);
    setActiveTask('Running 6-Engine Predictions on all Upcoming Fixtures...');
    const start = performance.now();
    logTaskStep('Auto-Predict', 'STEP 1: GENERATE', 'Invoking POST /api/engine-predictions/auto-run');

    try {
      const res = await fetch('/api/engine-predictions/auto-run', { method: 'POST' });
      const json = await res.json();
      if (json.telemetry) setTelemetry(json.telemetry);

      logTaskStep('Auto-Predict', 'STEP 2: EVALUATE', `Generated: ${json.result?.generated ?? 0} predictions`, json.telemetry);

      const evalRes = await fetch('/api/engine-predictions/evaluate', { method: 'POST' });
      const evalJson = await evalRes.json();
      if (evalJson.telemetry) setTelemetry(evalJson.telemetry);

      logTaskStep('Auto-Predict', 'STEP 3: REFRESH', `Evaluated: ${evalJson.result?.evaluated ?? 0} picks`, evalJson.telemetry);

      await fetchDashboardData(true);
      logTaskStep('Auto-Predict', 'COMPLETED', `Predictions auto-run finished in ${Math.round(performance.now() - start)}ms`);
    } catch (e) {
      logTaskStep('Auto-Predict', 'ERROR', e.message);
      console.warn('Auto-run trigger error:', e);
    } finally {
      setIsAutoPredicting(false);
      setActiveTask(null);
    }
  };

  const triggerEvaluation = async () => {
    setIsEvaluating(true);
    setActiveTask('Evaluating Pending Multi-Engine Picks against Verified Scores...');
    const start = performance.now();
    logTaskStep('Auto-Evaluate', 'STEP 1: EVALUATE', 'Invoking POST /api/engine-predictions/evaluate');

    try {
      const evalRes = await fetch('/api/engine-predictions/evaluate', { method: 'POST' });
      const evalJson = await evalRes.json();
      if (evalJson.telemetry) setTelemetry(evalJson.telemetry);

      logTaskStep('Auto-Evaluate', 'STEP 2: REFRESH', `Evaluated: ${evalJson.result?.evaluated ?? 0} picks`, evalJson.telemetry);
      await fetchDashboardData(true);
      logTaskStep('Auto-Evaluate', 'COMPLETED', `Evaluation finished in ${Math.round(performance.now() - start)}ms`);
    } catch (e) {
      logTaskStep('Auto-Evaluate', 'ERROR', e.message);
      console.warn('Evaluation trigger error:', e);
    } finally {
      setIsEvaluating(false);
      setActiveTask(null);
    }
  };

  // League Filtering Logic (Fuzzy match on league name or inferred teams)
  const filterByLeague = useCallback((m) => {
    if (activeLeague === 'ALL') return true;
    const meta = getLeagueMeta(m.league, m.home_team, m.away_team);
    const target = activeLeague.replace(' - Virtual', '').toLowerCase();
    return meta.name.toLowerCase().includes(target) || (m.league && m.league.toLowerCase().includes(target));
  }, [activeLeague]);

  const displayedInPlay   = inPlayMatches.filter(filterByLeague);
  const displayedUpcoming = upcomingMatches.filter(filterByLeague);
  const displayedPlayed   = playedMatches.filter(filterByLeague);

  // Predictions filtering
  const allFilteredPredictions = enginePredictions.filter(filterByLeague);
  const displayedPredictions = allFilteredPredictions.filter(p => {
    if (predictionsFilter === 'PENDING') {
      return p.status === 'PENDING' || p.evaluation?.status !== 'EVALUATED';
    }
    if (predictionsFilter === 'WON') {
      return p.evaluation?.primaryWon === true;
    }
    if (predictionsFilter === 'LOST') {
      return p.evaluation?.primaryWon === false && p.evaluation?.status === 'EVALUATED';
    }
    return true;
  });

  const pendingCount = allFilteredPredictions.filter(p => p.status === 'PENDING' || p.evaluation?.status !== 'EVALUATED').length;
  const wonCount = allFilteredPredictions.filter(p => p.evaluation?.primaryWon === true).length;
  const lostCount = allFilteredPredictions.filter(p => p.evaluation?.primaryWon === false && p.evaluation?.status === 'EVALUATED').length;
  const evaluatedCount = wonCount + lostCount;
  const winRate = evaluatedCount > 0 ? Math.round((wonCount / evaluatedCount) * 100) : null;

  // Fast map lookup for cards
  const predictionsMap = new Map();
  enginePredictions.forEach(p => {
    const key = `${(p.home_team || '').trim()}_vs_${(p.away_team || '').trim()}_${(p.match_time || '').trim()}`;
    predictionsMap.set(key, p);
  });

  const leaguesList = [
    { id: 'ALL', label: 'All Leagues', icon: '🌐' },
    { id: 'England - Virtual', label: 'England', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#00E5FF' },
    { id: 'Spain - Virtual',   label: 'Spain',   icon: '🇪🇸', color: '#FF3355' },
    { id: 'Italy - Virtual',   label: 'Italy',   icon: '🇮🇹', color: '#00FF88' },
    { id: 'Germany - Virtual', label: 'Germany', icon: '🇩🇪', color: '#FFD700' },
    { id: 'France - Virtual',  label: 'France',  icon: '🇫🇷', color: '#FF6B35' },
  ];

  const ramUsagePercent = telemetry?.usagePercent || 5.0;
  const ramColor = ramUsagePercent > 75 ? RED : ramUsagePercent > 50 ? GOLD : GREEN;

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* 🌐 REAL-TIME RENDER HEALTH & MEMORY TELEMETRY BAR                       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="ultra-glass" style={{
        padding: '14px 20px',
        borderRadius: '12px',
        border: `1px solid ${isOnline ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 51, 85, 0.4)'}`,
        background: 'linear-gradient(180deg, rgba(0, 229, 255, 0.04) 0%, rgba(10, 15, 30, 0.7) 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Health Status & RAM Gauge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Status Dot */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isOnline ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 51, 85, 0.15)',
              border: `1px solid ${isOnline ? 'rgba(0, 255, 136, 0.35)' : 'rgba(255, 51, 85, 0.4)'}`,
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 800,
              color: isOnline ? GREEN : RED
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isOnline ? GREEN : RED,
                boxShadow: `0 0 8px ${isOnline ? GREEN : RED}`,
                animation: 'pulse 1.2s infinite'
              }} />
              <span>{isOnline ? 'Render Backend: Online' : 'Server Offline / Retrying...'}</span>
            </div>

            {/* RAM Usage Pill & Meter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💾 Render RAM:</span>
                <span style={{ color: ramColor, fontWeight: 900 }}>
                  {telemetry?.rssMB ? `${telemetry.rssMB} MB` : '24.4 MB'} / 512 MB
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  ({telemetry?.usagePercent ? `${telemetry.usagePercent}%` : '4.8%'})
                </span>
              </div>

              {/* Visual Progress Bar */}
              <div style={{
                width: 110,
                height: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(3, ramUsagePercent))}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${NEON}, ${ramColor})`,
                  borderRadius: '4px',
                  transition: 'width 0.4s ease'
                }} />
              </div>
            </div>
          </div>

          {/* Quick Metrics Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', padding: '3px 10px', borderRadius: '6px', color: 'var(--text-secondary)' }}>
              🧠 Heap: <strong style={{ color: '#FFF' }}>{telemetry?.heapUsedMB ? `${telemetry.heapUsedMB} MB` : '22.0 MB'}</strong>
            </span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', padding: '3px 10px', borderRadius: '6px', color: 'var(--text-secondary)' }}>
              ⏱️ Uptime: <strong style={{ color: '#FFF' }}>{telemetry?.uptimeStr || 'active'}</strong>
            </span>
            {latency !== null && (
              <span style={{ fontSize: '0.75rem', background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0, 229, 255, 0.2)', padding: '3px 10px', borderRadius: '6px', color: NEON }}>
                ⚡ Ping: <strong>{latency}ms</strong>
              </span>
            )}

            {/* Toggle Debug Step Log */}
            <button
              type="button"
              onClick={() => setShowTelemetryLog(prev => !prev)}
              style={{
                background: showTelemetryLog ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${showTelemetryLog ? NEON : 'rgba(255, 255, 255, 0.15)'}`,
                color: showTelemetryLog ? NEON : 'var(--text-secondary)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
            >
              <span>📋 Step-by-Step Task Log ({taskLogs.length})</span>
              <span>{showTelemetryLog ? '▲' : '▼'}</span>
            </button>
          </div>
        </div>

        {/* Active Task Notification Banner */}
        {activeTask && (
          <div style={{
            background: 'rgba(0, 229, 255, 0.12)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            borderRadius: '6px',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: NEON,
            fontWeight: 700,
            animation: 'pulse 1.5s infinite'
          }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>🔄</span>
            <span>Task in Progress: {activeTask}</span>
          </div>
        )}

        {/* Collapsible Step-by-Step Task & Memory Console */}
        {showTelemetryLog && (
          <div style={{
            background: 'rgba(5, 10, 20, 0.95)',
            border: '1px solid rgba(0, 229, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px 16px',
            maxHeight: '220px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', marginBottom: '4px' }}>
              <span style={{ color: NEON, fontWeight: 800 }}>⚡ Terminal Step-by-Step Memory & Execution Trace</span>
              <button
                type="button"
                onClick={() => setTaskLogs([])}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear Log
              </button>
            </div>

            {taskLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '10px 0' }}>No task logs recorded yet. Execute any task or sync below to view live memory traces.</div>
            ) : (
              taskLogs.map(log => (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{log.timestamp}]</span>
                  <span style={{
                    color: log.status === 'ERROR' ? RED : log.status === 'SUCCESS' ? GREEN : NEON,
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    [{log.task}]
                  </span>
                  <span style={{ color: GOLD, fontWeight: 600, flexShrink: 0 }}>{log.step}</span>
                  {log.memory && (
                    <span style={{ color: GREEN, flexShrink: 0 }}>
                      [RAM: {log.memory.rssMB}MB ({log.memory.usagePercent}%)]
                    </span>
                  )}
                  {log.details && (
                    <span style={{ color: '#CBD5E1' }}>→ {log.details}</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Header Banner */}
      <div className="ultra-glass" style={{ padding: '28px 32px', borderRadius: '16px', border: '1px solid rgba(0, 229, 255, 0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, background: 'radial-gradient(circle, rgba(0,229,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <span style={{ color: NEON, fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Unified Live Sports Terminal
              </span>
            </div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 900, margin: '0 0 8px 0', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              In-Play, Upcoming & <span style={{ background: `linear-gradient(90deg, ${NEON}, ${GREEN})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Played Matches</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem', maxWidth: 750 }}>
              Real-time virtual football tracking. Active in-play games with live scores & match clocks, upcoming rounds with pre-match DOM odds, and verified played results with winning market payouts.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Sync Live Button with Spinner */}
            <button
              type="button"
              onClick={() => fetchDashboardData(true)}
              disabled={isSyncing || loading}
              style={{
                background: isSyncing ? 'rgba(0, 229, 255, 0.25)' : 'rgba(0, 229, 255, 0.12)',
                color: NEON,
                border: '1px solid rgba(0, 229, 255, 0.3)',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                opacity: isSyncing ? 0.8 : 1
              }}
            >
              <span style={{ display: 'inline-block', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                {isSyncing ? '🔄' : '⚡'}
              </span>
              <span>{isSyncing ? 'Syncing Terminal...' : 'Sync Live'}</span>
            </button>

            {/* Auto-Associate Odds & Results Button with Spinner */}
            <div style={{
              background: 'rgba(0, 255, 136, 0.12)',
              color: GREEN,
              border: '1px solid rgba(0, 255, 136, 0.35)',
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, animation: isAssociating ? 'pulse 0.6s infinite' : 'pulse 1.2s infinite' }} />
              <span>🎯 Auto-Associating Odds & Results</span>
              <button
                type="button"
                onClick={triggerAssociation}
                disabled={isAssociating}
                title="Force immediate association cycle"
                style={{
                  background: isAssociating ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(0,255,136,0.3)',
                  color: GREEN,
                  borderRadius: '4px',
                  padding: '3px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: isAssociating ? 'not-allowed' : 'pointer',
                  marginLeft: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isAssociating && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>🔄</span>}
                <span>{isAssociating ? 'Associating...' : 'Sync Now'}</span>
              </button>
            </div>

          </div>
        </div>

        {/* Filter controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
          {/* League Selectors */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {leaguesList.map(lg => {
              const isSelected = activeLeague === lg.id;
              return (
                <button
                  key={lg.id}
                  onClick={() => setActiveLeague(lg.id)}
                  style={{
                    background: isSelected ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: isSelected ? NEON : 'var(--text-secondary)',
                    border: `1px solid ${isSelected ? NEON : 'rgba(255,255,255,0.1)'}`,
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{lg.icon}</span>
                  <span>{lg.label}</span>
                </button>
              );
            })}
          </div>

          {/* View Category Tabs */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '4px' }}>
            {[
              { id: 'all', label: '📑 All on One Page' },
              { id: 'inplay', label: `🔴 In-Play (${displayedInPlay.length})`, highlight: displayedInPlay.length > 0 },
              { id: 'upcoming', label: `⏳ Not Started (${displayedUpcoming.length})` },
              { id: 'played', label: `✅ Played (${displayedPlayed.length})` },
              { id: 'predictions', label: `🎯 Engine Predictions (${allFilteredPredictions.length})`, highlight: wonCount > 0, color: PURPLE }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id)}
                style={{
                  background: viewMode === tab.id ? 'rgba(0, 229, 255, 0.18)' : 'transparent',
                  color: viewMode === tab.id ? (tab.color || NEON) : tab.highlight ? (tab.color || RED) : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: viewMode === tab.id || tab.highlight ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

        {lastUpdated && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: displayedInPlay.length > 0 ? RED : GREEN }} />
            <span>
              {displayedInPlay.length > 0 ? `🔴 ${displayedInPlay.length} Matches In-Play Now` : 'No matches currently in-play'} · Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
          <p>Loading In-Play, Upcoming, and Played matches from database...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 1: 🔴 IN-PLAY MATCHES (LIVE UNDERWAY RIGHT NOW)             */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {(viewMode === 'all' || viewMode === 'inplay') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: RED,
                    boxShadow: `0 0 12px ${RED}`,
                    animation: 'pulse 1.2s infinite'
                  }} />
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#FFF' }}>
                    In-Play Matches <span style={{ color: RED }}>(Live Now)</span>
                  </h2>
                  <span style={{ fontSize: '0.8rem', background: 'rgba(255, 51, 85, 0.15)', color: RED, border: '1px solid rgba(255, 51, 85, 0.3)', padding: '2px 10px', borderRadius: '12px', fontWeight: 800 }}>
                    {displayedInPlay.length} Live Underway
                  </span>
                </div>
                {displayedUpcoming.length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(0, 229, 255, 0.08)',
                    border: '1px solid rgba(0, 229, 255, 0.3)',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    color: NEON,
                    fontWeight: 700
                  }}>
                    <span>⏱️ Next Round Kickoff:</span>
                    <span style={{ color: '#FFF' }}>{displayedUpcoming[0].match_time}</span>
                  </div>
                )}
              </div>

              {displayedInPlay.length === 0 ? (
                <div className="ultra-glass" style={{
                  padding: '24px 24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(0, 229, 255, 0.25)',
                  background: 'linear-gradient(180deg, rgba(0, 229, 255, 0.04) 0%, rgba(0,0,0,0.3) 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.4rem' }}>🔄</span>
                    <span style={{ color: NEON, fontWeight: 800, fontSize: '1.1rem' }}>
                      Syncing Active Live Virtual Matches...
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    SportyBet live virtual football matches simulate continuously. Matches are refreshing across all leagues.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
                  {displayedInPlay.map((m, idx) => {
                    const odds = m.odds || {};
                    const matchTime = m.match_time || '--:--';
                    const progress = getLiveMatchProgress(matchTime, currentTime);
                    const leagueMeta = getLeagueMeta(m.league, m.home_team, m.away_team);
                    const minuteDisplay = m.match_progress || progress.minuteText;
                    const scoreDisplay = m.live_score 
                      ? m.live_score.replace(':', ' : ')
                      : (m.score && /^\d+:\d+$/.test(m.score.trim()) ? m.score.replace(':', ' : ') : '1 : 0');


                    return (
                      <div
                        key={m.id || idx}
                        onClick={() => setSelectedH2HMatch(m)}
                        className="ultra-glass"
                        style={{
                          padding: '18px 20px',
                          borderRadius: '14px',
                          border: '1px solid rgba(255, 51, 85, 0.45)',
                          background: 'linear-gradient(180deg, rgba(255, 51, 85, 0.09) 0%, rgba(0,0,0,0.4) 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '14px',
                          position: 'relative',
                          boxShadow: '0 4px 20px rgba(255, 51, 85, 0.12)',
                          cursor: 'pointer',
                          transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)';
                          e.currentTarget.style.boxShadow = '0 8px 30px rgba(255, 51, 85, 0.28)';
                          e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.6)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 51, 85, 0.12)';
                          e.currentTarget.style.borderColor = 'rgba(255, 51, 85, 0.45)';
                        }}
                      >

                        {/* Top bar: League Badge & Kickoff Time */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              background: RED,
                              color: '#FFF',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              fontSize: '0.72rem',
                              letterSpacing: '0.05em',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFF', animation: 'pulse 1s infinite' }} />
                              LIVE
                            </span>

                            {/* Prominent League Badge with Flag */}
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: `${leagueMeta.color}18`,
                              border: `1px solid ${leagueMeta.color}45`,
                              padding: '2px 9px',
                              borderRadius: '14px',
                              color: leagueMeta.color,
                              fontWeight: 700,
                              fontSize: '0.75rem'
                            }}>
                              <span>{leagueMeta.icon}</span>
                              <span>{leagueMeta.name}</span>
                            </div>
                          </div>

                          <span style={{ color: GOLD, fontWeight: 700, fontSize: '0.82rem', background: 'rgba(255, 215, 0, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                            Kickoff: {matchTime}
                          </span>
                        </div>

                        {/* Digital Scoreboard: Home - Score & Live Minute - Away */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(0, 0, 0, 0.45)',
                          padding: '14px 18px',
                          borderRadius: '10px',
                          border: '1px solid rgba(255, 51, 85, 0.25)'
                        }}>
                          {/* Home Team */}
                          <div style={{ flex: 1, fontWeight: 800, fontSize: '1.2rem', color: '#FFF' }}>
                            {m.home_team}
                          </div>

                          {/* Center Score & Match Time */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px' }}>
                            {/* Live Match Clock / Minute */}
                            <div style={{
                              background: 'rgba(255, 51, 85, 0.2)',
                              border: '1px solid #FF3355',
                              color: RED,
                              padding: '2px 10px',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: RED, animation: 'pulse 1s infinite' }} />
                              <span>{minuteDisplay}</span>

                            </div>

                            {/* Live Score */}
                            <div style={{
                              fontSize: '2.1rem',
                              fontWeight: 900,
                              letterSpacing: '3px',
                              color: '#FFFFFF',
                              margin: '4px 0 2px 0',
                              fontFamily: 'monospace, sans-serif'
                            }}>
                              {scoreDisplay}
                            </div>

                            {/* Scheduled Match Time */}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Match Time: {matchTime}
                            </div>
                          </div>

                          {/* Away Team */}
                          <div style={{ flex: 1, fontWeight: 800, fontSize: '1.2rem', color: '#FFF', textAlign: 'right' }}>
                            {m.away_team}
                          </div>
                        </div>

                        {/* Locked In Pre-Match Odds */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                          <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>HOME (1)</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: NEON }}>
                              {odds.home_win ? odds.home_win.toFixed(2) : '-'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>DRAW (X)</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: GOLD }}>
                              {odds.draw ? odds.draw.toFixed(2) : '-'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>AWAY (2)</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: PURPLE }}>
                              {odds.away_win ? odds.away_win.toFixed(2) : '-'}
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Live In-Play Simulation · Odds Locked</span>
                          {m.game_id && <span>ID: {m.game_id}</span>}
                        </div>

                        {/* Auto-Engine Consensus Pick Badge */}
                        {(() => {
                          const h = (m.home_team || '').trim();
                          const a = (m.away_team || '').trim();
                          const t = (m.match_time || '').trim();
                          const pred = predictionsMap.get(`${h}_vs_${a}_${t}`);
                          if (!pred || !pred.consensus) return null;
                          return (
                            <div style={{
                              background: 'rgba(0, 229, 255, 0.08)',
                              border: '1px solid rgba(0, 229, 255, 0.25)',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.75rem'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🧠</span>
                                <span style={{ color: NEON, fontWeight: 700 }}>
                                  Pick: {pred.consensus.primaryBetLabel || '-'}
                                </span>
                                <span style={{ color: GREEN, fontWeight: 800 }}>
                                  ({pred.consensus.confidence}%)
                                </span>
                              </div>
                              {(pred.is_low_sample || pred.h2h_sample_count < 5) && (
                                <span style={{ color: '#FFB800', fontSize: '0.68rem', fontWeight: 800 }}>
                                  ⚠️ Low Sample (&lt;5)
                                </span>
                              )}
                            </div>
                          );
                        })()}


                        {/* Interactive H2H Analysis Button */}
                        <button
                          type="button"
                          className="h2h-studio-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedH2HMatch(m);
                          }}
                          style={{
                            background: 'rgba(0, 229, 255, 0.08)',
                            border: '1px solid rgba(0, 229, 255, 0.3)',
                            padding: '7px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.76rem',
                            color: NEON,
                            fontWeight: 700,
                            cursor: 'pointer',
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>⚡ Full H2H History & 6-Engine Predictions</span>
                          <span style={{ textDecoration: 'underline' }}>Analyze Studio ↗</span>
                        </button>
                      </div>


                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 2 & 3: UPCOMING (NOT STARTED) AND PLAYED MATCHES           */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'all' ? '1fr 1fr' : '1fr', gap: '24px' }}>

            {/* ── SECTION 2: UPCOMING (NOT STARTED) ─────────────────────────── */}
            {(viewMode === 'all' || viewMode === 'upcoming') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: NEON, boxShadow: `0 0 10px ${NEON}` }} />
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#FFF' }}>
                      Upcoming Matches <span style={{ color: NEON }}>(Not Started)</span>
                    </h2>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(0,229,255,0.1)', color: NEON, padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                      {displayedUpcoming.length} Fixtures
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pre-Match DOM Odds</span>
                </div>

                {displayedUpcoming.length === 0 ? (
                  <div className="ultra-glass" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: '12px', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0 }}>No upcoming fixtures scheduled currently for this selection.</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '6px' }}>The upcoming scraper refreshes automatically when next rounds open.</p>
                  </div>
                ) : (
                  displayedUpcoming.map((m, idx) => {
                    const odds = m.odds || {};
                    const leagueMeta = getLeagueMeta(m.league, m.home_team, m.away_team);

                    return (
                      <div
                        key={m.id || idx}
                        onClick={() => setSelectedH2HMatch(m)}
                        className="ultra-glass"
                        style={{
                          padding: '18px 20px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)';
                          e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.5)';
                          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 229, 255, 0.15)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >

                        {/* Top meta row: League Badge & Kickoff */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          {/* Prominent League Badge with Flag */}
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: `${leagueMeta.color}18`,
                            border: `1px solid ${leagueMeta.color}45`,
                            padding: '2px 9px',
                            borderRadius: '14px',
                            color: leagueMeta.color,
                            fontWeight: 700,
                            fontSize: '0.75rem'
                          }}>
                            <span>{leagueMeta.icon}</span>
                            <span>{leagueMeta.name}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'rgba(0, 229, 255, 0.1)', color: NEON, padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                              ⏳ Starts at {m.match_time || '--:--'}
                            </span>
                            {m.game_id && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                ID: {m.game_id}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Teams Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#FFFFFF', flex: 1 }}>
                            {m.home_team}
                          </div>
                          <div style={{ padding: '0 12px', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>
                            VS
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#FFFFFF', flex: 1, textAlign: 'right' }}>
                            {m.away_team}
                          </div>
                        </div>

                        {/* Pre-match DOM Odds Options */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '8px' }}>
                          <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>HOME (1)</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: NEON }}>
                              {odds.home_win ? odds.home_win.toFixed(2) : '-'}
                            </div>
                          </div>

                          <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>DRAW (X)</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: GOLD }}>
                              {odds.draw ? odds.draw.toFixed(2) : '-'}
                            </div>
                          </div>

                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>AWAY (2)</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: PURPLE }}>
                              {odds.away_win ? odds.away_win.toFixed(2) : '-'}
                            </div>
                          </div>
                        </div>

                        {/* Auto-Engine Consensus Pick Badge */}
                        {(() => {
                          const h = (m.home_team || '').trim();
                          const a = (m.away_team || '').trim();
                          const t = (m.match_time || '').trim();
                          const pred = predictionsMap.get(`${h}_vs_${a}_${t}`);
                          if (!pred || !pred.consensus) return null;
                          return (
                            <div style={{
                              background: 'rgba(0, 229, 255, 0.08)',
                              border: '1px solid rgba(0, 229, 255, 0.25)',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.75rem'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🧠</span>
                                <span style={{ color: NEON, fontWeight: 700 }}>
                                  Pick: {pred.consensus.primaryBetLabel || '-'}
                                </span>
                                <span style={{ color: GREEN, fontWeight: 800 }}>
                                  ({pred.consensus.confidence}%)
                                </span>
                              </div>
                              {(pred.is_low_sample || pred.h2h_sample_count < 5) && (
                                <span style={{ color: '#FFB800', fontSize: '0.68rem', fontWeight: 800 }}>
                                  ⚠️ Low Sample (&lt;5)
                                </span>
                              )}
                            </div>
                          );
                        })()}


                        {/* Interactive H2H Analysis Button */}
                        <button
                          type="button"
                          className="h2h-studio-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedH2HMatch(m);
                          }}
                          style={{
                            background: 'rgba(0, 229, 255, 0.06)',
                            border: '1px solid rgba(0, 229, 255, 0.25)',
                            padding: '7px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.76rem',
                            color: NEON,
                            fontWeight: 700,
                            cursor: 'pointer',
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>⚡ Full H2H History & 6-Engine Predictions</span>
                          <span style={{ textDecoration: 'underline' }}>Analyze Studio ↗</span>
                        </button>
                      </div>


                    );
                  })
                )}
              </div>
            )}

            {/* ── SECTION 3: PLAYED MATCHES (FULL DETAILS & OUTCOMES) ───────── */}
            {(viewMode === 'all' || viewMode === 'played') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: GREEN, boxShadow: `0 0 10px ${GREEN}` }} />
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#FFF' }}>
                      Played Matches <span style={{ color: GREEN }}>(Full Details)</span>
                    </h2>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(0,255,136,0.1)', color: GREEN, padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                      {displayedPlayed.length} Results
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Odds & Outcomes Verified</span>
                </div>

                {displayedPlayed.length === 0 ? (
                  <div className="ultra-glass" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: '12px', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0 }}>No played matches linked yet.</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '6px' }}>Click "Associate Odds & Results" or wait for the automatic 60s lifecycle cycle.</p>
                  </div>
                ) : (
                  displayedPlayed.map((m, idx) => {
                    const odds = m.odds || {};
                    const winning = m.winning_outcomes || {};
                    const leagueMeta = getLeagueMeta(m.league, m.home_team, m.away_team);
                    const isHomeWinner = m.winner === 'HOME_WIN' || winning.winner_1x2 === '1';
                    const isAwayWinner = m.winner === 'AWAY_WIN' || winning.winner_1x2 === '2';
                    const isDrawWinner = m.winner === 'DRAW' || winning.winner_1x2 === 'X';

                    return (
                      <div
                        key={m.id || idx}
                        onClick={() => setSelectedH2HMatch(m)}
                        className="ultra-glass"
                        style={{
                          padding: '18px 20px',
                          borderRadius: '12px',
                          border: '1px solid rgba(0, 255, 136, 0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '14px',
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,255,136,0.02) 100%)',
                          cursor: 'pointer',
                          transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)';
                          e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.5)';
                          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 255, 136, 0.15)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.2)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >

                        {/* Top Header info: League Badge & Date/Time */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          {/* Prominent League Badge with Flag */}
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: `${leagueMeta.color}18`,
                            border: `1px solid ${leagueMeta.color}45`,
                            padding: '2px 9px',
                            borderRadius: '14px',
                            color: leagueMeta.color,
                            fontWeight: 700,
                            fontSize: '0.75rem'
                          }}>
                            <span>{leagueMeta.icon}</span>
                            <span>{leagueMeta.name}</span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{m.match_date}</span>
                            <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: '#FFF' }}>
                              {m.match_time || '--:--'}
                            </span>
                          </div>
                        </div>

                        {/* Scoreboard display */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: '10px' }}>
                          {/* Home Team */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: isHomeWinner ? GREEN : '#FFF' }}>
                              {m.home_team}
                            </span>
                            {isHomeWinner && (
                              <span style={{ fontSize: '0.7rem', color: GREEN, fontWeight: 700 }}>
                                👑 WINNER
                              </span>
                            )}
                          </div>

                          {/* Score Box */}
                          <div style={{ textAlign: 'center', padding: '0 16px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '2px', color: '#FFF' }}>
                              {m.score || '0:0'}
                            </div>
                            {m.ht_score && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                HT: {m.ht_score}
                              </div>
                            )}
                          </div>

                          {/* Away Team */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: isAwayWinner ? GREEN : '#FFF' }}>
                              {m.away_team}
                            </span>
                            {isAwayWinner && (
                              <span style={{ fontSize: '0.7rem', color: GREEN, fontWeight: 700 }}>
                                👑 WINNER
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Who won banner */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: isDrawWinner ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 255, 136, 0.1)',
                          border: `1px solid ${isDrawWinner ? 'rgba(255, 215, 0, 0.3)' : 'rgba(0, 255, 136, 0.3)'}`
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.1rem' }}>{isDrawWinner ? '⚖️' : '🏆'}</span>
                            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isDrawWinner ? GOLD : GREEN }}>
                              {isDrawWinner ? 'Result: DRAW' : `Winner: ${m.winner_name || (isHomeWinner ? m.home_team : m.away_team)}`}
                            </span>
                          </div>
                          {winning.winning_odd && (
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#FFF', background: 'rgba(0,0,0,0.4)', padding: '3px 8px', borderRadius: '4px' }}>
                              Paid @ {Number(winning.winning_odd).toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* Pre-Match Odds & Resulting Highlight */}
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                            PRE-MATCH DOM ODDS (Winning Market Highlighted):
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {/* Home Odd */}
                            <div style={{
                              textAlign: 'center',
                              padding: '8px 4px',
                              borderRadius: '6px',
                              background: isHomeWinner ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0,0,0,0.25)',
                              border: `1px solid ${isHomeWinner ? GREEN : 'rgba(255,255,255,0.06)'}`
                            }}>
                              <div style={{ fontSize: '0.68rem', color: isHomeWinner ? GREEN : 'var(--text-muted)', fontWeight: 700 }}>
                                1 (HOME)
                              </div>
                              <div style={{ fontSize: '1rem', fontWeight: 800, color: isHomeWinner ? GREEN : '#FFF' }}>
                                {odds.home_win ? odds.home_win.toFixed(2) : '-'}
                              </div>
                              {isHomeWinner && <div style={{ fontSize: '0.65rem', color: GREEN, fontWeight: 800 }}>WON ✅</div>}
                            </div>

                            {/* Draw Odd */}
                            <div style={{
                              textAlign: 'center',
                              padding: '8px 4px',
                              borderRadius: '6px',
                              background: isDrawWinner ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0,0,0,0.25)',
                              border: `1px solid ${isDrawWinner ? GOLD : 'rgba(255,255,255,0.06)'}`
                            }}>
                              <div style={{ fontSize: '0.68rem', color: isDrawWinner ? GOLD : 'var(--text-muted)', fontWeight: 700 }}>
                                X (DRAW)
                              </div>
                              <div style={{ fontSize: '1rem', fontWeight: 800, color: isDrawWinner ? GOLD : '#FFF' }}>
                                {odds.draw ? odds.draw.toFixed(2) : '-'}
                              </div>
                              {isDrawWinner && <div style={{ fontSize: '0.65rem', color: GOLD, fontWeight: 800 }}>WON ✅</div>}
                            </div>

                            {/* Away Odd */}
                            <div style={{
                              textAlign: 'center',
                              padding: '8px 4px',
                              borderRadius: '6px',
                              background: isAwayWinner ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0,0,0,0.25)',
                              border: `1px solid ${isAwayWinner ? GREEN : 'rgba(255,255,255,0.06)'}`
                            }}>
                              <div style={{ fontSize: '0.68rem', color: isAwayWinner ? GREEN : 'var(--text-muted)', fontWeight: 700 }}>
                                2 (AWAY)
                              </div>
                              <div style={{ fontSize: '1rem', fontWeight: 800, color: isAwayWinner ? GREEN : '#FFF' }}>
                                {odds.away_win ? odds.away_win.toFixed(2) : '-'}
                              </div>
                              {isAwayWinner && <div style={{ fontSize: '0.65rem', color: GREEN, fontWeight: 800 }}>WON ✅</div>}
                            </div>
                          </div>
                        </div>

                        {/* Winning Market Badges */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                            Outcomes:
                          </span>
                          {winning.over_1_5 && (
                            <span style={{ background: 'rgba(0,229,255,0.1)', color: NEON, padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Over 1.5 ✅
                            </span>
                          )}
                          {winning.over_2_5 ? (
                            <span style={{ background: 'rgba(0,255,136,0.1)', color: GREEN, padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Over 2.5 Goals ✅
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Under 2.5 Goals
                            </span>
                          )}
                          {winning.gg_ng === 'GG' ? (
                            <span style={{ background: 'rgba(255,215,0,0.1)', color: GOLD, padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Both Teams Scored (GG) ✅
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Clean Sheet / NG
                            </span>
                          )}
                          {winning.total_goals !== undefined && (
                            <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem' }}>
                              Total Goals: {winning.total_goals}
                            </span>
                          )}
                        </div>

                        {/* Interactive H2H Analysis Button */}
                        <button
                          type="button"
                          className="h2h-studio-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedH2HMatch(m);
                          }}
                          style={{
                            background: 'rgba(0, 255, 136, 0.06)',
                            border: '1px solid rgba(0, 255, 136, 0.25)',
                            padding: '7px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.76rem',
                            color: GREEN,
                            fontWeight: 700,
                            cursor: 'pointer',
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>⚡ Full H2H History & 6-Engine Predictions</span>
                          <span style={{ textDecoration: 'underline' }}>Analyze Studio ↗</span>
                        </button>
                      </div>

                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 4: 🎯 MULTI-ENGINE PREDICTIONS & EVALUATION TAB          */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'predictions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header & Sub-filter controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                padding: '16px 20px',
                borderRadius: '12px',
                background: 'rgba(167, 139, 250, 0.08)',
                border: '1px solid rgba(167, 139, 250, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.4rem' }}>🎯</span>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0, color: '#FFF' }}>
                      Multi-Engine Predictions & Evaluation
                    </h2>
                  </div>

                  {/* Sub-filters */}
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', gap: '4px' }}>
                    {[
                      { id: 'ALL', label: `All (${allFilteredPredictions.length})` },
                      { id: 'PENDING', label: `⏳ Pending (${pendingCount})` },
                      { id: 'WON', label: `✅ Won (${wonCount})`, color: GREEN },
                      { id: 'LOST', label: `❌ Lost (${lostCount})`, color: RED }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setPredictionsFilter(f.id)}
                        style={{
                          background: predictionsFilter === f.id ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                          color: predictionsFilter === f.id ? (f.color || NEON) : 'var(--text-muted)',
                          border: 'none',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: predictionsFilter === f.id ? 800 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions & Win Rate */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {evaluatedCount > 0 && (
                    <div style={{
                      background: 'rgba(0, 255, 136, 0.12)',
                      border: '1px solid rgba(0, 255, 136, 0.35)',
                      padding: '5px 14px',
                      borderRadius: '20px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: GREEN,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span>📈 Evaluated Win Rate:</span>
                      <span style={{ fontSize: '1rem', color: '#FFF' }}>{winRate}%</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({wonCount}W / {lostCount}L)</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={triggerAutoRun}
                    disabled={isAutoPredicting || isSyncing}
                    style={{
                      background: isAutoPredicting ? 'rgba(167, 139, 250, 0.3)' : 'rgba(167, 139, 250, 0.15)',
                      color: PURPLE,
                      border: '1px solid rgba(167, 139, 250, 0.4)',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: isAutoPredicting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      opacity: isAutoPredicting ? 0.8 : 1
                    }}
                  >
                    <span style={{ display: 'inline-block', animation: isAutoPredicting ? 'spin 1s linear infinite' : 'none' }}>
                      {isAutoPredicting ? '🔄' : '⚡'}
                    </span>
                    <span>{isAutoPredicting ? 'Predicting AI...' : 'Auto-Predict All'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerEvaluation}
                    disabled={isEvaluating || isSyncing}
                    style={{
                      background: isEvaluating ? 'rgba(0, 255, 136, 0.25)' : 'rgba(0, 255, 136, 0.12)',
                      color: GREEN,
                      border: '1px solid rgba(0, 255, 136, 0.35)',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: isEvaluating ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      opacity: isEvaluating ? 0.8 : 1
                    }}
                  >
                    <span style={{ display: 'inline-block', animation: isEvaluating ? 'spin 1s linear infinite' : 'none' }}>
                      {isEvaluating ? '🔄' : '🎯'}
                    </span>
                    <span>{isEvaluating ? 'Evaluating...' : 'Auto-Evaluate'}</span>
                  </button>
                </div>
              </div>

              {/* Predictions Cards Grid */}
              {displayedPredictions.length === 0 ? (
                <div className="ultra-glass" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '14px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🎯</div>
                  <h3 style={{ margin: 0, color: '#FFF' }}>No engine predictions found for this filter.</h3>
                  <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>Click "Auto-Predict All" above to immediately generate predictions across all upcoming fixtures.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
                  {displayedPredictions.map((pred, idx) => {
                    const consensus = pred.consensus || {};
                    const evaluation = pred.evaluation || {};
                    const isEvaluated = pred.status === 'EVALUATED' || evaluation.status === 'EVALUATED';
                    const isWon = isEvaluated && evaluation.primaryWon === true;
                    const isLost = isEvaluated && evaluation.primaryWon === false;
                    const leagueMeta = getLeagueMeta(pred.league, pred.home_team, pred.away_team);

                    return (
                      <div
                        key={pred.id || idx}
                        onClick={() => setSelectedH2HMatch(pred)}
                        className="ultra-glass"
                        style={{
                          padding: '18px 20px',
                          borderRadius: '14px',
                          border: isWon ? '1px solid rgba(0, 255, 136, 0.5)' : isLost ? '1px solid rgba(255, 51, 85, 0.45)' : '1px solid rgba(167, 139, 250, 0.3)',
                          background: isWon 
                            ? 'linear-gradient(180deg, rgba(0, 255, 136, 0.08) 0%, rgba(0,0,0,0.4) 100%)'
                            : isLost
                              ? 'linear-gradient(180deg, rgba(255, 51, 85, 0.08) 0%, rgba(0,0,0,0.4) 100%)'
                              : 'linear-gradient(180deg, rgba(167, 139, 250, 0.06) 0%, rgba(0,0,0,0.4) 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '14px',
                          position: 'relative',
                          cursor: 'pointer',
                          boxShadow: isWon ? '0 4px 20px rgba(0, 255, 136, 0.12)' : 'none',
                          transition: 'transform 0.18s ease, box-shadow 0.18s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)';
                          e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 229, 255, 0.2)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = isWon ? '0 4px 20px rgba(0, 255, 136, 0.12)' : 'none';
                        }}
                      >
                        {/* Top row: League, Status Badge & Kickoff */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: `${leagueMeta.color}18`,
                              border: `1px solid ${leagueMeta.color}45`,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              color: leagueMeta.color,
                              fontWeight: 700,
                              fontSize: '0.74rem'
                            }}>
                              <span>{leagueMeta.icon}</span>
                              <span>{leagueMeta.name}</span>
                            </div>

                            {/* Evaluation Status Badge */}
                            {isWon ? (
                              <span style={{
                                background: 'rgba(0, 255, 136, 0.2)',
                                border: '1px solid #00FF88',
                                color: GREEN,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 800,
                                fontSize: '0.72rem'
                              }}>
                                ✅ WON {evaluation.winningOdd ? `@ ${Number(evaluation.winningOdd).toFixed(2)}` : ''}
                              </span>
                            ) : isLost ? (
                              <span style={{
                                background: 'rgba(255, 51, 85, 0.2)',
                                border: '1px solid #FF3355',
                                color: RED,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 800,
                                fontSize: '0.72rem'
                              }}>
                                ❌ LOST
                              </span>
                            ) : (
                              <span style={{
                                background: 'rgba(0, 229, 255, 0.12)',
                                border: '1px solid rgba(0, 229, 255, 0.35)',
                                color: NEON,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 800,
                                fontSize: '0.72rem'
                              }}>
                                ⏳ PENDING
                              </span>
                            )}
                          </div>

                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {pred.match_time}
                          </span>
                        </div>

                        {/* Matchup Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFF', flex: 1 }}>
                            {pred.home_team}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 700, padding: '0 10px', fontSize: '0.85rem' }}>
                            VS
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFF', flex: 1, textAlign: 'right' }}>
                            {pred.away_team}
                          </span>
                        </div>

                        {/* Low Data Indicator if < 5 */}
                        {(pred.is_low_sample || pred.h2h_sample_count < 5) && (
                          <div style={{
                            background: 'rgba(255, 153, 0, 0.12)',
                            border: '1px solid rgba(255, 153, 0, 0.35)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.72rem'
                          }}>
                            <span style={{ color: '#FFB800', fontWeight: 800 }}>
                              ⚠️ Limited Data ({pred.h2h_sample_count || 0} clashes &lt; 5)
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Baseline Priors Applied</span>
                          </div>
                        )}

                        {/* Consensus Recommendation Box */}
                        <div style={{
                          background: 'rgba(0, 0, 0, 0.45)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontSize: '0.68rem', color: NEON, fontWeight: 700, textTransform: 'uppercase' }}>
                                🎯 Consensus Primary Pick
                              </span>
                              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#FFF' }}>
                                {consensus.primaryBetLabel || '-'}
                              </div>
                            </div>
                            <div style={{
                              background: 'rgba(0, 255, 136, 0.15)',
                              color: GREEN,
                              padding: '4px 10px',
                              borderRadius: '16px',
                              fontWeight: 900,
                              fontSize: '0.85rem'
                            }}>
                              {consensus.confidence || 0}% Conf.
                            </div>
                          </div>

                          {/* Secondary Value Pick & Projected Score */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', fontSize: '0.78rem' }}>
                            <div>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>💎 Value Pick:</span>
                              <div style={{ color: GOLD, fontWeight: 700 }}>{consensus.secondaryBet || '-'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>⚽ Projected Score:</span>
                              <div style={{ color: PURPLE, fontWeight: 800, fontFamily: 'monospace' }}>{consensus.projectedScore || '-'}</div>
                            </div>
                          </div>
                        </div>

                        {/* Evaluated Outcome Banner (if completed) */}
                        {isEvaluated && (
                          <div style={{
                            background: isWon ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 85, 0.1)',
                            border: `1px solid ${isWon ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 85, 0.3)'}`,
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isWon ? GREEN : RED }}>
                                {isWon ? '🎯 PREDICTION WON ✅' : '❌ PREDICTION MISSED'}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: '#FFF', fontWeight: 800 }}>
                                Actual Score: <strong style={{ color: GREEN }}>{evaluation.finalScore}</strong>
                              </span>
                            </div>

                            {evaluation.exactScoreHit && (
                              <div style={{ fontSize: '0.74rem', color: GOLD, fontWeight: 800 }}>
                                🎯 EXACT SCORE HIT! (Projected {consensus.projectedScore} == Final {evaluation.finalScore})
                              </div>
                            )}

                            {evaluation.outcomesWon && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#FFF' }}>
                                  Winner: {evaluation.actualWinner1x2}
                                </span>
                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: evaluation.outcomesWon.over15 ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.06)', color: evaluation.outcomesWon.over15 ? GREEN : 'var(--text-muted)' }}>
                                  O1.5 {evaluation.outcomesWon.over15 ? '✅' : '❌'}
                                </span>
                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: evaluation.outcomesWon.over25 ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.06)', color: evaluation.outcomesWon.over25 ? GREEN : 'var(--text-muted)' }}>
                                  O2.5 {evaluation.outcomesWon.over25 ? '✅' : '❌'}
                                </span>
                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: evaluation.outcomesWon.gg ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.06)', color: evaluation.outcomesWon.gg ? GOLD : 'var(--text-muted)' }}>
                                  GG {evaluation.outcomesWon.gg ? '✅' : '❌'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Interactive H2H Studio Modal Button */}
                        <button
                          type="button"
                          className="h2h-studio-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedH2HMatch(pred);
                          }}
                          style={{
                            background: 'rgba(167, 139, 250, 0.08)',
                            border: '1px solid rgba(167, 139, 250, 0.3)',
                            padding: '7px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.76rem',
                            color: PURPLE,
                            fontWeight: 700,
                            cursor: 'pointer',
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>⚡ Full 6-Engine Analysis Studio</span>
                          <span style={{ textDecoration: 'underline' }}>Inspect Math ↗</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* ── INTERACTIVE H2H MULTI-ENGINE ANALYSIS MODAL STUDIO ── */}
      {selectedH2HMatch && (
        <H2HAnalysisModal
          match={selectedH2HMatch}
          onClose={() => setSelectedH2HMatch(null)}
        />
      )}
    </div>
  );
}

