require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { uploadMatchesToDatabase } = require('./db_uploader');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// claude_extractor.js
//
// Sends a screenshot to Claude Vision for native table extraction.
// Extracted matches are stamped with extractedAt + source, then pushed
// immediately to Firebase Firestore.
//
// Drop-in replacement for gemini_extractor.js — same function signatures,
// same return shape:  { matches: [...], totalPages: N }
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-3-5-sonnet-20241022'; // Claude 3.5 Sonnet — best accuracy for tabular vision data

// ─────────────────────────────────────────────────────────────────────────────
// CORE EXTRACTION — screenshot → Claude Vision → Firebase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an image to Claude Vision, extracts match rows as JSON,
 * stamps metadata, and pushes directly to Firebase Firestore.
 *
 * @param {string} imagePath  - Absolute path to PNG screenshot
 * @param {string} leagueName - Firestore DB league name (e.g. "England - Virtual")
 * @returns {Promise<{matches: Array, totalPages: number}>}
 */
async function extractMatchDataFromImage(imagePath, leagueName) {
    console.log(`\n[Claude Extractor] 🚀 Processing: ${path.basename(imagePath)}`);
    console.log(`[Claude Extractor] 🏆 Target League: ${leagueName}`);

    // ── Pre-flight checks ─────────────────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('[Claude Extractor] ❌ ANTHROPIC_API_KEY is missing from your environment.');
        return { matches: [], totalPages: 1 };
    }

    if (!fs.existsSync(imagePath)) {
        console.error(`[Claude Extractor] ❌ Image not found: ${imagePath}`);
        return { matches: [], totalPages: 1 };
    }

    // ── Read image as base64 ──────────────────────────────────────────────────
    const imageData = fs.readFileSync(imagePath).toString('base64');

    // Derive today's date in DD/MM/YYYY as an extraction hint
    const todayDDMMYYYY = (() => {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    })();

    const prompt = `
    You are an expert data extraction bot with perfect vision capabilities.
    Extract the virtual football match results directly from this screenshot into a clean JSON object.
    The image shows a SportyBet results table with columns: Time, Game ID, and Match Result (Home Team, Score, Away Team).

    We need you to extract TWO things:
    1. "pagesAvailable": Find the pagination section at the bottom (e.g., "< 1 2 3 >"). Return the highest page number you can see. If there is no pagination or only 1 page, return 1.
    2. "matches": The JSON array of match results.

    CRITICAL RULES:
    - Every match object MUST include "league": "${leagueName}".
    - The "date" field MUST be in DD/MM/YYYY format (e.g., "15/04/2026"). Today's date is ${todayDDMMYYYY} — use this if the date is not clearly visible in the screenshot.
    - The "score" field must be in "N:N" format (e.g., "2:1").
    - The "time" field is the match kick-off time in HH:MM format.
    - "gameId" is the numeric match ID shown in the table.

    Return ONLY a valid JSON object. No markdown code blocks. No conversational text.

    Required schema:
    {
      "pagesAvailable": 2,
      "matches": [
        {
          "time": "07:20",
          "date": "${todayDDMMYYYY}",
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
        // ── IS_MOCK flag — set true to bypass API during testing ──────────────
        const IS_MOCK = false;
        let extractedData;

        if (IS_MOCK) {
            console.log('[Claude Extractor] ⚠️ USING MOCK DATA — API bypassed for testing ⚠️');
            extractedData = {
                pagesAvailable: 2,
                matches: [
                    {
                        time: '13:37', date: '15/04/2026', gameId: 'm_100',
                        homeTeam: 'SYS', awayTeam: 'BOT', score: '5:0', league: leagueName
                    }
                ]
            };
        } else {
            console.log(`[Claude Extractor] 🧠 Sending to ${MODEL}...`);

            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

            // ── Claude call with exponential back-off on rate-limit / overload ──
            let response;
            let attempt = 0;
            const MAX_RETRIES = 3;

            while (true) {
                try {
                    response = await client.messages.create({
                        model:      MODEL,
                        max_tokens: 8192, // Increased to handle large match tables without truncation
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type:   'image',
                                        source: {
                                            type:       'base64',
                                            media_type: 'image/png',
                                            data:       imageData,
                                        },
                                    },
                                    {
                                        type: 'text',
                                        text: prompt,
                                    },
                                ],
                            },
                        ],
                    });
                    break; // ✅ Success

                } catch (e) {
                    attempt++;
                    const status        = e.status ?? e.statusCode;
                    const isRateLimit   = status === 429;
                    const isOverloaded  = status === 529 || status === 503;

                    console.error(`[Claude Extractor] API error (attempt ${attempt}): status=${status} — ${e.message?.substring(0, 120)}`);

                    if ((isRateLimit || isOverloaded) && attempt < MAX_RETRIES) {
                        // Honour Retry-After header if present, else use exponential back-off
                        const retryAfter = parseInt(e.headers?.['retry-after'] ?? '0') || 0;
                        const baseSec    = retryAfter > 0 ? retryAfter + 2 : (isRateLimit ? 45 : 15);
                        const waitSec    = baseSec * attempt; // 1×, 2×, 3×
                        const reason     = isRateLimit ? 'Rate limit (429)' : 'Service overload';
                        console.log(`[Claude Extractor] ⏳ ${reason} — waiting ${waitSec}s before retry ${attempt}/${MAX_RETRIES}...`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                    } else {
                        throw e; // Non-retriable or out of attempts
                    }
                }
            }

            // ── Parse response — robustly extract the JSON block ──────────────────
            const rawText = (response.content[0]?.text ?? '').trim();
            console.log(`[Claude Extractor] 📄 Raw response preview: ${rawText.substring(0, 300)}`);

            // Strategy: find the first { and the matching last } to extract the JSON object,
            // even when Claude prefixes the response with conversational text.
            let jsonStr = rawText;
            try {
                // Strip markdown code fences first
                jsonStr = rawText.replace(/```json/gi, '').replace(/```/g, '');
                // Find the outermost JSON object
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace  = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1).trim();
                }
                extractedData = JSON.parse(jsonStr);
                console.log(`[Claude Extractor] ✅ JSON parsed successfully. pagesAvailable=${extractedData.pagesAvailable}, matches=${extractedData.matches?.length}`);
            } catch (parseErr) {
                // ── Fallback: partial JSON recovery for truncated responses ──────────
                // If Claude's response was cut off mid-JSON, try to close the open structures
                // so we can salvage the records that WERE returned.
                console.warn(`[Claude Extractor] ⚠️ JSON parse failed — attempting partial recovery...`);
                try {
                    // Find all complete match objects using a regex that stops at the first incomplete one
                    const matchesStart = jsonStr.indexOf('"matches":[');
                    if (matchesStart !== -1) {
                        let partial = jsonStr.substring(matchesStart + '"matches":['.length);
                        // Find all complete {...} match objects
                        const completeMatches = [];
                        let depth = 0, start = -1;
                        for (let ci = 0; ci < partial.length; ci++) {
                            if (partial[ci] === '{') { if (depth === 0) start = ci; depth++; }
                            else if (partial[ci] === '}') {
                                depth--;
                                if (depth === 0 && start !== -1) {
                                    try {
                                        const obj = JSON.parse(partial.substring(start, ci + 1));
                                        completeMatches.push(obj);
                                    } catch (_) {} // Skip malformed objects
                                    start = -1;
                                }
                            }
                        }
                        if (completeMatches.length > 0) {
                            // Try to salvage pagesAvailable from the truncated head
                            const pagesMatch = jsonStr.match(/"pagesAvailable"\s*:\s*(\d+)/);
                            extractedData = {
                                pagesAvailable: pagesMatch ? parseInt(pagesMatch[1]) : 1,
                                matches: completeMatches
                            };
                            console.log(`[Claude Extractor] ♻️ Partial recovery salvaged ${completeMatches.length} complete match objects!`);
                        } else {
                            throw new Error('No complete match objects found in partial JSON');
                        }
                    } else {
                        throw new Error('Could not find matches array in response');
                    }
                } catch (recoveryErr) {
                    console.error('[Claude Extractor] ❌ Partial recovery also failed:', recoveryErr.message);
                    console.log('[Claude Extractor] Raw text (first 800 chars):', rawText.substring(0, 800));
                    return { matches: [], totalPages: 1 };
                }
            }
        }

        // ── Validate result ───────────────────────────────────────────────────
        if (!extractedData.matches || !Array.isArray(extractedData.matches) || extractedData.matches.length === 0) {
            console.warn('[Claude Extractor] ⚠️ Claude returned empty or invalid matches array. Skipping Firebase push.');
            return { matches: [], totalPages: 1 };
        }

        const matchArray = extractedData.matches;
        const totalPages = parseInt(extractedData.pagesAvailable) || 1;

        // ── Stamp metadata on every record ────────────────────────────────────
        const extractedAt = new Date().toISOString();
        matchArray.forEach(match => {
            if (!match.league)  match.league      = leagueName; // Force league if Claude omits it
            // If Claude returned a missing or invalid date, fall back to today so the
            // db_uploader DD/MM/YYYY validator never silently skips the record
            if (!match.date || !/^\d{2}\/\d{2}\/\d{4}$/.test(match.date)) {
                console.warn(`[Claude Extractor] ⚠️ Invalid or missing date "${match.date}" for gameId=${match.gameId} — defaulting to today (${todayDDMMYYYY})`);
                match.date = todayDDMMYYYY;
            }
            match.extractedAt = extractedAt;
            match.source      = 'claude-vision';
            match.sourceTag   = 'claude-vision';
        });

        console.log(`[Claude Extractor] ✅ Extracted ${matchArray.length} records (Pages detected: ${totalPages}). Returning to caller for Firebase push...`);

        // ── Debug dump ────────────────────────────────────────────────────────
        const debugPath = path.join(__dirname, 'debug_claude_output.json');
        fs.writeFileSync(debugPath, JSON.stringify(extractedData, null, 2));
        console.log(`[Claude Extractor] 🔍 Debug output written to: ${path.basename(debugPath)}`);

        console.log('\n[Claude Extractor] --- Preview (first 2 records) ---');
        console.log(JSON.stringify(matchArray.slice(0, 2), null, 2));

        return { matches: matchArray, totalPages };

    } catch (err) {
        console.error('\n[Claude Extractor] ❌ Extraction failed:', err.message);
        // Re-throw so the caller (screenshot_scraper) knows extraction failed
        throw err;
    }
}

// Allow running directly from command line for manual testing
if (require.main === module) {
    const testImage = process.argv[2] || path.join(__dirname, 'testdownloadpage', 'screenshot_test.png');
    const league    = process.argv[3] || 'England - Virtual';
    extractMatchDataFromImage(testImage, league).then(data => {
        console.log(`\n[Claude Extractor] Total extracted: ${data.matches ? data.matches.length : 0}`);
        console.log(`[Claude Extractor] Total pages detected: ${data.totalPages}`);
    });
}

module.exports = { extractMatchDataFromImage };
