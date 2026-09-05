import React, { useState, useEffect, useMemo } from 'react';

// Color Palette
const NEON = '#00E5FF';
const GREEN = '#00FF88';
const RED = '#FF3355';
const GOLD = '#FFD700';
const PURPLE = '#A78BFA';
const ORANGE = '#FF9900';

const LEAGUE_META = {
  'England': { name: 'England League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#00E5FF' },
  'Spain':   { name: 'Spain League',   icon: '🇪🇸', color: '#FF3355' },
  'Italy':   { name: 'Italy League',   icon: '🇮🇹', color: '#00FF88' },
  'Germany': { name: 'Germany League', icon: '🇩🇪', color: '#FFD700' },
  'France':  { name: 'France League',  icon: '🇫🇷', color: '#FF6B35' },
};

function getLeagueMeta(leagueStr = '') {
  const l = (leagueStr || '').toLowerCase();
  if (l.includes('england') || l.includes('epl') || l.includes('premier')) return LEAGUE_META['England'];
  if (l.includes('spain') || l.includes('laliga') || l.includes('la liga')) return LEAGUE_META['Spain'];
  if (l.includes('italy') || l.includes('serie')) return LEAGUE_META['Italy'];
  if (l.includes('germany') || l.includes('bundesliga')) return LEAGUE_META['Germany'];
  if (l.includes('france') || l.includes('ligue')) return LEAGUE_META['France'];
  return { name: leagueStr || 'All Leagues', icon: '🌐', color: NEON };
}

export default function RecurringOddsDetailModal({
  selectedOdd,
  allOdds = [],
  playedMatches = [],
  upcomingMatches = [],
  timeFilter = 'SINCE_7AM_WAT',
  lastWatInfo = null,
  onClose,
  onSelectMatch,
  onSelectOdd
}) {
  const [activeTab, setActiveTab] = useState('matches'); // 'matches' | 'stats' | 'live-alerts'
  const [searchTerm, setSearchTerm] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const currentOdd = selectedOdd || allOdds[0] || null;
  const leagueMeta = getLeagueMeta(currentOdd?.league);

  // Find all historical played matches matching this exact odd, market, and league
  const detailedMatches = useMemo(() => {
    if (!currentOdd || !playedMatches || playedMatches.length === 0) return [];
    const targetOddVal = currentOdd.odd.toFixed(2);
    const targetMarket = currentOdd.market;
    const targetLeague = (currentOdd.league || '').toLowerCase();

    return playedMatches.filter(m => {
      const odds = m.odds || {};
      const mLeague = (m.league || '').toLowerCase();
      if (targetLeague !== 'all leagues' && targetLeague !== 'all' && !mLeague.includes(targetLeague.replace(' - virtual', '').replace(' league', ''))) {
        return false;
      }

      let matchOddVal = null;
      if (targetMarket === 'HOME' && odds.home_win) matchOddVal = Number(odds.home_win).toFixed(2);
      else if (targetMarket === 'AWAY' && odds.away_win) matchOddVal = Number(odds.away_win).toFixed(2);
      else if (targetMarket === 'DRAW' && odds.draw) matchOddVal = Number(odds.draw).toFixed(2);

      return matchOddVal === targetOddVal;
    }).map(m => {
      const winning = m.winning_outcomes || {};
      const isHomeWin = m.winner === 'HOME_WIN' || winning.winner_1x2 === '1';
      const isAwayWin = m.winner === 'AWAY_WIN' || winning.winner_1x2 === '2';
      const isDraw = m.winner === 'DRAW' || winning.winner_1x2 === 'X';

      let won = false;
      if (targetMarket === 'HOME') won = isHomeWin;
      else if (targetMarket === 'AWAY') won = isAwayWin;
      else if (targetMarket === 'DRAW') won = isDraw;

      const score = m.score || '0:0';
      const parts = score.split(/[:\-]/);
      const hScore = Number(parts[0] ?? m.home_score ?? 0);
      const aScore = Number(parts[1] ?? m.away_score ?? 0);
      const totalGoals = hScore + aScore;

      return {
        ...m,
        won,
        hScore,
        aScore,
        totalGoals,
        isOver15: totalGoals > 1.5,
        isOver25: totalGoals > 2.5,
        isBTTS: hScore > 0 && aScore > 0,
        scoreClean: `${hScore}:${aScore}`
      };
    });
  }, [currentOdd, playedMatches]);

  // Deep Statistical Calculations for this specific odd
  const stats = useMemo(() => {
    if (detailedMatches.length === 0) {
      return {
        total: 0,
        won: 0,
        lost: 0,
        winRate: 0,
        roi: 0,
        avgGoals: 0,
        over15Rate: 0,
        over25Rate: 0,
        bttsRate: 0,
        scoresMap: []
      };
    }

    const total = detailedMatches.length;
    const won = detailedMatches.filter(m => m.won).length;
    const lost = total - won;
    const winRate = Math.round((won / total) * 100);
    const oddVal = currentOdd?.odd || 2.0;
    const roi = Math.round(((won * oddVal - total) / total) * 100);

    const sumGoals = detailedMatches.reduce((acc, m) => acc + m.totalGoals, 0);
    const avgGoals = Math.round((sumGoals / total) * 10) / 10;

    const over15Count = detailedMatches.filter(m => m.isOver15).length;
    const over15Rate = Math.round((over15Count / total) * 100);

    const over25Count = detailedMatches.filter(m => m.isOver25).length;
    const over25Rate = Math.round((over25Count / total) * 100);

    const bttsCount = detailedMatches.filter(m => m.isBTTS).length;
    const bttsRate = Math.round((bttsCount / total) * 100);

    // Scoreline frequency
    const scoresCount = {};
    detailedMatches.forEach(m => {
      scoresCount[m.scoreClean] = (scoresCount[m.scoreClean] || 0) + 1;
    });

    const scoresMap = Object.entries(scoresCount)
      .map(([score, count]) => ({
        score,
        count,
        percent: Math.round((count / total) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      won,
      lost,
      winRate,
      roi,
      avgGoals,
      over15Rate,
      over25Rate,
      bttsRate,
      scoresMap
    };
  }, [detailedMatches, currentOdd]);

  // Find any active upcoming or in-play fixtures that have this exact odd right now
  const activeMatchingUpcoming = useMemo(() => {
    if (!currentOdd || !upcomingMatches || upcomingMatches.length === 0) return [];
    const targetOddVal = currentOdd.odd.toFixed(2);
    const targetMarket = currentOdd.market;
    const targetLeague = (currentOdd.league || '').toLowerCase();

    return upcomingMatches.filter(m => {
      const odds = m.odds || {};
      const mLeague = (m.league || '').toLowerCase();
      if (targetLeague !== 'all leagues' && targetLeague !== 'all' && !mLeague.includes(targetLeague.replace(' - virtual', '').replace(' league', ''))) {
        return false;
      }

      let matchOddVal = null;
      if (targetMarket === 'HOME' && odds.home_win) matchOddVal = Number(odds.home_win).toFixed(2);
      else if (targetMarket === 'AWAY' && odds.away_win) matchOddVal = Number(odds.away_win).toFixed(2);
      else if (targetMarket === 'DRAW' && odds.draw) matchOddVal = Number(odds.draw).toFixed(2);

      return matchOddVal === targetOddVal;
    });
  }, [currentOdd, upcomingMatches]);

  if (!currentOdd) return null;

  const strikeColor = stats.winRate >= 75 ? GREEN : stats.winRate >= 50 ? GOLD : RED;

  // Filtered matches by search
  const filteredMatches = detailedMatches.filter(m => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (m.home_team || '').toLowerCase().includes(term) ||
      (m.away_team || '').toLowerCase().includes(term) ||
      (m.score || '').includes(term) ||
      (m.match_date || '').includes(term) ||
      (m.match_time || '').includes(term)
    );
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(5, 10, 20, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ultra-glass"
        style={{
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, rgba(10, 20, 35, 0.98) 0%, rgba(5, 12, 24, 0.98) 100%)',
          border: '1px solid rgba(0, 229, 255, 0.35)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 229, 255, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Hero Odd Title & Market */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              background: currentOdd.market === 'HOME' ? 'rgba(0, 255, 136, 0.2)' : currentOdd.market === 'AWAY' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 215, 0, 0.2)',
              border: `2px solid ${currentOdd.market === 'HOME' ? GREEN : currentOdd.market === 'AWAY' ? NEON : GOLD}`,
              padding: '6px 16px',
              borderRadius: '12px',
              boxShadow: `0 0 20px ${currentOdd.market === 'HOME' ? GREEN : currentOdd.market === 'AWAY' ? NEON : GOLD}33`
            }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#FFF' }}>
                {currentOdd.odd.toFixed(2)}
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: '#FFF' }}>
                  {currentOdd.market === 'HOME' ? '🏠 HOME WIN' : currentOdd.market === 'AWAY' ? '✈️ AWAY WIN' : '🤝 DRAW'}
                </h2>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: `${leagueMeta.color}18`,
                  border: `1px solid ${leagueMeta.color}50`,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  color: leagueMeta.color,
                  fontWeight: 700
                }}>
                  <span>{leagueMeta.icon}</span>
                  <span>{leagueMeta.name}</span>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎯 Recurring Winning Odds Deep Intelligence Studio</span>
                <span>•</span>
                <span style={{ color: NEON }}>
                  {timeFilter === 'SINCE_7AM_WAT'
                    ? `Session: Since Last 07:00 WAT (${lastWatInfo?.formattedWat || 'Today 07:00 WAT'})`
                    : 'Session: All Time Database History'}
                </span>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#FFF',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              fontSize: '1.1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 51, 85, 0.2)';
              e.currentTarget.style.borderColor = RED;
              e.currentTarget.style.color = RED;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#FFF';
            }}
          >
            ✕
          </button>
        </div>

        {/* ── METRICS SUMMARY CARDS ── */}
        <div style={{
          padding: '16px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          {/* Win Rate */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>STRIKE RATE</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: strikeColor }}>
              {stats.winRate}%
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
              {stats.won} Won / {stats.total} Played
            </span>
          </div>

          {/* Net ROI */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>NET YIELD / ROI</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: stats.roi >= 0 ? GREEN : RED }}>
              {stats.roi >= 0 ? `+${stats.roi}%` : `${stats.roi}%`}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
              {stats.roi >= 0 ? 'Profitable Edge' : 'Negative Value'}
            </span>
          </div>

          {/* Over 1.5 Goals */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>OVER 1.5 GOALS</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: NEON }}>
              {stats.over15Rate}%
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
              Avg {stats.avgGoals} Goals/Match
            </span>
          </div>

          {/* Over 2.5 Goals */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>OVER 2.5 GOALS</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: PURPLE }}>
              {stats.over25Rate}%
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
              High Goal Frequency
            </span>
          </div>

          {/* BTTS GG */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>BOTH TEAMS SCORE</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: GOLD }}>
              {stats.bttsRate}%
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
              GG Strike Rate
            </span>
          </div>

          {/* Live Alerts */}
          <div style={{
            background: activeMatchingUpcoming.length > 0 ? 'rgba(255, 51, 85, 0.12)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${activeMatchingUpcoming.length > 0 ? 'rgba(255, 51, 85, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
            padding: '12px',
            borderRadius: '10px'
          }}>
            <span style={{ fontSize: '0.7rem', color: activeMatchingUpcoming.length > 0 ? RED : 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 700 }}>
              LIVE FIXTURES
            </span>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: activeMatchingUpcoming.length > 0 ? RED : 'var(--text-muted)' }}>
              {activeMatchingUpcoming.length} Active
            </span>
            <span style={{ fontSize: '0.7rem', color: activeMatchingUpcoming.length > 0 ? '#FFF' : 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
              {activeMatchingUpcoming.length > 0 ? '🔥 Match available now' : 'None in upcoming'}
            </span>
          </div>
        </div>

        {/* ── NAVIGATION TABS & SEARCH ── */}
        <div style={{
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'matches', label: `📋 Match History (${detailedMatches.length})` },
              { id: 'stats', label: '📊 Goal & Score Breakdown' },
              { id: 'live-alerts', label: `⚡ Live Upcoming (${activeMatchingUpcoming.length})`, highlight: activeMatchingUpcoming.length > 0 }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: activeTab === tab.id ? 'rgba(0, 229, 255, 0.18)' : 'transparent',
                  color: activeTab === tab.id ? NEON : tab.highlight ? RED : 'var(--text-secondary)',
                  border: `1px solid ${activeTab === tab.id ? NEON : 'transparent'}`,
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  fontWeight: activeTab === tab.id || tab.highlight ? 800 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Search */}
          {activeTab === 'matches' && (
            <input
              type="text"
              placeholder="Search team or score..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#FFF',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                width: '200px'
              }}
            />
          )}
        </div>

        {/* ── TAB CONTENT BODY ── */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: MATCH HISTORY TABLE */}
          {activeTab === 'matches' && (
            <div>
              {filteredMatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No matches match your search criteria.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        <th style={{ padding: '10px 8px' }}>DATE / TIME</th>
                        <th style={{ padding: '10px 8px' }}>MATCH FIXTURE</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>SCORE (HT)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>TOTAL GOALS</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>MARKETS</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>OUTCOME</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatches.map((m, idx) => (
                        <tr
                          key={m.id || idx}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: m.won ? 'rgba(0, 255, 136, 0.02)' : 'rgba(255, 51, 85, 0.02)',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {/* Date / Time */}
                          <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                            <div>{m.match_date}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.match_time || '--:--'}</div>
                          </td>

                          {/* Match */}
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: 700, color: '#FFF' }}>
                              <span style={{ color: currentOdd.market === 'HOME' ? (m.won ? GREEN : '#FFF') : '#FFF' }}>
                                {m.home_team}
                              </span>
                              <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>vs</span>
                              <span style={{ color: currentOdd.market === 'AWAY' ? (m.won ? NEON : '#FFF') : '#FFF' }}>
                                {m.away_team}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {m.league}
                            </div>
                          </td>

                          {/* Score */}
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#FFF' }}>
                              {m.score || '0:0'}
                            </div>
                            {m.ht_score && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                HT: {m.ht_score}
                              </div>
                            )}
                          </td>

                          {/* Total Goals */}
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: m.totalGoals >= 3 ? PURPLE : m.totalGoals >= 2 ? NEON : 'var(--text-muted)' }}>
                              {m.totalGoals} Goals
                            </span>
                          </td>

                          {/* Markets */}
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: m.isOver15 ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255,255,255,0.05)', color: m.isOver15 ? NEON : 'var(--text-muted)' }}>
                                {m.isOver15 ? 'O1.5' : 'U1.5'}
                              </span>
                              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: m.isOver25 ? 'rgba(167, 139, 250, 0.15)' : 'rgba(255,255,255,0.05)', color: m.isOver25 ? PURPLE : 'var(--text-muted)' }}>
                                {m.isOver25 ? 'O2.5' : 'U2.5'}
                              </span>
                              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: m.isBTTS ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.05)', color: m.isBTTS ? GOLD : 'var(--text-muted)' }}>
                                {m.isBTTS ? 'GG' : 'NG'}
                              </span>
                            </div>
                          </td>

                          {/* Outcome */}
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: m.won ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 51, 85, 0.15)',
                              border: `1px solid ${m.won ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 51, 85, 0.4)'}`,
                              color: m.won ? GREEN : RED,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontWeight: 800,
                              fontSize: '0.72rem'
                            }}>
                              {m.won ? 'WON ✅' : 'LOST ❌'}
                            </span>
                          </td>

                          {/* Action */}
                          <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                            {onSelectMatch && (
                              <button
                                type="button"
                                onClick={() => onSelectMatch(m)}
                                style={{
                                  background: 'rgba(0, 229, 255, 0.08)',
                                  border: '1px solid rgba(0, 229, 255, 0.25)',
                                  color: NEON,
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer',
                                  fontWeight: 700
                                }}
                              >
                                H2H ↗
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STATS & SCORE DISTRIBUTION */}
          {activeTab === 'stats' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Scoreline Distribution */}
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 14px 0', color: '#FFF' }}>
                  🎯 Exact Scoreline Frequency
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stats.scoresMap.map((s, idx) => (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: '#FFF' }}>{s.score}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{s.count} times ({s.percent}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${s.percent}%`, height: '100%', background: `linear-gradient(90deg, ${NEON}, ${GREEN})`, borderRadius: '3px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Goal Markets Analysis */}
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 4px 0', color: '#FFF' }}>
                  📊 Secondary Market Probabilities
                </h3>

                {/* Over 1.5 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Over 1.5 Goals</span>
                    <strong style={{ color: NEON }}>{stats.over15Rate}%</strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${stats.over15Rate}%`, height: '100%', background: NEON, borderRadius: '3px' }} />
                  </div>
                </div>

                {/* Over 2.5 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Over 2.5 Goals</span>
                    <strong style={{ color: PURPLE }}>{stats.over25Rate}%</strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${stats.over25Rate}%`, height: '100%', background: PURPLE, borderRadius: '3px' }} />
                  </div>
                </div>

                {/* BTTS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Both Teams Score (GG)</span>
                    <strong style={{ color: GOLD }}>{stats.bttsRate}%</strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${stats.bttsRate}%`, height: '100%', background: GOLD, borderRadius: '3px' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE UPCOMING ALERTS */}
          {activeTab === 'live-alerts' && (
            <div>
              {activeMatchingUpcoming.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>⏳</span>
                  <p style={{ margin: 0, fontWeight: 700, color: '#FFF' }}>No upcoming matches currently offer this exact odd ({currentOdd.odd.toFixed(2)}).</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>When the next round opens on SportyBet, fixtures with this recurring odd will appear here automatically.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(0, 255, 136, 0.1)',
                    border: '1px solid rgba(0, 255, 136, 0.3)',
                    color: GREEN,
                    fontSize: '0.82rem',
                    fontWeight: 700
                  }}>
                    🔥 {activeMatchingUpcoming.length} Active Upcoming Fixture(s) have this exact {currentOdd.odd.toFixed(2)} {currentOdd.market} odd!
                  </div>

                  {activeMatchingUpcoming.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(0, 229, 255, 0.3)',
                        borderRadius: '10px',
                        padding: '16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.75rem', color: NEON, fontWeight: 700, marginBottom: '2px' }}>
                          Kickoff: {m.match_time || '--:--'} · {m.league}
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#FFF' }}>
                          {m.home_team} vs {m.away_team}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Pre-match Odds: 1 ({m.odds?.home_win || '--'}) | X ({m.odds?.draw || '--'}) | 2 ({m.odds?.away_win || '--'})
                        </div>
                      </div>

                      {onSelectMatch && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectMatch(m);
                            onClose();
                          }}
                          style={{
                            background: `linear-gradient(90deg, ${NEON}, ${GREEN})`,
                            border: 'none',
                            color: '#000',
                            fontWeight: 800,
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            cursor: 'pointer'
                          }}
                        >
                          ⚡ Open 6-Engine H2H Studio ↗
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER: OTHER RECURRING ODDS CAROUSEL ── */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          overflowX: 'auto'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>
            Switch Odd:
          </span>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            {allOdds.slice(0, 15).map((o) => {
              const isSelected = o.id === currentOdd.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onSelectOdd && onSelectOdd(o)}
                  style={{
                    background: isSelected ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${isSelected ? NEON : 'rgba(255, 255, 255, 0.1)'}`,
                    color: isSelected ? NEON : '#FFF',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 800 : 500,
                    cursor: 'pointer',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{o.market === 'HOME' ? '🏠' : o.market === 'AWAY' ? '✈️' : '🤝'}</span>
                  <span>{o.odd.toFixed(2)}</span>
                  <span style={{ fontSize: '0.65rem', color: o.winRate >= 60 ? GREEN : 'var(--text-muted)' }}>
                    ({o.winRate}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
