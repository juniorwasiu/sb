require('dotenv').config();
const OpenAI = require('openai');
const { uploadMatchesToDatabase } = require('./db_uploader');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// openai_extractor.js
//
// Sends a screenshot to OpenAI GPT-4o Vision for native table extraction.
// Extracted matches are stamped with extractedAt + source, then returned
// to the caller for Firebase upload.
//
// Drop-in replacement for claude_extractor.js — same function signatures,
// same return shape:  { matches: [...], totalPages: N }
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'gpt-4o'; // Best OpenAI vision model for tabular data extraction

/**
 * Sends an image to OpenAI GPT-4o Vision, extracts match rows as JSON,
 * stamps metadata, and returns to caller for Firebase push.
 *
 * @param {string} imagePath  - Absolute path to PNG screenshot
 * @param {string} leagueName - Firestore DB league name (e.g. "England - Virtual")
 * @returns {Promise<{matches: Array, totalPages: number}>}
 */
async function extractMatchDataFromImage(imagePath, leagueName) {
    console.log(`\n[OpenAI Extractor] 🚀 Processing: ${path.basename(imagePath)}`);
    console.log(`[OpenAI Extractor] 🏆 Target League: ${leagueName}`);

    // ── Pre-flight checks ─────────────────────────────────────────────────────
    if (!process.env.OPENAI_API_KEY) {
        console.error('[OpenAI Extractor] ❌ OPENAI_API_KEY is missing from your environment.');
        return { matches: [], totalPages: 1 };
    }

    if (!fs.existsSync(imagePath)) {
        console.error(`[OpenAI Extractor] ❌ Image not found: ${imagePath}`);
        return { matches: [], totalPages: 1 };
    }

    // ── Build today's date hint ───────────────────────────────────────────────
    const todayDDMMYYYY = (() => {
        const d  = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    })();

    // ── Read image as base64 ──────────────────────────────────────────────────
    const imageData = fs.readFileSync(imagePath).toString('base64');
    const imageUrl  = `data:image/png;base64,${imageData}`;

    const prompt = `You are an expert data extraction bot with perfect vision capabilities.
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

Return ONLY a valid JSON object. No markdown code blocks. No conversational text. No preamble.

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
}`;

    try {
        const IS_MOCK = false;
        let extractedData;

        if (IS_MOCK) {
            console.log('[OpenAI Extractor] ⚠️ USING MOCK DATA — API bypassed for testing ⚠️');
            extractedData = {
                pagesAvailable: 2,
                matches: [
                    { time: '13:37', date: todayDDMMYYYY, gameId: 'm_100', homeTeam: 'SYS', awayTeam: 'BOT', score: '5:0', league: leagueName }
                ]
            };
        } else {
            console.log(`[OpenAI Extractor] 🧠 Sending to ${MODEL}...`);

            const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            // ── OpenAI call with exponential back-off on rate-limit / overload ──
            let response;
            let attempt = 0;
            const MAX_RETRIES = 3;

            while (true) {
                try {
                    response = await client.chat.completions.create({
                        model:      MODEL,
                        max_tokens: 8192,
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type:       'image_url',
                                        image_url:  { url: imageUrl, detail: 'high' }
                                    },
                                    {
                                        type: 'text',
                                        text: prompt
                                    }
                                ]
                            }
                        ]
                    });
                    break; // ✅ Success

                } catch (e) {
                    attempt++;
                    const status       = e.status ?? e.statusCode;
                    const isRateLimit  = status === 429;
                    const isOverloaded = status === 503 || status === 529;

                    console.error(`[OpenAI Extractor] API error (attempt ${attempt}): status=${status} — ${e.message?.substring(0, 120)}`);

                    if ((isRateLimit || isOverloaded) && attempt < MAX_RETRIES) {
                        const retryAfter = parseInt(e.headers?.['retry-after'] ?? '0') || 0;
                        const baseSec    = retryAfter > 0 ? retryAfter + 2 : (isRateLimit ? 30 : 15);
                        const waitSec    = baseSec * attempt;
                        const reason     = isRateLimit ? 'Rate limit (429)' : 'Service overload';
                        console.log(`[OpenAI Extractor] ⏳ ${reason} — waiting ${waitSec}s before retry ${attempt}/${MAX_RETRIES}...`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                    } else {
                        throw e;
                    }
                }
            }

            // ── Parse response — robustly extract JSON block ──────────────────
            const rawText = (response.choices[0]?.message?.content ?? '').trim();
            console.log(`[OpenAI Extractor] 📄 Raw response preview: ${rawText.substring(0, 300)}`);

            let jsonStr = rawText;
            try {
                // Strip markdown code fences
                jsonStr = rawText.replace(/```json/gi, '').replace(/```/g, '');
                // Extract the outermost JSON object (handles any preamble text)
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace  = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1).trim();
                }
                extractedData = JSON.parse(jsonStr);
                console.log(`[OpenAI Extractor] ✅ JSON parsed. pagesAvailable=${extractedData.pagesAvailable}, matches=${extractedData.matches?.length}`);
            } catch (parseErr) {
                // ── Partial JSON recovery for truncated responses ─────────────
                console.warn('[OpenAI Extractor] ⚠️ JSON parse failed — attempting partial recovery...');
                try {
                    const matchesStart = jsonStr.indexOf('"matches":[');
                    if (matchesStart !== -1) {
                        const partial      = jsonStr.substring(matchesStart + '"matches":['.length);
                        const objects      = [];
                        let depth = 0, start = -1;
                        for (let ci = 0; ci < partial.length; ci++) {
                            if (partial[ci] === '{') { if (depth === 0) start = ci; depth++; }
                            else if (partial[ci] === '}') {
                                depth--;
                                if (depth === 0 && start !== -1) {
                                    try { objects.push(JSON.parse(partial.substring(start, ci + 1))); } catch (_) {}
                                    start = -1;
                                }
                            }
                        }
                        if (objects.length > 0) {
                            const pagesMatch = jsonStr.match(/"pagesAvailable"\s*:\s*(\d+)/);
                            // 3. Upload extracted rows directly to database
                            const { uploaded, skipped } = await uploadMatchesToDatabase(objects, (msg) => {
                                console.log(`[OpenAI Extractor] ${msg}`);
                            });
                            extractedData = { pagesAvailable: pagesMatch ? parseInt(pagesMatch[1]) : 1, matches: objects };
                            console.log(`[OpenAI Extractor] ♻️ Partial recovery salvaged ${objects.length} match objects!`);
                        } else { throw new Error('No complete match objects found'); }
                    } else { throw new Error('Could not find matches array'); }
                } catch (recoveryErr) {
                    console.error('[OpenAI Extractor] ❌ Partial recovery failed:', recoveryErr.message);
                    console.log('[OpenAI Extractor] Raw text:', rawText.substring(0, 800));
                    return { matches: [], totalPages: 1 };
                }
            }
        }

        // ── Validate result ───────────────────────────────────────────────────
        if (!extractedData.matches || !Array.isArray(extractedData.matches) || extractedData.matches.length === 0) {
            console.warn('[OpenAI Extractor] ⚠️ No matches returned. Skipping.');
            return { matches: [], totalPages: 1 };
        }

        const matchArray = extractedData.matches;
        const totalPages = parseInt(extractedData.pagesAvailable) || 1;

        // ── Stamp metadata ────────────────────────────────────────────────────
        const extractedAt = new Date().toISOString();
        matchArray.forEach(match => {
            if (!match.league) match.league = leagueName;
            if (!match.date || !/^\d{2}\/\d{2}\/\d{4}$/.test(match.date)) {
                console.warn(`[OpenAI Extractor] ⚠️ Invalid date "${match.date}" for gameId=${match.gameId} — defaulting to ${todayDDMMYYYY}`);
                match.date = todayDDMMYYYY;
            }
            match.extractedAt = extractedAt;
            match.source      = 'openai-vision';
            match.sourceTag   = 'openai-vision';
        });

        console.log(`[OpenAI Extractor] ✅ Extracted ${matchArray.length} records (Pages: ${totalPages}). Returning to caller...`);

        // ── Debug dump ────────────────────────────────────────────────────────
        const debugPath = path.join(__dirname, 'debug_openai_output.json');
        fs.writeFileSync(debugPath, JSON.stringify(extractedData, null, 2));
        console.log(`[OpenAI Extractor] 🔍 Debug written to: ${path.basename(debugPath)}`);

        console.log('\n[OpenAI Extractor] --- Preview (first 2 records) ---');
        console.log(JSON.stringify(matchArray.slice(0, 2), null, 2));

        return { matches: matchArray, totalPages };

    } catch (err) {
        console.error('\n[OpenAI Extractor] ❌ Extraction failed:', err.message);
        throw err;
    }
}

// Allow direct CLI testing: node openai_extractor.js <path> <league>
if (require.main === module) {
    const testImage = process.argv[2] || path.join(__dirname, 'testdownloadpage', 'screenshot_test.png');
    const league    = process.argv[3] || 'England - Virtual';
    extractMatchDataFromImage(testImage, league).then(data => {
        console.log(`\n[OpenAI Extractor] Total extracted: ${data.matches?.length ?? 0}`);
        console.log(`[OpenAI Extractor] Total pages: ${data.totalPages}`);
    });
}

module.exports = { extractMatchDataFromImage };
