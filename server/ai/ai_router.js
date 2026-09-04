require('dotenv').config();
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// ai_router.js
//
// Unified AI extraction router.
// Reads the active provider from ai_config.json and delegates the
// extractMatchDataFromImage call to either:
//   • gemini_extractor.js  (Google Gemini 2.5 Flash)
//   • claude_extractor.js  (Anthropic Claude Sonnet 4.6)
//   • openai_extractor.js  (OpenAI GPT-4o Vision)
//
// The active provider can be changed at runtime via the Admin Dashboard
// without restarting the server.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, 'ai_config.json');

// Default config written on first run
const DEFAULT_CONFIG = {
    provider: 'gemini',            // 'gemini' | 'claude' | 'openai'
    geminiModel:  'gemini-2.5-flash',
    claudeModel:  'claude-sonnet-4-6',
    openaiModel:  'gpt-4o',
    updatedAt:    new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the AI config from disk.
 * If the file doesn't exist, writes & returns the default.
 * @returns {{ provider: string, claudeModel: string, openaiModel: string }}
 */
function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
            console.log('[AI Router] ✅ Created default ai_config.json (provider: gemini)');
            return DEFAULT_CONFIG;
        }
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (err) {
        console.error('[AI Router] ⚠️ Could not read ai_config.json — using defaults:', err.message);
        return DEFAULT_CONFIG;
    }
}

/**
 * Persists new config fields to ai_config.json.
 * @param {object} updates - Partial config overrides
 * @returns {object} Full merged config after save
 */
function writeConfig(updates) {
    const current = readConfig();
    const merged  = { ...current, ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
    console.log(`[AI Router] 💾 Config saved: provider=${merged.provider}`);
    return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core extraction — delegates to the configured provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts match data from a screenshot using the currently configured AI provider.
 * Drop-in replacement for claude_extractor.extractMatchDataFromImage.
 *
 * @param {string} imagePath  - Absolute path to PNG screenshot
 * @param {string} leagueName - Firestore DB league name (e.g. "England - Virtual")
 * @returns {Promise<{matches: Array, totalPages: number, provider: string}>}
 */
async function extractMatchDataFromImage(imagePath, leagueName) {
    const config   = readConfig();
    const provider = (config.provider || 'claude').toLowerCase();

    console.log(`[AI Router] 🔀 Provider: ${provider.toUpperCase()} | League: ${leagueName}`);

    let result;

    if (provider === 'openai') {
        const { extractMatchDataFromImage: openaiExtract } = require('./openai_extractor');
        result = await openaiExtract(imagePath, leagueName);
    } else if (provider === 'claude') {
        const { extractMatchDataFromImage: claudeExtract } = require('./claude_extractor');
        result = await claudeExtract(imagePath, leagueName);
    } else {
        // Default: Gemini
        const { extractMatchDataFromImage: geminiExtract } = require('./gemini_extractor');
        result = await geminiExtract(imagePath, leagueName);
    }

    // Stamp the provider on every record so we can track which AI extracted it
    const stamp = provider === 'openai' ? 'openai-vision' : provider === 'claude' ? 'claude-vision' : 'gemini-vision';
    if (result.matches) {
        result.matches.forEach(m => {
            m.aiProvider = provider;
            m.source     = stamp;
            m.sourceTag  = stamp;
        });
    }

    return { ...result, provider };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { extractMatchDataFromImage, readConfig, writeConfig };
