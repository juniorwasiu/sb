require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error("Failed to init Firebase", e);
  process.exit(1);
}

const db = admin.firestore();

async function checkIndexes() {
  console.log("Checking index 1: ai_analysis_log (scope, dateLabel, league)...");
  try {
    const q1 = db.collection('ai_analysis_log')
      .where('scope', '==', 'test')
      .where('dateLabel', '==', 'test')
      .where('league', '==', 'England - Virtual');
    await q1.get();
    console.log("✅ Index 1 is OK");
  } catch (err) {
    console.error("❌ Index 1 Error:", err.message);
  }

  console.log("\nChecking index 2: daily_tips (league, timestamp DESC)...");
  try {
    const q2 = db.collection('daily_tips')
      .where('league', '==', 'England - Virtual')
      .orderBy('timestamp', 'desc')
      .limit(1);
    await q2.get();
    console.log("✅ Index 2 is OK");
  } catch (err) {
    console.error("❌ Index 2 Error:", err.message);
  }

  console.log("\nChecking index 3: ai_analysis_log (league, dateFrom, dateTo)...");
  try {
    const q3 = db.collection('ai_analysis_log')
      .where('league', '==', 'England - Virtual')
      .where('dateFrom', '>=', '2020-01-01')
      .orderBy('dateFrom', 'desc')
      .limit(1);
    await q3.get();
    console.log("✅ Index 3 is OK");
  } catch (err) {
    console.error("❌ Index 3 Error:", err.message);
  }
  
  process.exit(0);
}

checkIndexes();
