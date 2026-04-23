/**
 * AIProviderSelector.jsx
 *
 * A compact, premium provider picker that shows all available AI engines.
 * Props:
 *   - selectedProvider (string):    currently selected provider id ('deepseek'|'gemini'|'claude')
 *   - onSelect (fn):                called with (providerId) when user picks a provider
 *   - compact (bool):               show tiny inline badge mode instead of full cards
 *   - disabledProviders (string[]): optional list of ids to disable (e.g. loading state)
 *
 * Usage:
 *   <AIProviderSelector selectedProvider={provider} onSelect={setProvider} />
 *   <AIProviderSelector selectedProvider={provider} onSelect={setProvider} compact />
 */
import React, { useState, useEffect } from 'react';

const NEON   = '#00E5FF';
const GREEN  = '#00FF88';
const PURPLE = '#A78BFA';
const GOLD   = '#FFD700';

// Static fallback if the API hasn't loaded yet
const STATIC_PROVIDERS = [
    { id: 'deepseek', label: 'DeepSeek',        emoji: '🚀', model: 'deepseek-chat',            description: 'Fast · JSON-native · Low cost', badge: 'DEFAULT', badgeColor: GREEN,  available: true  },
    { id: 'gemini',   label: 'Google Gemini',    emoji: '✨', model: 'gemini-2.5-pro',           description: 'Smart · Multi-key rotation',    badge: '3 KEYS',  badgeColor: NEON,   available: true  },
    { id: 'claude',   label: 'Anthropic Claude', emoji: '🧠', model: 'claude-3-7-sonnet-20250219', description: 'Elite reasoning',               badge: 'ELITE',   badgeColor: PURPLE, available: true  },
];

export default function AIProviderSelector({
    selectedProvider,
    onSelect,
    compact       = false,
    disabledProviders = [],
    className     = '',
    style         = {},
}) {
    const [providers, setProviders]   = useState(STATIC_PROVIDERS);
    const [switching, setSwitching]   = useState(false);
    const [switchMsg, setSwitchMsg]   = useState('');

    // ── Fetch live provider status from server ──────────────────────────────────
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                console.log('[AIProviderSelector] 🔍 Fetching provider status from /api/ai-provider...');
                const res  = await fetch('/api/ai-provider');
                const data = await res.json();
                if (data.success && data.providers) {
                    setProviders(data.providers);
                    console.log(`[AIProviderSelector] ✅ Loaded ${data.providers.length} providers. Active: ${data.active}`);
                    // Sync active provider if parent hasn't set one yet
                    if (!selectedProvider && data.active && onSelect) {
                        onSelect(data.active);
                    }
                }
            } catch (err) {
                console.warn('[AIProviderSelector] ⚠️ Could not fetch provider status — using static defaults:', err.message);
            }
        };
        fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Handle provider switch (calls server to set global default + local state) ─
    const handleSelect = async (id) => {
        if (id === selectedProvider || switching) return;
        const target = providers.find(p => p.id === id);
        if (!target?.available) return;

        console.log(`[AIProviderSelector] 🔄 Switching provider: ${selectedProvider} → ${id}`);
        setSwitching(true);
        setSwitchMsg('');
        try {
            const res  = await fetch('/api/ai-provider', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ provider: id }),
            });
            const data = await res.json();
            if (data.success) {
                onSelect(id);
                setSwitchMsg(`✅ Switched to ${target.label}`);
                console.log(`[AIProviderSelector] ✅ Provider set to: ${id}`);
            } else {
                setSwitchMsg(`❌ ${data.error}`);
                console.error('[AIProviderSelector] ❌ Switch failed:', data.error);
            }
        } catch (err) {
            setSwitchMsg(`❌ Network error: ${err.message}`);
            console.error('[AIProviderSelector] ❌ Switch error:', err.message);
        } finally {
            setSwitching(false);
            setTimeout(() => setSwitchMsg(''), 3000);
        }
    };

    // ── Compact inline mode (tiny pills for embedding in analysis buttons) ────────
    if (compact) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', ...style }} className={className}>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>
                    AI
                </span>
                {providers.map(p => {
                    const isActive   = p.id === selectedProvider;
                    const isDisabled = !p.available || disabledProviders.includes(p.id) || (switching && !isActive);
                    return (
                        <button
                            key={p.id}
                            id={`ai-provider-compact-${p.id}`}
                            title={`${p.label} — ${p.description}${!p.available ? ' (key not configured)' : ''}`}
                            onClick={() => handleSelect(p.id)}
                            disabled={isDisabled}
                            style={{
                                fontSize:     '0.62rem',
                                fontWeight:   800,
                                padding:      '2px 8px',
                                borderRadius: 20,
                                border:       `1px solid ${isActive ? p.badgeColor : 'rgba(255,255,255,0.12)'}`,
                                background:   isActive ? `${p.badgeColor}18` : 'rgba(255,255,255,0.04)',
                                color:        isActive ? p.badgeColor : p.available ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                                cursor:       isDisabled ? 'not-allowed' : 'pointer',
                                transition:   'all 0.15s ease',
                                opacity:      isDisabled && !isActive ? 0.5 : 1,
                                boxShadow:    isActive ? `0 0 8px ${p.badgeColor}30` : 'none',
                            }}
                        >
                            {p.emoji} {p.label.split(' ')[0]}
                        </button>
                    );
                })}
                {switchMsg && (
                    <span style={{ fontSize: '0.6rem', color: switchMsg.startsWith('✅') ? GREEN : '#FF3355', marginLeft: 4 }}>
                        {switchMsg}
                    </span>
                )}
            </div>
        );
    }

    // ── Full card mode ────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} className={className}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    🤖 AI Engine
                </div>
                {switchMsg && (
                    <div style={{
                        fontSize: '0.65rem', fontWeight: 700,
                        color: switchMsg.startsWith('✅') ? GREEN : '#FF3355',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        {switchMsg}
                    </div>
                )}
            </div>

            {/* Provider cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {providers.map(p => {
                    const isActive   = p.id === selectedProvider;
                    const isDisabled = !p.available || disabledProviders.includes(p.id);
                    return (
                        <button
                            key={p.id}
                            id={`ai-provider-card-${p.id}`}
                            title={p.available ? `Use ${p.label} for predictions` : `${p.label} key not configured in .env`}
                            onClick={() => !isDisabled && handleSelect(p.id)}
                            disabled={isDisabled && !isActive}
                            style={{
                                display:       'flex',
                                flexDirection: 'column',
                                alignItems:    'center',
                                gap:           4,
                                padding:       '10px 6px',
                                borderRadius:  10,
                                border:        `1px solid ${isActive ? p.badgeColor : 'rgba(255,255,255,0.07)'}`,
                                background:    isActive
                                    ? `linear-gradient(135deg, ${p.badgeColor}15, ${p.badgeColor}05)`
                                    : 'rgba(255,255,255,0.02)',
                                cursor:        isDisabled ? 'not-allowed' : 'pointer',
                                transition:    'all 0.2s ease',
                                boxShadow:     isActive ? `0 0 16px ${p.badgeColor}20` : 'none',
                                opacity:       isDisabled ? 0.4 : 1,
                                position:      'relative',
                            }}
                            onMouseEnter={e => {
                                if (!isDisabled && !isActive)
                                    e.currentTarget.style.borderColor = `${p.badgeColor}60`;
                            }}
                            onMouseLeave={e => {
                                if (!isActive)
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                            }}
                        >
                            {/* Active indicator dot */}
                            {isActive && (
                                <div style={{
                                    position: 'absolute', top: 5, right: 5,
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: p.badgeColor,
                                    boxShadow: `0 0 6px ${p.badgeColor}`,
                                    animation: 'pulse 1.5s infinite',
                                }} />
                            )}

                            {/* Emoji */}
                            <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>
                                {switching && isActive ? '⏳' : p.emoji}
                            </div>

                            {/* Label */}
                            <div style={{
                                fontSize:   '0.62rem',
                                fontWeight: 800,
                                color:      isActive ? p.badgeColor : 'rgba(255,255,255,0.75)',
                                textAlign:  'center',
                                lineHeight: 1.2,
                            }}>
                                {p.label.replace('Google ', '').replace('Anthropic ', '')}
                            </div>

                            {/* Badge */}
                            <div style={{
                                fontSize:     '0.5rem',
                                fontWeight:   900,
                                color:        p.badgeColor,
                                background:   `${p.badgeColor}15`,
                                border:       `1px solid ${p.badgeColor}30`,
                                borderRadius: 20,
                                padding:      '1px 5px',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                            }}>
                                {p.badge}
                            </div>

                            {/* Model name */}
                            <div style={{
                                fontSize:   '0.48rem',
                                color:      'rgba(255,255,255,0.25)',
                                fontFamily: 'monospace',
                                textAlign:  'center',
                                marginTop:  2,
                            }}>
                                {p.model}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Description of active provider */}
            {providers.find(p => p.id === selectedProvider) && (
                <div style={{
                    fontSize:    '0.65rem',
                    color:       'rgba(255,255,255,0.35)',
                    textAlign:   'center',
                    marginTop:   2,
                    fontStyle:   'italic',
                }}>
                    {providers.find(p => p.id === selectedProvider)?.description}
                </div>
            )}

            {/* How it works note */}
            <div style={{
                fontSize:     '0.6rem',
                color:        'rgba(255,255,255,0.18)',
                padding:      '6px 8px',
                background:   'rgba(255,255,255,0.02)',
                borderRadius: 6,
                lineHeight:   1.5,
            }}>
                ℹ️ Switching AI changes ALL future predictions globally for this server session.
                You can also override per-request with the <code style={{ color: GOLD, fontFamily: 'monospace' }}>provider</code> field in the analyze body.
            </div>
        </div>
    );
}
