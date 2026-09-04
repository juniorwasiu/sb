const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const modulesToTest = [
    // scrapers
    '../scrapers/scraper',
    '../scrapers/result_scraper',
    '../scrapers/screenshot_result_scraper',
    '../scrapers/bulk_result_scraper',
    '../scrapers/upcoming_match_scraper',
    
    // database
    '../database/supabase',
    '../database/db_init',
    '../database/db_reader',
    '../database/db_uploader',
    '../database/db_admin',
    
    // ai
    '../ai/prediction_ai',
    '../ai/ai_memory',
    '../ai/ai_router',
    '../ai/gemini_extractor',
    '../ai/claude_extractor',
    '../ai/openai_extractor',
    
    // analytics
    '../analytics/behaviour_pattern_engine',
    '../analytics/predictions_export',
    '../analytics/match_lifecycle_engine'
];


let failed = 0;
for (const mod of modulesToTest) {
    try {
        require(mod);
        console.log(`✅ Loaded: ${mod}`);
    } catch (e) {
        console.error(`❌ FAILED: ${mod} -> ${e.message}`);
        failed++;
    }
}

if (failed === 0) {
    console.log('\n🎉 ALL ACTIVE CORE MODULES LOADED AND RESOLVED SUCCESSFULLY!');
} else {
    console.error(`\n⚠️ ${failed} module(s) failed to load.`);
    process.exit(1);
}
