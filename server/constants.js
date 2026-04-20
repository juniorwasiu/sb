// ─────────────────────────────────────────────────────────────────────────────
// constants.js
//
// Single source of truth for league name mappings used across the pipeline.
// Prevents subtle bugs caused by duplicate string-replace logic scattered
// across screenshot_scraper, index.js, and firebase_uploader.
//
// Usage:
//   const { LEAGUE_MAP, LEAGUE_TAB_TEXT, toDbLeague } = require('./constants');
// ─────────────────────────────────────────────────────────────────────────────

// Maps dashboard / scraper league names → clean Firestore DB league name
const LEAGUE_MAP = {
    'England League': 'England - Virtual',
    'Spain League':   'Spain - Virtual',
    'Italy League':   'Italy - Virtual',
    'Germany League': 'Germany - Virtual',
    'France League':  'France - Virtual',
};

// Maps dashboard league name → the text visible in the SportyBet league tab buttons
const LEAGUE_TAB_TEXT = {
    'England League': 'England',
    'Spain League':   'Spain',
    'Italy League':   'Italy',
    'Germany League': 'Germany',
    'France League':  'France',
};

const SUPPORTED_LEAGUES = ['England League', 'Spain League', 'Italy League', 'Germany League', 'France League'];

/**
 * Converts any league name variant to a clean Firestore-safe DB league name.
 * Falls back gracefully if the key is not found.
 */
function toDbLeague(league) {
    if (!league) return 'Unknown';

    // Direct match from LEAGUE_MAP
    if (LEAGUE_MAP[league]) return LEAGUE_MAP[league];

    // Handle "England League" -> "England - Virtual"
    if (league.includes(' League')) {
        return `${league.replace(' League', '')} - Virtual`;
    }

    // Handle "England" -> "England - Virtual" (for sync-all or direct inputs)
    if (['England', 'Spain', 'Italy', 'Germany', 'France'].includes(league)) {
        return `${league} - Virtual`;
    }

    // Already a DB league name (e.g. "England - Virtual") — return as-is
    return league;
}

module.exports = { LEAGUE_MAP, LEAGUE_TAB_TEXT, toDbLeague, SUPPORTED_LEAGUES };
