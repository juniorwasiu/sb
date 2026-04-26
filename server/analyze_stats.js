const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./all_pattern_stats.json', 'utf8'));

function analyze(minSamples) {
    const filtered = data.filter(p => p.SampleSize >= minSamples);
    let count60 = 0;
    let count70 = 0;
    let count80 = 0;

    for (const p of filtered) {
        const has60 = p.NextWin_Pct >= 60 || p.NextLoss_Pct >= 60 || p.NextDraw_Pct >= 60 || p.NextOver15_Pct >= 60 || p.NextOver25_Pct >= 60 || p.NextGG_Pct >= 60 || p.NextHomeScore_Pct >= 60 || p.NextAwayScore_Pct >= 60;
        const has70 = p.NextWin_Pct >= 70 || p.NextLoss_Pct >= 70 || p.NextDraw_Pct >= 70 || p.NextOver15_Pct >= 70 || p.NextOver25_Pct >= 70 || p.NextGG_Pct >= 70 || p.NextHomeScore_Pct >= 70 || p.NextAwayScore_Pct >= 70;
        const has80 = p.NextWin_Pct >= 80 || p.NextLoss_Pct >= 80 || p.NextDraw_Pct >= 80 || p.NextOver15_Pct >= 80 || p.NextOver25_Pct >= 80 || p.NextGG_Pct >= 80 || p.NextHomeScore_Pct >= 80 || p.NextAwayScore_Pct >= 80;

        if (has60) count60++;
        if (has70) count70++;
        if (has80) count80++;
    }

    console.log(`\n--- For Sample Size >= ${minSamples} ---`);
    console.log(`Total Patterns: ${filtered.length}`);
    console.log(`Patterns with >= 60% probability: ${count60} (${Math.round((count60/filtered.length)*100)}%)`);
    console.log(`Patterns with >= 70% probability: ${count70} (${Math.round((count70/filtered.length)*100)}%)`);
    console.log(`Patterns with >= 80% probability: ${count80} (${Math.round((count80/filtered.length)*100)}%)`);
}

analyze(20);
analyze(30);
