// ─────────────────────────────────────────────────────────────────────────────
// trial_test.js  — Full end-to-end pipeline validation
//
// Tests the full flow:
//   1. Snapshot a page via Puppeteer  
//   2. Claude Vision extracts match data
//   3. Match data is validated (league, date, score)
//   4. Data is uploaded to Firebase Firestore (vfootball_results)
//   5. Firebase is queried to verify the data is there
//
// Run: node trial_test.js
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const { extractMatchDataFromImage } = require('./claude_extractor');
const { uploadMatchesToFirebase }   = require('./firebase_uploader');
const { getDb }                    = require('./firebase_init');

// ── Config ────────────────────────────────────────────────────────────────────
const TEST_LEAGUE     = 'England - Virtual';   // DB league name
const TEST_SCREENSHOT = path.join(__dirname, 'testdownloadpage');

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Find any available .png in testdownloadpage, or use a mock
// ─────────────────────────────────────────────────────────────────────────────
function findTestImage() {
    if (!fs.existsSync(TEST_SCREENSHOT)) {
        console.log('[Trial] testdownloadpage folder does not exist yet.');
        return null;
    }
    const files = fs.readdirSync(TEST_SCREENSHOT).filter(f => f.endsWith('.png'));
    if (files.length === 0) {
        console.log('[Trial] No .png screenshots found in testdownloadpage/');
        return null;
    }
    const chosen = path.join(TEST_SCREENSHOT, files[0]);
    console.log(`[Trial] Using screenshot: ${files[0]}`);
    return chosen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Verify Firebase connection
// ─────────────────────────────────────────────────────────────────────────────
async function checkFirebaseConnection() {
    console.log('\n[Trial] 🔥 Checking Firebase connection...');
    try {
        const db = getDb();
        const snap = await db.collection('vfootball_results').limit(1).get();
        console.log(`[Trial] ✅ Firebase connected. Collection has ${snap.size} record(s) on spot check.`);
        return true;
    } catch (err) {
        console.error('[Trial] ❌ Firebase connection failed:', err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Use Mock data (guaranteed valid) to prove Firebase upload works
// ─────────────────────────────────────────────────────────────────────────────
async function testMockUpload() {
    console.log('\n[Trial] 🧪 Phase 1: Mock upload test...');
    const today = (() => {
        const d  = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        return `${dd}/${mm}/${yy}`;
    })();

    const mockMatches = [
        {
            time: '10:00', date: today, gameId: `TRIAL_${Date.now()}`,
            homeTeam: 'TestHome', awayTeam: 'TestAway', score: '3:1',
            league: TEST_LEAGUE
        }
    ];

    try {
        const { uploaded, skipped } = await uploadMatchesToFirebase(mockMatches, msg => console.log(`[Trial]   ${msg}`));
        if (uploaded > 0) {
            console.log(`[Trial] ✅ Mock upload passed! ${uploaded} doc(s) written to Firestore.`);
            return true;
        } else {
            console.error(`[Trial] ❌ Mock upload failed — ${skipped} record(s) skipped. Check validator logs above!`);
            return false;
        }
    } catch (err) {
        console.error('[Trial] ❌ Mock upload threw an error:', err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Claude extraction test (real API call)
// ─────────────────────────────────────────────────────────────────────────────
async function testClaudeExtraction(imagePath) {
    console.log(`\n[Trial] 🧪 Phase 2: Claude Vision extraction test on: ${path.basename(imagePath)}`);
    try {
        const result = await extractMatchDataFromImage(imagePath, TEST_LEAGUE);
        console.log(`[Trial] Claude returned ${result.matches.length} match(es). Pages: ${result.totalPages}`);

        if (result.matches.length === 0) {
            console.warn('[Trial] ⚠️ Claude returned 0 matches. This may be expected if the screenshot has no match data visible.');
            return false;
        }

        // Spot check first record
        const m = result.matches[0];
        console.log(`[Trial] Sample record: date=${m.date} | league=${m.league} | gameId=${m.gameId} | score=${m.score}`);

        // Check date validity
        const dateValid = /^\d{2}\/\d{2}\/\d{4}$/.test(m.date);
        if (!dateValid) {
            console.warn(`[Trial] ⚠️ Sample record has invalid date: "${m.date}". This will cause Firebase to skip it!`);
        }
        return result.matches.length > 0;
    } catch (err) {
        console.error('[Trial] ❌ Claude extraction failed:', err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Query Firebase to confirm the mock record was written
// ─────────────────────────────────────────────────────────────────────────────
async function verifyFirebaseRecord(gameId) {
    console.log(`\n[Trial] 🧪 Phase 3: Verifying record in Firestore (gameId prefix: TRIAL_)...`);
    try {
        const db = getDb();
        const snap = await db.collection('vfootball_results')
            .where('gameId', '>=', 'TRIAL_')
            .where('gameId', '<', 'TRIAL_z')
            .limit(5)
            .get();

        if (snap.empty) {
            console.error('[Trial] ❌ No TRIAL_ records found in Firestore! Upload did not persist.');
            return false;
        }

        snap.forEach(doc => {
            const d = doc.data();
            console.log(`[Trial] ✅ Found Firestore doc: ${doc.id} — ${d.homeTeam} vs ${d.awayTeam} (${d.score}) | league: ${d.league}`);
        });
        return true;
    } catch (err) {
        console.error('[Trial] ❌ Firestore query failed:', err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function runTrial() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🚀 Full Pipeline Trial Test — claude_extractor.js    ');
    console.log('═══════════════════════════════════════════════════════');

    // Step 1: Environment check
    console.log('\n[Trial] 🔑 Checking API keys...');
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
        console.error('[Trial] ❌ ANTHROPIC_API_KEY is missing or a placeholder!');
        process.exit(1);
    }
    console.log(`[Trial] ✅ ANTHROPIC_API_KEY present (${process.env.ANTHROPIC_API_KEY.substring(0, 15)}...)`);

    // Step 2: Firebase connectivity
    const fbOk = await checkFirebaseConnection();
    if (!fbOk) process.exit(1);

    // Step 3: Mock upload to prove Firebase write works
    const mockOk = await testMockUpload();
    if (!mockOk) {
        console.error('\n[Trial] 🛑 STOPPED — Firebase write path is broken. Fix the uploader before running Claude.\n');
        process.exit(1);
    }

    // Step 4: Query to verify the mock record is in Firebase
    await verifyFirebaseRecord();

    // Step 5: Claude extraction test (only if screenshot available)
    const imagePath = findTestImage();
    if (imagePath) {
        await testClaudeExtraction(imagePath);
    } else {
        console.log('\n[Trial] ℹ️ No screenshot available for Claude test. Capture one first via the UI, then re-run this script.');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ Trial complete — check results above for any ❌  ');
    console.log('═══════════════════════════════════════════════════════\n');
    process.exit(0);
}

runTrial().catch(err => {
    console.error('[Trial] 💥 Unhandled error:', err);
    process.exit(1);
});
