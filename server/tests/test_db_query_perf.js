require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabaseClient, withTimeout } = require('../database/supabase');

async function testQueryPerformance() {
    console.log('Testing Supabase query performance over 520k table...');
    
    // Test 1: Order by id DESC (Primary Key Index)
    const t1 = Date.now();
    try {
        const { data, error } = await supabaseClient
            .from('vfootball_results')
            .select('id, time, date, game_id, home_team, away_team, score, league')
            .order('id', { ascending: false })
            .limit(200);
        console.log(`[TEST 1] Order by ID DESC returned ${data?.length || 0} rows in ${Date.now() - t1}ms (Error: ${error?.message || 'none'})`);
    } catch (e) {
        console.error(`[TEST 1] Failed in ${Date.now() - t1}ms:`, e.message);
    }

    // Test 2: Filter by today's date
    const t2 = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    try {
        const { data, error } = await supabaseClient
            .from('vfootball_results')
            .select('id, time, date, game_id, home_team, away_team, score, league')
            .eq('date', today)
            .order('id', { ascending: false })
            .limit(200);
        console.log(`[TEST 2] Filter by date (${today}) returned ${data?.length || 0} rows in ${Date.now() - t2}ms (Error: ${error?.message || 'none'})`);
    } catch (e) {
        console.error(`[TEST 2] Failed in ${Date.now() - t2}ms:`, e.message);
    }

    process.exit(0);
}

testQueryPerformance();
