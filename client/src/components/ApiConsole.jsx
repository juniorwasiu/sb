import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const CATEGORIES = {
  PREDICTIONS: '🔮 Predictions & Analysis',
  POSITIONAL_TRACE: '📊 Positional Trace Dashboard',
  SCRAPER: '📥 Scraper & Results Sync',
  AI_SYSTEM: '🧠 AI Memory & Strategy',
  SYSTEM: '⚙️ Diagnostics & Logs'
};

const ENDPOINTS = [
  {
    id: 'analyze-tips',
    category: CATEGORIES.PREDICTIONS,
    method: 'POST',
    path: '/api/vfootball/daily-tips/analyze',
    description: 'Triggers the AI predictions engine for a specific league or sequentially across all leagues to generate daily tips for a given date.',
    howItWorks: '1. Loads form profiles, league intelligence baselines, and past context from local files.\n2. Iterates through selected league(s).\n3. Compiles match triggers and queries DeepSeek/AI API.\n4. Saves prediction JSON output locally under `server/data/daily_tips.json` and updates strategy success indicators.\n5. Broadcasts progress via Server-Sent Events.',
    defaultBody: {
      league: 'All Leagues',
      date: new Date(Date.now() + 86400000).toLocaleDateString('en-GB') // Tomorrow's date
    },
    requiresBody: true
  },
  {
    id: 'get-tips',
    category: CATEGORIES.PREDICTIONS,
    method: 'GET',
    path: '/api/vfootball/daily-tips',
    description: 'Retrieves generated daily predictions and tips for a given league and date. Supports All Leagues consolidation.',
    howItWorks: '1. Reads `daily_tips.json` local store.\n2. Filters records matching query date.\n3. If "All Leagues" is selected, reads and merges matching tips across England, Spain, Italy, Germany, and France into a unified, league-badged array.',
    defaultParams: {
      league: 'All Leagues',
      date: new Date().toLocaleDateString('en-GB')
    },
    requiresParams: true
  },
  {
    id: 'predict-live',
    category: CATEGORIES.PREDICTIONS,
    method: 'POST',
    path: '/api/vfootball/predict-live',
    description: 'Runs real-time match predictions referencing live odds and team-form patterns for active virtual matchdays.',
    howItWorks: '1. Fetches current live odds from in-memory scraper queue.\n2. Correlates team-form configurations and matches live betting triggers.\n3. Evaluates predicted outcomes (e.g. Over 1.5, Goal-Goal).\n4. Responds with live prediction results.',
    defaultBody: {
      league: 'England - Virtual'
    },
    requiresBody: true
  },
  {
    id: 'get-tips-history',
    category: CATEGORIES.PREDICTIONS,
    method: 'GET',
    path: '/api/vfootball/daily-tips/history',
    description: 'Fetches historical entries of daily prediction documents saved in local storage.',
    howItWorks: '1. Scans `daily_tips.json` local file.\n2. Filters logs by optional league query.\n3. Sorts records by update timestamp descending and returns the latest 20 items.',
    defaultParams: {
      league: ''
    },
    requiresParams: true
  },
  {
    id: 'run-scrape',
    category: CATEGORIES.SCRAPER,
    method: 'POST',
    path: '/api/local-vfootball/scrape',
    description: 'Spawns Puppeteer scraper to extract finished match results from sportybet.com results archive and saves them to local storage.',
    howItWorks: '1. Launches headless chromium browser instances.\n2. Navigates to sportybet results archive and inputs virtual football selectors.\n3. Extracts score strings, league tags, matchdates, and identifiers.\n4. Smart-syncs matching scores to `vfootball_results.json` and updates scraping checkpoints in `history_logs.json`.',
    defaultBody: {
      league: 'England - Virtual',
      pages: 3
    },
    requiresBody: true
  },
  {
    id: 'trigger-bg-scrape',
    category: CATEGORIES.SCRAPER,
    method: 'POST',
    path: '/api/local-vfootball/trigger-background-scrape',
    description: 'Dispatches an asynchronous, non-blocking scraper task in the background.',
    howItWorks: '1. Spawns scraping process in the background so the HTTP request returns immediately.\n2. Streamlogs print step-by-step Chrome automation progress directly to console and SSE logs.',
    defaultBody: {},
    requiresBody: false
  },
  {
    id: 'get-results',
    category: CATEGORIES.SCRAPER,
    method: 'GET',
    path: '/api/public/results',
    description: 'Queries extracted match results from local database JSON files.',
    howItWorks: '1. Reads `vfootball_results.json` local file.\n2. Performs query matches for league, date, and date limits.\n3. Returns sorted list of match scores.',
    defaultParams: {
      league: 'England - Virtual',
      date: new Date().toLocaleDateString('en-GB'),
      limit: 100
    },
    requiresParams: true
  },
  {
    id: 'sync-db',
    category: CATEGORIES.SCRAPER,
    method: 'POST',
    path: '/api/sync-local-to-database',
    description: 'Triggers local scrape JSON storage uploads/sync validation processes.',
    howItWorks: '1. Iterates locally dumped match logs.\n2. Ensures all IDs match target hashes.\n3. Synchronizes and saves data records to memory caches.',
    defaultBody: {},
    requiresBody: false
  },
  {
    id: 'get-strategy',
    category: CATEGORIES.AI_SYSTEM,
    method: 'GET',
    path: '/api/ai-strategy',
    description: 'Retrieves current active AI prediction rules, parameters, draw guards, and performance stats.',
    howItWorks: '1. Checks `ai_system.json` for ID `strategy`.\n2. If not found, initializes default draw guard rules, Home ADVANTAGE guidelines, etc., and saves them locally.\n3. Returns active strategy profile.',
    defaultParams: {},
    requiresParams: false
  },
  {
    id: 'strategy-history',
    category: CATEGORIES.AI_SYSTEM,
    method: 'GET',
    path: '/api/ai/strategy-history',
    description: 'Queries historical records of AI strategy changes, rules added/removed, and learning model pivots.',
    howItWorks: '1. Reads `ai_strategy_history.json` local storage.\n2. Returns historical strategy events sorted by execution date.',
    defaultParams: {},
    requiresParams: false
  },
  {
    id: 'learning-mode',
    category: CATEGORIES.AI_SYSTEM,
    method: 'POST',
    path: '/api/vfootball/learning-mode',
    description: 'Triggers Deep Learning analysis on past results to compute team trends, recurring rules, and form baselines.',
    howItWorks: '1. Extracts historical results for selected league over last 30 days.\n2. Feeds statistics to AI processing models.\n3. Compiles Top Performing Teams, venue splits, and draft strategy modifications.\n4. Stores output inside `ai_league_intelligence.json` local store.',
    defaultBody: {
      league: 'England - Virtual',
      date: new Date().toLocaleDateString('en-GB')
    },
    requiresBody: true
  },
  {
    id: 'health',
    category: CATEGORIES.SYSTEM,
    method: 'GET',
    path: '/api/health',
    description: 'Returns server operational parameters, CPU, memory, and chromium status indicators.',
    howItWorks: 'Queries Node.js system environment configurations and returns hardware resources and Puppeteer diagnostic flags.',
    defaultParams: {},
    requiresParams: false
  },
  {
    id: 'scraper-diag',
    category: CATEGORIES.SYSTEM,
    method: 'GET',
    path: '/api/scraper-diag',
    description: 'Retrieves Puppeteer crawler diagnostic statistics and screenshots archive list.',
    howItWorks: 'Checks directory listing for generated snapshots, memory utilization, and active chromedriver instances.',
    defaultParams: {},
    requiresParams: false
  },
  {
    id: 'pt-patterns',
    category: CATEGORIES.POSITIONAL_TRACE,
    method: 'GET',
    path: '/api/positional-trace/patterns',
    description: 'Fetches position patterns, streaks, transition probabilities, and top recurring scores for Positional Trace Dashboard.',
    howItWorks: '1. Group matches by round key.\n2. Iterates through positions 0-9.\n3. Calculates outcome patterns, streaks, and Markov chain transition rates for Match Results, BTTS, Over 1.5, and Over 2.5.',
    defaultParams: {
      league: 'England League',
      sortType: 'homeTeam'
    },
    requiresParams: true
  },
  {
    id: 'pt-predict',
    category: CATEGORIES.POSITIONAL_TRACE,
    method: 'GET',
    path: '/api/positional-trace/predict',
    description: 'Runs real-time AI predictions for all matches of the target league or all 5 leagues using visual patterns.',
    howItWorks: '1. Scrapes active/upcoming live list vFootball games.\n2. Compiles historical position win rates and Markov transition matrices.\n3. Dispatches prompt to DeepSeek AI and parses predictions output.\n4. Saves prediction documents to predictions history log.',
    defaultParams: {
      league: 'England League'
    },
    requiresParams: true
  },
  {
    id: 'pt-predictions-history',
    category: CATEGORIES.POSITIONAL_TRACE,
    method: 'GET',
    path: '/api/positional-trace/predictions-history',
    description: 'Retrieves predictions history resolved against actual scores from local results.',
    howItWorks: '1. Scans `local_predictions_history.json` local store.\n2. Filters history records matching query league.\n3. Correlates outcome correctness metrics against completed match results in `local_results.json`.',
    defaultParams: {
      league: 'England League'
    },
    requiresParams: true
  },
  {
    id: 'pt-results',
    category: CATEGORIES.POSITIONAL_TRACE,
    method: 'GET',
    path: '/api/positional-trace/results',
    description: 'Retrieves finished historical results dataset directly from local results storage.',
    howItWorks: '1. Reads `local_results.json` local database.\n2. Returns count and array of all match result objects.',
    defaultParams: {},
    requiresParams: false
  }
];

export default function ApiConsole() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0]);
  const [requestBody, setRequestBody] = useState(JSON.stringify(ENDPOINTS[0].defaultBody || {}, null, 2));
  const [queryParams, setQueryParams] = useState(ENDPOINTS[0].defaultParams || {});
  
  // Response states
  const [loading, setLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState(null);
  const [responseTime, setResponseTime] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [errorText, setErrorText] = useState(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real-time AI status log stream
  const [liveLogs, setLiveLogs] = useState([]);
  const logsEndRef = useRef(null);

  // Sync state changes when endpoint is switched
  const handleEndpointSelect = (endpoint) => {
    setSelectedEndpoint(endpoint);
    setRequestBody(JSON.stringify(endpoint.defaultBody || {}, null, 2));
    setQueryParams(endpoint.defaultParams || {});
    setResponseStatus(null);
    setResponseTime(null);
    setResponseData(null);
    setErrorText(null);
    console.log(`[ApiConsole] 🔌 Selected API endpoint: ${endpoint.method} ${endpoint.path}`);
  };

  // Connect to Server-Sent Events status stream
  useEffect(() => {
    console.log('[ApiConsole] 📡 Subscribing to SSE stream /api/ai-status-stream...');
    const es = new EventSource('/api/ai-status-stream');
    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        const time = new Date(parsed.timestamp || Date.now()).toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        setLiveLogs(prev => [...prev.slice(-99), { ...parsed, displayTime: time }]);
      } catch (e) {
        console.warn('[ApiConsole] Failed to parse SSE data:', e);
      }
    };
    es.onerror = () => {
      console.warn('[ApiConsole] SSE connection disconnected or errored.');
    };
    return () => {
      console.log('[ApiConsole] 🛑 Closing SSE stream.');
      es.close();
    };
  }, []);

  // Auto scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveLogs]);

  // Execute API Request
  const handleRunRequest = async () => {
    setLoading(true);
    setResponseStatus(null);
    setResponseData(null);
    setErrorText(null);
    const start = performance.now();
    
    // Construct Path & Query Params
    let requestPath = selectedEndpoint.path;
    if (selectedEndpoint.method === 'GET' && Object.keys(queryParams).length > 0) {
      const q = new URLSearchParams();
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          q.append(k, v);
        }
      });
      const qStr = q.toString();
      if (qStr) requestPath += `?${qStr}`;
    }

    console.log(`[ApiConsole] 🚀 Dispatching ${selectedEndpoint.method} to ${requestPath}`);

    try {
      const options = {
        method: selectedEndpoint.method,
        headers: {}
      };

      if (selectedEndpoint.method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        options.body = requestBody;
        // Verify JSON is valid first
        try {
          JSON.parse(requestBody);
        } catch (je) {
          throw new Error(`Invalid Request JSON Body: ${je.message}`);
        }
      }

      const res = await fetch(requestPath, options);
      const duration = Math.round(performance.now() - start);
      setResponseTime(duration);
      setResponseStatus(`${res.status} ${res.statusText}`);

      const data = await res.json();
      setResponseData(data);
      console.log(`[ApiConsole] ✅ Response received in ${duration}ms status=${res.status}`);
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      setResponseTime(duration);
      setResponseStatus('Error');
      setErrorText(err.message);
      console.error('[ApiConsole] ❌ Request execution failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter endpoints by search query
  const filteredEndpoints = ENDPOINTS.filter(ep => 
    ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ep.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ep.method.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group endpoints by category
  const groupedEndpoints = {};
  Object.values(CATEGORIES).forEach(cat => {
    groupedEndpoints[cat] = filteredEndpoints.filter(ep => ep.category === cat);
  });

  // Action badge colour mapping
  const actionColors = {
    start: 'var(--accent-purple)',
    fetching: 'var(--accent-neon)',
    tool: 'var(--accent-gold)',
    analyzing: '#FF8800',
    success: 'var(--accent-success)',
    error: 'var(--accent-live)',
    info: 'var(--text-secondary)'
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        {/* Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <Link to="/" style={{ color: 'var(--accent-neon)', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 700 }}>🔮 Pattern Intel</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
          <span style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', fontWeight: 700 }}>💻 API Playground</span>
        </div>

        <h1 style={{ fontSize: '3rem', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
          API <span className="glow-text">Console</span> Playground
        </h1>
        <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: 0 }}>
          <span style={{ color: 'var(--accent-success)', fontWeight: 700, background: 'rgba(0,255,136,0.08)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0,255,136,0.2)', fontSize: '0.82rem' }}>💾 LOCAL STORE ENABLED</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Document, configure, and trigger express prediction and scraper workflows dynamically.</span>
        </p>
      </header>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT PANEL: Endpoint Explorer */}
        <aside className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: 'fit-content' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                color: 'white',
                padding: '10px 12px',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color var(--transition-fast)'
              }}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
            {Object.entries(groupedEndpoints).map(([categoryName, eps]) => {
              if (eps.length === 0) return null;
              return (
                <div key={categoryName} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {categoryName}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {eps.map(ep => {
                      const isSelected = selectedEndpoint.id === ep.id;
                      const getBadgeColor = ep.method === 'GET' ? 'var(--accent-success)' : 'var(--accent-gold)';
                      return (
                        <button
                          key={ep.id}
                          onClick={() => handleEndpointSelect(ep)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            padding: '10px 12px',
                            background: isSelected ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                            border: isSelected ? '1px solid var(--glass-border-bright)' : '1px solid transparent',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginBottom: '4px' }}>
                            <span style={{ 
                              fontSize: '0.65rem', fontWeight: 800, padding: '2px 5px', borderRadius: '4px',
                              background: `rgba(${ep.method === 'GET' ? '0,255,136' : '255,215,0'}, 0.15)`,
                              color: getBadgeColor, border: `1px solid rgba(${ep.method === 'GET' ? '0,255,136' : '255,215,0'}, 0.25)`
                            }}>
                              {ep.method}
                            </span>
                            <span style={{ 
                              fontSize: '0.8rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                            }}>
                              {ep.path}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                            {ep.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* RIGHT PANEL: Interactive Request Panel */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <section className="glass-panel premium-glow-border" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ 
                    fontSize: '0.8rem', fontWeight: 900, padding: '4px 10px', borderRadius: '6px',
                    background: `rgba(${selectedEndpoint.method === 'GET' ? '0,255,136' : '255,215,0'}, 0.15)`,
                    color: selectedEndpoint.method === 'GET' ? 'var(--accent-success)' : 'var(--accent-gold)', 
                    border: `1px solid rgba(${selectedEndpoint.method === 'GET' ? '0,255,136' : '255,215,0'}, 0.3)`
                  }}>
                    {selectedEndpoint.method}
                  </span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {selectedEndpoint.path}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  {selectedEndpoint.description}
                </p>
              </div>

              <button
                onClick={handleRunRequest}
                disabled={loading}
                className="hover-lift"
                style={{
                  background: 'var(--accent-neon)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 24px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 0 20px rgba(0, 229, 255, 0.4)',
                  transition: 'all 0.2s',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner spinner-small" style={{ borderTopColor: '#000', borderLeftColor: '#000' }}></span>
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Send Request</span>
                  </>
                )}
              </button>
            </div>

            {/* How it works explanation block */}
            <div style={{ 
              padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', 
              borderRadius: 'var(--radius-sm)', fontSize: '0.82rem'
            }}>
              <div style={{ color: 'var(--accent-purple)', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📖</span> HOW IT WORKS UNDER THE HOOD
              </div>
              <pre style={{ 
                margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'Inter, sans-serif', color: 'var(--text-secondary)', 
                lineHeight: '1.6', fontSize: '0.8rem' 
              }}>
                {selectedEndpoint.howItWorks}
              </pre>
            </div>

            {/* Interactive forms for params/body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
              {/* GET Query parameters form */}
              {selectedEndpoint.method === 'GET' && selectedEndpoint.requiresParams && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Query Parameters
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {Object.entries(queryParams).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {key}
                        </label>
                        {key === 'league' ? (
                          <select
                            value={val}
                            onChange={(e) => setQueryParams(prev => ({ ...prev, [key]: e.target.value }))}
                            style={{
                              background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                              borderRadius: '6px', color: 'white', padding: '8px 12px', fontSize: '0.85rem', outline: 'none'
                            }}
                          >
                            <option value="All Leagues">All Leagues</option>
                            <option value="England - Virtual">England</option>
                            <option value="Spain - Virtual">Spain</option>
                            <option value="Italy - Virtual">Italy</option>
                            <option value="Germany - Virtual">Germany</option>
                            <option value="France - Virtual">France</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => setQueryParams(prev => ({ ...prev, [key]: e.target.value }))}
                            style={{
                              background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                              borderRadius: '6px', color: 'white', padding: '8px 12px', fontSize: '0.85rem', outline: 'none',
                              fontFamily: 'monospace'
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* POST Body parameters editor */}
              {selectedEndpoint.method === 'POST' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      JSON Request Body
                    </span>
                    <button 
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(requestBody);
                          setRequestBody(JSON.stringify(parsed, null, 2));
                        } catch {
                          alert('Invalid JSON structure. Please check layout.');
                        }
                      }}
                      style={{ 
                        background: 'none', border: 'none', color: 'var(--accent-purple)', fontSize: '0.75rem', 
                        cursor: 'pointer', padding: 0 
                      }}
                    >
                      ✨ Format JSON
                    </button>
                  </div>
                  <textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    style={{
                      height: '140px',
                      background: '#04060b',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      padding: '12px',
                      outline: 'none',
                      resize: 'vertical',
                      lineHeight: '1.5'
                    }}
                  />
                </div>
              )}
            </div>
          </section>

          {/* RESPONSE SECTION */}
          {(responseStatus || responseData || errorText || loading) && (
            <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Response Status:</span>
                  {loading ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="spinner spinner-small"></span> Waiting for server response...
                    </span>
                  ) : (
                    <span style={{ 
                      fontSize: '0.8rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px',
                      background: responseStatus?.startsWith('2') ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 51, 85, 0.12)',
                      color: responseStatus?.startsWith('2') ? 'var(--accent-success)' : 'var(--accent-live)',
                      border: `1px solid rgba(${responseStatus?.startsWith('2') ? '0,255,136' : '255,51,85'}, 0.25)`
                    }}>
                      {responseStatus}
                    </span>
                  )}
                </div>
                {!loading && responseTime && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    ⏱️ Latency: <strong style={{ color: 'var(--accent-neon)' }}>{responseTime} ms</strong>
                  </span>
                )}
              </div>

              {/* Data block */}
              {loading ? (
                <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                </div>
              ) : errorText ? (
                <div className="history-error glass-panel" style={{ padding: '16px', margin: 0 }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span className="history-error-icon">⚠️</span>
                    <div>
                      <h4 className="history-error-title" style={{ margin: '0 0 4px 0' }}>Request Failure</h4>
                      <p className="history-error-body" style={{ margin: 0 }}>{errorText}</p>
                    </div>
                  </div>
                </div>
              ) : responseData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Payload Data JSON
                    </span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(responseData, null, 2));
                        alert('JSON Response copied to clipboard!');
                      }}
                      style={{ 
                        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', padding: '4px 10px', borderRadius: '4px' 
                      }}
                    >
                      📋 Copy JSON
                    </button>
                  </div>
                  <pre style={{ 
                    maxHeight: '400px', overflowY: 'auto', background: '#04060b', border: '1px solid var(--glass-border)', 
                    borderRadius: '8px', padding: '16px', margin: 0, fontSize: '0.85rem', fontFamily: 'monospace', 
                    color: '#e4f0ff', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                  }}>
                    {JSON.stringify(responseData, null, 2)}
                  </pre>
                </div>
              ) : null}
            </section>
          )}

          {/* SYSTEM SSE BROADCAST LOGS */}
          <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(167, 139, 250, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(167, 139, 250, 0.1)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pulse-dot"></span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-purple)' }}>AI & Scraper Live Streams</span>
              </div>
              <button 
                onClick={() => setLiveLogs([])}
                style={{ 
                  background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', 
                  cursor: 'pointer', padding: 0 
                }}
              >
                🗑️ Clear Streams
              </button>
            </div>

            <div style={{ 
              height: '250px', overflowY: 'auto', background: '#020305', border: '1px solid var(--glass-border)', 
              borderRadius: '8px', padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', display: 'flex', 
              flexDirection: 'column', gap: '8px', lineHeight: '1.4'
            }}>
              {liveLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px', fontSize: '0.75rem' }}>
                  No active logs streamed. Run predictions or scraping API tasks above to observe status events in real-time.
                </div>
              ) : (
                liveLogs.map((log, index) => {
                  const badgeColor = actionColors[log.action] || 'var(--text-secondary)';
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{log.displayTime}]</span>
                      <span style={{ 
                        color: badgeColor, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase', fontSize: '0.7rem',
                        padding: '1px 5px', borderRadius: '4px', background: `rgba(255,255,255,0.03)`, border: `1px solid ${badgeColor}33`
                      }}>
                        {log.action}
                      </span>
                      {log.league && (
                        <span style={{ color: 'var(--accent-neon)', fontWeight: 600, flexShrink: 0, fontSize: '0.72rem' }}>
                          ({log.league})
                        </span>
                      )}
                      <span style={{ color: log.action === 'error' ? 'var(--accent-live)' : 'var(--text-primary)' }}>
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef}></div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
