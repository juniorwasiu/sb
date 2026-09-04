# Bulk Historical Scraper — README

> **File:** `server/bulk_history_scraper.js`  
> **Purpose:** Scrapes 3 years of SportyBet vFootball results (all leagues, all pages per day) and stores them in Supabase. Loops until every day/league is confirmed fully captured.

---

## Quick Start

```bash
# 1. Navigate to the server directory
cd ~/development/sb/"mango browser extension"/live-sports-dashboard/server

# 2. Run the scraper
node bulk_history_scraper.js
```

That's it. The scraper will:
- Work from **today backwards 3 years**
- Scrape all 5 leagues per day (England, Spain, Italy, Germany, France)
- Scrape up to 4 pages per league per day
- Save everything to Supabase automatically
- Loop until all days are confirmed complete

---

## Stopping & Resuming

You can **CTRL+C at any time**. Progress is saved after every `(date × league)` cycle.

To resume after stopping:

```bash
# Just run normally — it automatically picks up where it left off
node bulk_history_scraper.js
```

> **How resume works:**  
> The scraper tracks two separate lists in `bulk_scrape_progress.json`:
> 
> | List | Meaning | Behaviour on resume |
> |---|---|---|
> | `completedDayLeagues` | Fully scraped in this run | Skipped for the rest of this pass |
> | `confirmedDays` | All game_ids were already in DB (permanent) | Skipped permanently, forever |
>
> If you stop mid-page on a day, that day replays from page 1 — safe because Supabase automatically skips duplicate `game_id`s.

---

## All Run Commands

```bash
# Full run (3 years, all leagues)
node bulk_history_scraper.js

# Resume after stop/crash — skips already-completed days this pass
node bulk_history_scraper.js

# Check current progress without running
node bulk_history_scraper.js --status

# Specific leagues only
node bulk_history_scraper.js --leagues="England,Spain"
node bulk_history_scraper.js --leagues="Italy"

# Custom date range (ISO format YYYY-MM-DD)
node bulk_history_scraper.js --from=2025-01-01 --to=2026-06-26

# Specific leagues AND custom date range
node bulk_history_scraper.js --leagues="England" --from=2024-01-01

# Dry run — scrapes the page but does NOT write to Supabase
node bulk_history_scraper.js --dry-run

# Combine flags
node bulk_history_scraper.js --leagues="England" --from=2025-06-01 --dry-run
```

---

## Check Progress

```bash
# View a summary of confirmed/completed days
node bulk_history_scraper.js --status

# Or inspect the raw JSON directly
cat bulk_scrape_progress.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('Confirmed:', len(d['confirmedDays']))
print('Completed this pass:', len(d.get('completedDayLeagues', {})))
print('Stats:', d['stats'])
"
```

---

## Progress File

The scraper maintains `server/bulk_scrape_progress.json` automatically.

```json
{
  "startedAt": "2026-06-26T11:16:49Z",
  "confirmedDays": {
    "2026-06-25_England": {
      "confirmedAt": "2026-06-26T11:20:00Z",
      "totalMatches": 380,
      "reason": "all-duplicates"
    }
  },
  "completedDayLeagues": {
    "2026-06-24_Spain": {
      "completedAt": "2026-06-26T11:30:00Z",
      "totalMatches": 380,
      "added": 100
    }
  },
  "stats": {
    "totalMatchesSaved": 35416,
    "totalDupes": 26413,
    "passCount": 1
  }
}
```

> ⚠️ **Do not delete this file** while a run is in progress. If deleted, the scraper restarts from scratch (but Supabase deduplication means no data is lost — just time).

---

## How Duplicate Detection Works

The scraper uses `game_id` (SportyBet's numeric match ID) to detect duplicates.

| Scenario | Result |
|---|---|
| New match never seen in DB | → Inserted, `added++` |
| Match already in DB | → Skipped by Supabase upsert, `dupes++` |
| Entire page has 0 new inserts | → Page is all-duplicate |
| ALL pages of a day/league are all-duplicate | → Day marked **confirmed** (permanent skip) |

Once a `(date × league)` is confirmed, it is never scraped again — even across multiple passes or restarts.

---

## Architecture

```
OUTER LOOP  — passes (run until all days confirmed)
  │
  ├─ MIDDLE LOOP — dates (newest → oldest)
  │    │
  │    └─ INNER LOOP — leagues × pages 1–4
  │         │
  │         ├─ Launch Puppeteer (stealth mode)
  │         ├─ Navigate → https://www.sportybet.com/ng/liveResult/
  │         ├─ Select: date → vFootball → league
  │         ├─ Extract DOM: ul.result-event rows
  │         ├─ Save to Supabase (saveMatchesToDb)
  │         ├─ Track: added / dupes
  │         ├─ If all dupes → mark CONFIRMED (permanent)
  │         ├─ If scrape done → mark COMPLETED (this pass)
  │         └─ Save progress to JSON (atomic write)
  │
  └─ If remaining confirmed == 0 → DONE
     Else → start next pass (reset completedDayLeagues)
```

---

## Leagues

| League | SportyBet Tab | DB Name |
|---|---|---|
| England League | England | England - Virtual |
| Spain League | Spain | Spain - Virtual |
| Italy League | Italy | Italy - Virtual |
| Germany League | Germany | Germany - Virtual |
| France League | France | France - Virtual |

---

## Configuration (inside the script)

| Constant | Default | Description |
|---|---|---|
| `MAX_PAGES` | `4` | Max result pages per day/league |
| `MIN_DELAY_MS` | `3000` | Min delay between cycles (WAF protection) |
| `MAX_DELAY_MS` | `8000` | Max delay between cycles |
| `PAGE_HYDRATE_MS` | `4500` | Wait after page navigation |
| `THREE_YEARS_MS` | `3 years` | Default lookback period |

---

## Troubleshooting

### "Could not open date picker dropdown"
SportyBet's DOM may have changed. The calendar selector (`.select-index`) may need updating in `clickDropdownByIndex()`.

### "vFootball option not found in dropdown"
The sport filter may have loaded slowly. Try increasing `PAGE_HYDRATE_MS` in the config section.

### Scraper keeps failing and retrying
Check your internet connection. The scraper retries 3 times with exponential backoff (8s, 16s, 24s). After all retries fail, the day is skipped and logged as an error — it will be retried on the next pass.

### Supabase errors
Check `.env` has valid `SUPABASE_URL` and `SUPABASE_KEY`. Run:
```bash
node -e "require('./supabase'); console.log('Supabase OK')"
```

---

## Dependencies

All installed — no `npm install` needed separately:

- `puppeteer-extra` + `puppeteer-extra-plugin-stealth` — WAF-bypass browser automation
- `@supabase/supabase-js` — database client
- `dotenv` — reads `.env` credentials

---

## Related Files

| File | Purpose |
|---|---|
| `bulk_history_scraper.js` | This scraper |
| `bulk_scrape_progress.json` | Auto-generated progress tracker |
| `native_scraper.js` | Single-date scraper (used by API) |
| `supabase.js` | Supabase client and `saveMatchesToDb()` |
| `run_2026_scrape.js` | Manual one-off runner (legacy) |
