// ─────────────────────────────────────────────────────────────────────────────
// LeagueIntelligencePanel.jsx
//
// 🧬 League DNA — Prediction Intelligence Engine
//
// Shows the macro-statistical baselines for all leagues, computed from the last
// 7 days of MongoDB match data. These baselines are injected as Tier-1 critical
// context into EVERY AI prediction prompt (predict-live + daily-tips).
//
// Algorithm Priority System:
//   TIER 1 (Override generic defaults):
//     - over1_5 >= 75%  → STRONG_O15_LEAGUE signal → auto-favor O1.5
//     - draw >= 26%     → DRAW_MAGNET signal       → boost draw probability
//     - btts >= 55%     → STRONG_BTTS signal        → default GG as strong
//
//   TIER 2 (Contextual adjustment):
//     - over2_5 >= 55%  → O2.5 is viable in this league
//     - over2_5 < 45%   → Under 2.5 safer baseline
//     - top scoreline   → If 1-1 is #1, draw must be considered in balanced games
//
//   TIER 3 (Conflict detection):
//     - Team BTTS < 35% but League BTTS > 55% → Flag cautionary note
//     - Team O1.5 < 50% but League O1.5 > 75% → Flag divergence
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';

// ── Design tokens
const NEON   = '#00E5FF';
const GREEN  = '#00FF88';
const GOLD   = '#FFD700';
const PURPLE = '#A78BFA';
const RED    = '#FF3355';
const ORANGE = '#FF6B35';

// ── League visual identity map
const LEAGUE_META = {
    'England - Virtual':  { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#e63946', accent: '#ff8a8a', character: 'High-energy, open, attack-heavy' },
    'Italy - Virtual':    { flag: '🇮🇹', color: '#2196f3', accent: '#64b5f6', character: 'Defensive, tactical, draw-prone' },
    'Spain - Virtual':    { flag: '🇪🇸', color: '#ff9800', accent: '#ffb74d', character: '1-0 dominant, low BTTS, home strong' },
    'Germany - Virtual':  { flag: '🇩🇪', color: '#4caf50', accent: '#81c784', character: 'Highest draw rate, 1-1 magnet league' },
    'France - Virtual':   { flag: '🇫🇷', color: '#9c27b0', accent: '#ce93d8', character: 'Balanced, open, 0-0 risk present' },
};

// ── Color threshold decision function — mirrors AI prompt logic
function getStatColor(pct, highThresh, midThresh) {
    if (pct >= highThresh) return GREEN;
    if (pct >= midThresh)  return GOLD;
    return RED;
}

// ── Animated stat progress bar
function StatBar({ label, pct, high, mid, note }) {
    const color = getStatColor(pct, high, mid);
    return (
        <div style={{ marginBottom: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {label}
                </span>
                <span style={{ fontSize: '0.88rem', color, fontWeight: 900, fontFamily: 'monospace' }}>
                    {pct}%
                </span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${Math.min(pct, 100)}%`,
                    background: `linear-gradient(90deg, ${color}70, ${color})`,
                    borderRadius: 3,
                    transition: 'width 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
                }} />
            </div>
            {note && (
                <div style={{ fontSize: '0.61rem', color: 'rgba(255,255,255,0.3)', marginTop: 2, lineHeight: 1.4 }}>{note}</div>
            )}
        </div>
    );
}

// ── Compact league card (selector)
function LeagueCard({ baseline, isSelected, onClick }) {
    const meta = LEAGUE_META[baseline.league] || { flag: '⚽', color: '#64748b', accent: '#94a3b8', character: '' };
    const stats = baseline.stats || {};

    // Compute active signals for this league
    const signals = [];
    if ((stats.over1_5Percent || 0) >= 75) signals.push({ label: `⚡ STRONG O1.5 ${stats.over1_5Percent}%`, color: GREEN });
    else if ((stats.over1_5Percent || 0) >= 70) signals.push({ label: `📈 GOOD O1.5 ${stats.over1_5Percent}%`, color: GOLD });

    if ((stats.drawPercent || 0) >= 26)  signals.push({ label: `🤝 DRAW MAGNET ${stats.drawPercent}%`, color: GOLD });
    if ((stats.bttsPercent || 0) >= 55)  signals.push({ label: `⚽ BTTS ${stats.bttsPercent}%`, color: NEON });
    if ((stats.over2_5Percent || 0) >= 55) signals.push({ label: `🎯 O2.5 VIABLE ${stats.over2_5Percent}%`, color: PURPLE });
    else if ((stats.over2_5Percent || 0) < 45) signals.push({ label: `🛡️ U2.5 SAFE ${100 - stats.over2_5Percent}%`, color: ORANGE });

    return (
        <button
            onClick={onClick}
            style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${isSelected ? meta.color : 'rgba(255,255,255,0.07)'}`,
                background: isSelected
                    ? `linear-gradient(135deg, ${meta.color}18, rgba(5,5,15,0.6))`
                    : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? `0 0 18px ${meta.color}25` : 'none',
                marginBottom: 6,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: signals.length > 0 ? 8 : 0 }}>
                <span style={{ fontSize: '1.3rem' }}>{meta.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {baseline.league.replace(' - Virtual', '')}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                        {(baseline.matchCount || 0).toLocaleString()} matches · Avg {baseline.avgGoals?.toFixed?.(2) || (baseline.stats?.avgGoals?.toFixed?.(2)) || '?'} goals/match
                    </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 900, fontFamily: 'monospace', color: getStatColor(stats.over1_5Percent || 0, 75, 70) }}>
                        {stats.over1_5Percent ?? '?'}%
                    </div>
                    <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>O1.5</div>
                </div>
            </div>

            {signals.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {signals.map((sig, i) => (
                        <span key={i} style={{
                            fontSize: '0.58rem', fontWeight: 800, padding: '2px 6px', borderRadius: 20,
                            background: `${sig.color}12`, color: sig.color, border: `1px solid ${sig.color}35`,
                        }}>
                            {sig.label}
                        </span>
                    ))}
                </div>
            )}
        </button>
    );
}

// ── Algorithm Directives renderer
function DirectiveTag({ icon, text, color }) {
    return (
        <div style={{
            display: 'flex', gap: 7, alignItems: 'flex-start',
            fontSize: '0.7rem', color,
            padding: '5px 9px',
            background: `${color}08`,
            borderRadius: 5,
            border: `1px solid ${color}20`,
            lineHeight: 1.4,
        }}>
            <span style={{ flexShrink: 0, fontSize: '0.85rem' }}>{icon}</span>
            <span>{text}</span>
        </div>
    );
}

// ── Main Panel Component
export default function LeagueIntelligencePanel() {
    const [baselines, setBaselines]         = useState([]);
    const [loading, setLoading]             = useState(true);
    const [computing, setComputing]         = useState(false);
    const [selectedLeague, setSelectedLeague] = useState(null);
    const [error, setError]                 = useState(null);
    const [computeResult, setComputeResult] = useState(null);

    // ── Fetch all cached baselines from MongoDB
    const fetchBaselines = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            console.log('[LeagueDNA] 🧬 Fetching all league baselines from API...');
            const res  = await fetch('/api/vfootball/league-baselines');
            const data = await res.json();
            if (data.success) {
                setBaselines(data.baselines || []);
                if (data.baselines?.length > 0 && !selectedLeague) {
                    setSelectedLeague(data.baselines[0].league);
                }
                console.log(`[LeagueDNA] ✅ Loaded ${data.baselines.length} baselines.`);
            } else {
                setError(data.error || 'Failed to load baselines');
                console.error('[LeagueDNA] ❌ API error:', data.error);
            }
        } catch (err) {
            setError(`Network error: ${err.message}`);
            console.error('[LeagueDNA] ❌ Fetch failed:', err.message);
        } finally {
            setLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Trigger recompute from last 7 days of MongoDB data
    const handleCompute = async () => {
        if (computing) return;
        setComputing(true);
        setComputeResult(null);
        setError(null);
        console.log('[LeagueDNA] 🔄 Triggering DNA baseline recompute (last 7 days)...');
        try {
            const res  = await fetch('/api/vfootball/league-baselines/compute', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                console.log(`[LeagueDNA] ✅ Computed ${data.computed} leagues:`, data.summary);
                setComputeResult(`✅ Recomputed ${data.computed} leagues successfully`);
                await fetchBaselines();
            } else {
                setError(data.error || 'Recompute failed');
                console.error('[LeagueDNA] ❌ Compute failed:', data.error);
            }
        } catch (err) {
            setError(`Compute error: ${err.message}`);
            console.error('[LeagueDNA] ❌ Compute request failed:', err.message);
        } finally {
            setComputing(false);
        }
    };

    useEffect(() => {
        fetchBaselines();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const selected = baselines.find(b => b.league === selectedLeague);
    const meta     = selected ? (LEAGUE_META[selected.league] || { flag: '⚽', color: '#64748b', accent: '#94a3b8', character: '' }) : null;
    const stats    = selected?.stats || {};

    return (
        <div className="glass-panel" style={{
            padding: '20px',
            border: `1px solid ${NEON}20`,
            background: `linear-gradient(180deg, rgba(0,229,255,0.03) 0%, transparent 100%)`,
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Subtle background glow */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: `${NEON}05`, filter: 'blur(30px)', pointerEvents: 'none' }} />

            {/* ── Header ──────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="pulse-dot" style={{ backgroundColor: NEON, boxShadow: `0 0 8px ${NEON}` }} />
                        <span style={{ fontSize: '0.78rem', color: NEON, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            🧬 League DNA Engine
                        </span>
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 4, lineHeight: 1.4 }}>
                        Macro-behavioral baselines from last 7 days · Injected into every AI prompt
                    </div>
                </div>
                <button
                    id="league-dna-recompute-btn"
                    onClick={handleCompute}
                    disabled={computing}
                    style={{
                        background: computing ? 'transparent' : `rgba(0,229,255,0.08)`,
                        border: `1px solid ${NEON}35`,
                        color: computing ? 'rgba(255,255,255,0.3)' : NEON,
                        padding: '5px 11px',
                        borderRadius: 6,
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        cursor: computing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all 0.2s',
                        flexShrink: 0,
                    }}
                >
                    {computing ? (
                        <><div className="spinner" style={{ width: 9, height: 9, borderWidth: 1, margin: 0, borderTopColor: NEON }} /> Computing…</>
                    ) : '🔄 Recompute'}
                </button>
            </div>

            {/* ── How This Works ──────────────────────────── */}
            <div style={{
                background: 'rgba(0,0,0,0.35)',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 14,
                borderLeft: `3px solid ${GOLD}`,
                fontSize: '0.66rem',
                color: 'rgba(255,255,255,0.42)',
                lineHeight: 1.55,
            }}>
                <strong style={{ color: GOLD, display: 'block', marginBottom: 3 }}>💡 How This Engine Works</strong>
                Baselines are computed from <strong style={{ color: 'white' }}>1,000–1,300+ matches per league</strong> and cached to MongoDB.
                On every AI prediction, they are injected as <strong style={{ color: NEON }}>Tier-1 override context</strong>, anchoring
                Over/Under, BTTS, and Match Winner logic to real league averages.
                The AI <em>cannot ignore</em> these signals — they supersede generic form defaults.
                Recompute after any major data sync.
            </div>

            {/* ── Feedback messages ────────────────────────── */}
            {error && (
                <div style={{ padding: '7px 10px', background: 'rgba(255,51,85,0.08)', border: `1px solid ${RED}30`, borderRadius: 6, marginBottom: 10, fontSize: '0.72rem', color: RED }}>
                    ⚠️ {error}
                </div>
            )}
            {computeResult && !error && (
                <div style={{ padding: '7px 10px', background: `${GREEN}08`, border: `1px solid ${GREEN}25`, borderRadius: 6, marginBottom: 10, fontSize: '0.72rem', color: GREEN }}>
                    {computeResult}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '12px 0' }}>
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0, borderTopColor: NEON }} />
                    Loading league DNA baselines…
                </div>
            ) : baselines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>📊</div>
                    <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>No baselines computed yet.</div>
                    <div style={{ fontSize: '0.7rem', marginBottom: 14, color: 'rgba(255,255,255,0.3)' }}>
                        Run a Sync All first, or manually trigger Recompute.
                    </div>
                    <button
                        onClick={handleCompute}
                        disabled={computing}
                        style={{
                            background: `rgba(0,229,255,0.1)`, border: `1px solid ${NEON}40`,
                            color: NEON, padding: '7px 16px', borderRadius: 7,
                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800, fontFamily: 'Inter, sans-serif',
                        }}
                    >
                        {computing ? 'Computing…' : '🔄 Compute Now'}
                    </button>
                </div>
            ) : (
                <>
                    {/* ── League Selector Cards ────────────────── */}
                    <div style={{ marginBottom: 14 }}>
                        {baselines.map(bl => (
                            <LeagueCard
                                key={bl.league}
                                baseline={bl}
                                isSelected={selectedLeague === bl.league}
                                onClick={() => {
                                    setSelectedLeague(bl.league);
                                    console.log(`[LeagueDNA] Selected: ${bl.league}`);
                                }}
                            />
                        ))}
                    </div>

                    {/* ── Detail Panel for Selected League ──────── */}
                    {selected && (
                        <div style={{
                            background: `linear-gradient(180deg, ${meta.color}10, rgba(0,0,0,0.4))`,
                            borderRadius: 12,
                            border: `1px solid ${meta.color}25`,
                            padding: '16px',
                            animation: 'fadeUp 0.3s ease',
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span style={{ fontSize: '1.8rem' }}>{meta.flag}</span>
                                <div>
                                    <div style={{ fontWeight: 900, fontSize: '1rem', color: 'white' }}>{selected.league}</div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                                        {meta.character}<br />
                                        {(selected.matchCount || 0).toLocaleString()} matches · Last computed: {selected.lastComputed ? new Date(selected.lastComputed).toLocaleString() : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Stat bars */}
                            <StatBar
                                label="Over 1.5 Goals"
                                pct={stats.over1_5Percent || 0}
                                high={75} mid={70}
                                note={stats.over1_5Percent >= 75
                                    ? '✅ Tier-1 signal active: AI defaults to Over 1.5'
                                    : stats.over1_5Percent >= 70
                                        ? '📊 Moderate — AI considers carefully with team form'
                                        : '⚠️ Weak O1.5 market — verify individual team stats'}
                            />
                            <StatBar
                                label="Over 2.5 Goals"
                                pct={stats.over2_5Percent || 0}
                                high={55} mid={49}
                                note={stats.over2_5Percent >= 55
                                    ? '✅ O2.5 is a viable market in this league'
                                    : `⚠️ Under 2.5 safer — lands ${100 - (stats.over2_5Percent || 0)}% of the time`}
                            />
                            <StatBar
                                label="Both Teams Score (GG)"
                                pct={stats.bttsPercent || 0}
                                high={55} mid={50}
                                note={stats.bttsPercent >= 55
                                    ? '✅ Strong BTTS league — GG is statistically sound'
                                    : 'Moderate — confirm team defensive form before betting GG'}
                            />
                            <StatBar
                                label="Home Win Rate"
                                pct={stats.homeWinPercent || 0}
                                high={43} mid={40}
                                note={`Home ${stats.homeWinPercent || 0}% · Away ${stats.awayWinPercent || 0}% · Draw ${stats.drawPercent || 0}%`}
                            />
                            <StatBar
                                label="Draw Rate"
                                pct={stats.drawPercent || 0}
                                high={26} mid={24}
                                note={stats.drawPercent >= 26
                                    ? `⚠️ Draw-magnet league — always assess 1X double chance`
                                    : 'Normal draw frequency — apply standard form-based logic'}
                            />

                            {/* Top Scorelines */}
                            {selected.topScores?.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ fontSize: '0.65rem', color: GOLD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                        🎯 Top Recurring Scorelines (Behavioral Anchor)
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {selected.topScores.slice(0, 5).map((sc, i) => {
                                            const barW = Math.max(4, Math.min(sc.percent * 9, 100));
                                            const isTop = i === 0;
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '6px 10px',
                                                    background: isTop ? `${GOLD}10` : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${isTop ? GOLD + '25' : 'rgba(255,255,255,0.05)'}`,
                                                    borderRadius: 6,
                                                }}>
                                                    <span style={{ fontSize: '0.58rem', color: isTop ? GOLD : 'rgba(255,255,255,0.3)', fontWeight: 800, minWidth: 18 }}>
                                                        #{i + 1}
                                                    </span>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 900, color: 'white', fontSize: '0.9rem', minWidth: 38 }}>
                                                        {sc.score}
                                                    </span>
                                                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', width: `${barW}%`, background: isTop ? GOLD : `${NEON}55`, borderRadius: 2 }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', minWidth: 34, textAlign: 'right', fontFamily: 'monospace' }}>
                                                        {sc.count}×
                                                    </span>
                                                    <span style={{ fontSize: '0.62rem', color: isTop ? GOLD : 'rgba(255,255,255,0.4)', fontWeight: 700, minWidth: 36, textAlign: 'right' }}>
                                                        {sc.percent}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Scoreline insight */}
                                    {selected.topScores[0]?.score === '1-1' && (
                                        <div style={{ marginTop: 8, fontSize: '0.65rem', color: GOLD, padding: '5px 8px', background: `${GOLD}08`, borderRadius: 5 }}>
                                            🤝 <strong>1-1 is this league's most common result</strong> ({selected.topScores[0].percent}%) —
                                            In balanced fixture matchups, the AI is instructed to boost Draw probability.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Active AI Directives */}
                            <div style={{ marginTop: 16, padding: '12px', background: `rgba(167,139,250,0.06)`, borderRadius: 8, border: `1px solid ${PURPLE}20` }}>
                                <div style={{ fontSize: '0.63rem', color: PURPLE, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                    ⚙️ Active AI Directives for {selected.league.replace(' - Virtual', '')}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {(stats.over1_5Percent || 0) >= 75 && (
                                        <DirectiveTag icon="✅" color={GREEN}
                                            text={`STRONG_O15_LEAGUE: Predict Over 1.5 by default. Only override if both teams have extreme Under records.`} />
                                    )}
                                    {(stats.drawPercent || 0) >= 26 && (
                                        <DirectiveTag icon="⚠️" color={GOLD}
                                            text={`DRAW_MAGNET: High draw tendency (${stats.drawPercent}%). Always assess 1X double chance. Do not blindly predict Home/Away.`} />
                                    )}
                                    {(stats.bttsPercent || 0) >= 55 && (
                                        <DirectiveTag icon="⚽" color={NEON}
                                            text={`STRONG_BTTS: ${stats.bttsPercent}% GG rate. Default GG as viable unless team has < 35% BTTS — flag if conflict exists.`} />
                                    )}
                                    {(stats.over2_5Percent || 0) >= 55 && (
                                        <DirectiveTag icon="🎯" color={PURPLE}
                                            text={`O2.5_VIABLE: ${stats.over2_5Percent}% of games go over 2.5. Confidence in O2.5 market is justified when scoring form aligns.`} />
                                    )}
                                    {(stats.over2_5Percent || 0) < 45 && (
                                        <DirectiveTag icon="🛡️" color={ORANGE}
                                            text={`U2.5_SAFE: Under 2.5 wins ${100 - (stats.over2_5Percent || 0)}% here. Caution on Over 2.5 unless BOTH teams have strong attacking form.`} />
                                    )}
                                    {selected.topScores?.[0]?.score === '1-1' && (
                                        <DirectiveTag icon="🤝" color={GOLD}
                                            text={`1-1 MAGNET: Most frequent score is 1-1. Boost draw in evenly-matched fixtures; do not default to Home Win when H2H is balanced.`} />
                                    )}
                                    {(stats.homeWinPercent || 0) >= 42 && (
                                        <DirectiveTag icon="🏠" color={GREEN}
                                            text={`HOME_STRONG: ${stats.homeWinPercent}% home win rate. Venue advantage is significant — weight HomeWin% heavily in predictions.`} />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Prediction Algorithm Legend ──────── */}
                    <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                            Signal Colour Legend
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {[
                                { color: GREEN, label: 'Strong signal (AI uses by default)' },
                                { color: GOLD, label: 'Moderate / use with form check' },
                                { color: RED, label: 'Weak / caution advised' },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, boxShadow: `0 0 5px ${item.color}` }} />
                                    {item.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
