require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { uploadMatchesToDatabase } = require('./db_uploader');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// gemini_extractor.js
//
// Sends a screenshot to Gemini Vision for native table extraction.
// Extracted matches are stamped with extractedAt + source, then pushed
// immediately to Firebase Firestore.
//
// No local JSON storage. No hash tracking. Clean and direct.
// ─────────────────────────────────────────────────────────────────────────────

const genAIClients = [];

// ── Multi-Key Array Builder ──────────────────────────────────────────────────
// Only keys starting with "AIza" are valid Google API keys.
// Invalid/placeholder values are logged and skipped to prevent 400 crashes.
const activeKeys = Object.keys(process.env)
    .filter(k => k.startsWith('GEMINI_API_KEY'))
    .map(k => ({ name: k, value: process.env[k] }))
    .filter(({ name, value }) => {
        const isValid = value && value.startsWith('AIza') && value.length > 20;
        if (!isValid && value && value.length > 3) {
            console.warn(`[Gemini Extractor] ⚠️ Skipping invalid key "${name}" — must start with "AIza"`);
        }
        return isValid;
    })
    .map(({ value }) => value);

activeKeys.forEach(k => genAIClients.push(new GoogleGenerativeAI(k)));


if (genAIClients.length === 0) {
    console.warn('[Gemini Extractor] ⚠️ Warning: No Gemini API keys found in .env!');
} else {
    console.log(`[Gemini Extractor] 🗝️ Active API Keys loaded: ${genAIClients.length}`);
}

const MODEL = 'gemini-2.5-flash'; // Best accuracy for tabular vision data

// ── Rate Limit & Quota Memory Tracker ────────────────────────────────────────
const requestTimestamps = []; 
const tokenTimestamps = [];   

let currentKeyIndex = 0;
let currentKeyDailyUsage = 0; // Rough local estimate of RPD used for the currently active key

function trackUsage(totalTokens) {
    const now = Date.now();
    requestTimestamps.push(now);
    tokenTimestamps.push({ time: now, tokens: totalTokens });
    currentKeyDailyUsage++;
    
    // Keep window strictly 60 seconds
    while(requestTimestamps.length > 0 && now - requestTimestamps[0] > 60000) requestTimestamps.shift();
    while(tokenTimestamps.length > 0 && now - tokenTimestamps[0].time > 60000) tokenTimestamps.shift();
}

function getUsageStats() {
    return {
        rpm: requestTimestamps.length,
        rpmMax: 5,
        tpm: tokenTimestamps.reduce((sum, item) => sum + item.tokens, 0),
        tpmMax: 250000,
        rpd: currentKeyDailyUsage,
        rpdMax: 20,
        keyIndex: currentKeyIndex + 1,
        totalKeys: genAIClients.length || 1
    };
}

/**
 * Converts an image file to a Gemini-compatible inline base64 part.
 * @param {string} filepath
 * @param {string} mimeType
 * @returns {object} Gemini inlineData part
 */
function fileToGenerativePart(filepath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filepath)).toString('base64'),
            mimeType,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE EXTRACTION — screenshot → Gemini Vision → Firebase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an image to Gemini Vision, extracts match rows as JSON,
 * stamps metadata, and pushes directly to Firebase Firestore.
 *
 * @param {string} imagePath  - Absolute path to PNG screenshot
 * @param {string} leagueName - Firestore DB league name (e.g. "England - Virtual")
 * @returns {Promise<Array>}  - Extracted match objects (already uploaded)
 */
async function extractMatchDataFromImage(imagePath, leagueName) {
    console.log(`\n[Gemini Extractor] 🚀 Processing: ${path.basename(imagePath)}`);
    console.log(`[Gemini Extractor] 🏆 Target League: ${leagueName}`);

    // ── Pre-flight checks ─────────────────────────────────────────────────────
    if (genAIClients.length === 0) {
        console.error('[Gemini Extractor] ❌ GEMINI_API_KEY is missing from your environment.');
        return { matches: [], totalPages: 1 };
    }

    if (!fs.existsSync(imagePath)) {
        console.error(`[Gemini Extractor] ❌ Image not found: ${imagePath}`);
        return { matches: [], totalPages: 1 };
    }

    const prompt = `
    You are an expert data extraction bot with perfect vision capabilities.
    Extract the virtual football match results directly from this screenshot into a clean JSON object.
    The image shows a SportyBet results table with columns: Time, Game ID, and Match Result (Home Team, Score, Away Team).

    We need you to extract TWO things:
    1. "pagesAvailable": Find the pagination section at the bottom (e.g., "< 1 2 3 >"). Return the highest page number you can see. If there is no pagination or only 1 page, return 1.
    2. "matches": The JSON array of match results. 

    CRITICAL: Every match object MUST include "league": "${leagueName}".

    Return ONLY a valid JSON object. No markdown code blocks. No conversational text.

    Required schema:
    {
      "pagesAvailable": 2,
      "matches": [
        {
          "time": "07:20",
          "date": "11/04/2026",
          "gameId": "36579",
          "homeTeam": "ARS",
          "awayTeam": "MUN",
          "score": "2:1",
          "league": "${leagueName}"
        }
      ]
    }
    `;

    try {
        const IS_MOCK = false; // Toggle to true to bypass API limits during testing
        let extractedData;
        if (IS_MOCK) {
            console.log("[Gemini Extractor] ⚠️ USING MOCK DATA DUE TO API QUOTA LIMITS ⚠️");
            extractedData = {
                pagesAvailable: 2,
                matches: [
                    { "time": "13:37", "date": "15/04/2026", "gameId": "m_100", "homeTeam": "SYS", "awayTeam": "BOT", "score": "5:0", "league": leagueName }
                ]
            };
        } else {
            console.log(`[Gemini Extractor] 🧠 Sending to ${MODEL} on Key #${currentKeyIndex + 1}...`);
            const imagePart = fileToGenerativePart(imagePath, 'image/png');

            // ── Multi-Key Auto-Rotation & Request ────────────────────────────────
            let result;
            let attempt = 0;
            const MAX_RETRIES = 3;
            const startTime = Date.now();

            while (true) {
                try {
                    const model = genAIClients[currentKeyIndex].getGenerativeModel({ model: MODEL });
                    result = await model.generateContent([prompt, imagePart]);
                    break; // Success
                } catch (e) {
                    attempt++;
                    const isRateLimit  = e.status === 429;
                    const isDeadKey    = e.status === 400 && e.message && e.message.includes('API key not valid');
                    const isForbidden  = e.status === 403;
                    const isOverloaded = e.status === 503;

                    // Multi-key switch protocol when daily RPD is crushed (429) or key is strictly invalid
                    if (isRateLimit || isDeadKey || isForbidden) {
                        console.warn(`[Gemini Extractor] ⚠️ Quota Exceeded/Invalid Key on Key #${currentKeyIndex + 1}! (${isRateLimit ? '429' : '400/403'})`);
                        currentKeyIndex++;
                        if (currentKeyIndex >= genAIClients.length) {
                            console.error('[Gemini Extractor] ❌ FATAL: ALL active Google Gemini API Keys exhausted or invalid.');
                            throw new Error('All Google Gemini keys exhausted or invalid for today. Wait 24h or add valid keys to .env.');
                        }
                        console.log(`[Gemini Extractor] 🔄 ROTATING API KEY. Switching to Key #${currentKeyIndex + 1}.`);
                        currentKeyDailyUsage = 0; 
                        attempt--; // Undo attempt cost
                        continue; // instantly loop again under new key
                    }

                    if (isOverloaded && attempt < MAX_RETRIES) {
                        const waitSec = 15 * attempt;
                        console.log(`[Gemini Extractor] ⏳ Service overload (503) — waiting ${waitSec}s before retry...`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                    } else {
                        throw e; // Non-retriable or out of total service bounds
                    }
                }
            }
            
            const endTime = Date.now();
            const durationMs = endTime - startTime;
            
            let usageMetadata = {};
            if (result.response && result.response.usageMetadata) {
                usageMetadata = result.response.usageMetadata;
            }
            
            const inputTokens = usageMetadata.promptTokenCount || 0;
            const outputTokens = usageMetadata.candidatesTokenCount || 0;
            
            // Advance the telemetry gauges
            trackUsage(inputTokens + outputTokens);
            const enrichedStats = { input: inputTokens, output: outputTokens, durationMs, ...getUsageStats() };
            
            const rawText = result.response.text().trim();
            const jsonStr = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            try {
                extractedData = JSON.parse(jsonStr);
                extractedData.tokenStats = enrichedStats;
                console.log(`[Gemini Extractor] ⏱️ Extraction took ${durationMs}ms | Tokens: ${inputTokens} in / ${outputTokens} out (Key #${enrichedStats.keyIndex})`);
            } catch (parseErr) {
                console.error('[Gemini Extractor] ❌ Gemini returned non-JSON output:');
                console.log(rawText.substring(0, 500));
                return { matches: [], totalPages: 1, tokenStats: enrichedStats };
            }
        }

        if (!extractedData.matches || !Array.isArray(extractedData.matches) || extractedData.matches.length === 0) {
            console.warn('[Gemini Extractor] ⚠️ Gemini returned empty or invalid matches array. Skipping Firebase push.');
            return { matches: [], totalPages: 1, tokenStats: extractedData.tokenStats || { input: 0, output: 0, durationMs: 0 } };
        }

        const matchArray = extractedData.matches;
        const totalPages = parseInt(extractedData.pagesAvailable) || 1;

        // ── Stamp metadata on every record ────────────────────────────────────
        const extractedAt = new Date().toISOString();
        matchArray.forEach(match => {
            // Force league in case Gemini omits it
            if (!match.league) match.league = leagueName;
            // Stamp extraction metadata (who created it & when)
            match.extractedAt = extractedAt;
            match.source      = 'gemini-vision';
            match.sourceTag   = 'gemini-vision';
        });

        console.log(`[Gemini Extractor] ✅ Extracted ${matchArray.length} records (Pages detected: ${totalPages}). Pushing to Firebase...`);

        // Debug dump for troubleshooting — written once per extraction run
        const debugPath = path.join(__dirname, 'debug_gemini_output.json');
        fs.writeFileSync(debugPath, JSON.stringify(extractedData, null, 2));
        console.log(`[Gemini Extractor] 🔍 Debug output written to: ${path.basename(debugPath)}`);

        // ── Push to Database ──────────────────────────────────────────────────
        try {
            const { uploaded, skipped } = await uploadMatchesToDatabase(
                matchArray,
                (msg) => console.log(`[Gemini Extractor → DB] ${msg}`)
            );
            console.log(`[Gemini Extractor] 📤 DB push complete: ${uploaded} written, ${skipped} skipped.`);
        } catch (fbErr) {
            // DB failure does NOT block returning data to the caller
            console.error('[Gemini Extractor] ❌ DB upload failed:', fbErr.message);
        }

        console.log(`[Gemini Extractor] ✅ Extracted ${matchArray.length} records (Pages detected: ${totalPages}). Returning to caller...`);
        console.log(JSON.stringify(matchArray.slice(0, 2), null, 2));

        return { matches: matchArray, totalPages, tokenStats: extractedData.tokenStats || { input: 0, output: 0, durationMs: 0 } };

    } catch (err) {
        console.error('\n[Gemini Extractor] ❌ Extraction failed:', err.message);
        // Re-throw so the caller (screenshot_scraper) knows extraction failed
        throw err;
    }
}

// Allow running directly from command line for manual testing
if (require.main === module) {
    const testImage = process.argv[2] || path.join(__dirname, 'testdownloadpage', 'screenshot_1776255799103.png');
    const league    = process.argv[3] || 'England - Virtual';
    extractMatchDataFromImage(testImage, league).then(data => {
        console.log(`\n[Gemini Extractor] Total extracted: ${data.matches ? data.matches.length : 0}`);
        console.log(`\n[Gemini Extractor] Total pages detected: ${data.totalPages}`);
    });
}

module.exports = { extractMatchDataFromImage };
