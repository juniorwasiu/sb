# vFootball Terminal — Runbook

> How to start, stop, restart, and troubleshoot the app.

---

## Architecture Overview

```
live-sports-dashboard/
├── server/          → Node.js + Express API (port 3001)
│   ├── index.js     → Main server entry point
│   ├── scraper.js   → Live odds scraper (Puppeteer, 5s poll)
│   ├── native_scraper.js  → Real result scraper (liveResult page)
│   ├── firebase_reader.js → Reads Firebase historical data
│   ├── ai_memory.js → AI brain/strategy persistence
│   └── .env         → All API keys live here
└── client/          → React + Vite frontend (port 5173 in dev)
    └── src/
```

Two processes run in parallel:
| Process | Port | Command |
|---|---|---|
| **Express API Server** | `3001` | `npm run dev` (in `/server`) |
| **Vite Dev Frontend** | `5173` | `npm run dev` (in `/client`) |

---

## 1. First-Time Setup

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

> ⚠️ Make sure `server/.env` exists with all required keys (see Section 6).

---

## 2. Running the App (Dev Mode)

Open **two separate terminals**:

### Terminal 1 — Start the API Server
```bash
cd "live-sports-dashboard/server" 
npm run dev
```
Expected output:
```
[Server] ✅ Express server running on port 3001
[Server] 🚀 Firebase Admin SDK initialized
[Live Scraper] 🚀 Launching fresh Chrome instance...
[Live Scraper] Navigating to vFootball live odds page...
```
> The live scraper auto-starts with the server. Chrome launches in headless mode.
> It can take **15–45 seconds** for the first match data to appear.

### Terminal 2 — Start the Frontend
```bash
cd "live-sports-dashboard/client"
npm run dev
```
Expected output:
```
  VITE v8.x  ready in 300ms
  ➜  Local:   http://localhost:5173/
```

Then open: **http://localhost:5173**

---

## 3. Restarting the Server

### Quick restart (nodemon handles it automatically)
`nodemon` watches for `.js` file changes and restarts the server automatically.
Just save any file in `server/` — the server restarts within 1–2 seconds.

### Manual restart
In Terminal 1, press `Ctrl+C` to stop, then:
```bash
npm run dev
```

### Hard restart (clear all in-memory state)
```bash
Ctrl+C
# Wait 2 seconds
npm run dev
```
> This clears the in-memory history store and resets the scraper. All Firebase data is preserved.

---

## 4. Restarting the Live Scraper (Without Restarting the Server)

From the **UI** (recommended):
- Open the Live Odds tab → click **⚡ Reload Scraper** button

From the **API**:
```bash
curl -X POST http://localhost:3001/api/scraper/reload
```

> This gracefully closes Chrome and restarts it without touching the Express server or Firebase connections.

---

## 5. Running the Native Results Scraper (Manual)

The native scraper fetches **real completed match scores** from the SportyBet results page.
Run it manually when you want to populate Firebase with today's results:

```bash
cd server
node test_native_scraper.js
```

Expected output:
```
=== vFootball Multi-League Native Extractor ===
[Navigation] Loading liveResult...
[Phase 2] Selecting vFootball Sport
[Phase 3] Processing League: England
✅ Saved 25 matches to native_extract_england_p1.json
[Pagination] Clicking Next...
...
=== ALL LEAGUES COMPLETE ===
```

> Results are saved as JSON files in the `server/` directory.
> Upload them to Firebase via the **Admin Panel → Upload Results** in the UI.

---

## 6. Environment Variables

All keys live in `server/.env`. The file must exist before starting the server.

```env
# Google Gemini (screenshot OCR + AI extraction)
# Keys auto-rotate — add multiple for higher quota
GEMINI_API_KEY=AIza...
GEMINI_API_KEY_FRIEND1=AIza...    # optional extra key
GEMINI_API_KEY_FRIEND2=AIza...    # optional extra key

# Anthropic Claude (alternative screenshot extractor)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI GPT-4o (alternative screenshot extractor)
OPENAI_API_KEY=sk-...

# DeepSeek (AI analysis / daily tips)
DEEPSEEK_API_KEY=sk-...
```

> Firebase credentials are read from `server/firebase-service-account.json` (not in `.env`).

---

## 7. Production Build

To serve everything from the Express server on port 3001 (no Vite needed):

```bash
cd server
npm run build
```

This runs:
1. `cd ../client && npm install && npm run build`
2. Copies the built `dist/` into `server/public/`

Then start production:
```bash
npm start        # runs: node index.js
```

Open: **http://localhost:3001**

---

## 8. Ports Quick Reference

| Service | Port | URL |
|---|---|---|
| Express API | 3001 | http://localhost:3001 |
| Vite Frontend (dev) | 5173 | http://localhost:5173 |
| Production (built) | 3001 | http://localhost:3001 |

> In dev mode, Vite proxies all `/api/*` calls to `localhost:3001` automatically (configured in `client/vite.config.js`).

---

## 9. Changing the AI Provider

Edit `server/ai_config.json`:
```json
{
  "provider": "gemini",          // "gemini" | "claude" | "openai"
  "geminiModel": "gemini-2.5-flash",
  "claudeModel": "claude-sonnet-4-6",
  "openaiModel": "gpt-4o"
}
```
Save the file — nodemon restarts the server automatically. No code changes needed.

---

## 10. Common Problems & Fixes

### ❌ "Chrome not found" / Scraper won't launch
```bash
# Check if Chromium is installed
which chromium-browser || which google-chrome || which chromium

# Install if missing (Ubuntu/Debian)
sudo apt install chromium-browser -y
```
Or set a custom path in `server/.env`:
```env
CHROME_EXECUTABLE_PATH=/usr/bin/chromium
```

### ❌ "Firebase: no app initialized" / Firebase errors
- Check `server/firebase-service-account.json` exists
- Verify the file has valid JSON (not an empty object)

### ❌ Port 3001 already in use
```bash
# Find the process using port 3001
lsof -ti tcp:3001 | xargs kill -9
# Then restart
npm run dev
```

### ❌ Port 5173 already in use
```bash
lsof -ti tcp:5173 | xargs kill -9
npm run dev
```

### ❌ Live scraper shows "no matches" for a long time
1. Wait 30–60s — SportyBet's WAF slows initial page load
2. Click **⚡ Reload Scraper** in the UI
3. Check Terminal 1 logs for `[Live Scraper]` lines
4. If Chrome crashed: restart the server (`Ctrl+C` → `npm run dev`)

### ❌ AI predictions not appearing
- The AI auto-fires every **3 minutes** — wait or click **🤖 Force Make Analysis**
- Check Terminal 1 for `[DeepSeek]` or `[Gemini]` log lines
- Verify `DEEPSEEK_API_KEY` in `.env` is valid

### ❌ "No historical form data" in predictions
- Run `node test_native_scraper.js` to fetch today's results
- Upload the JSON output via Admin Panel
- Firebase must have match history for `computeTeamForm()` to return data

---

## 11. Logs to Watch

All important events are logged to the server terminal with prefixes:

| Prefix | Meaning |
|---|---|
| `[DEBUG] [Live Scraper]` | Scraper polling / Chrome events |
| `[DEBUG] [analyze]` | Daily tips AI analysis pipeline |
| `[DEBUG] [predict-live]` | Single match AI prediction |
| `[Firebase Reader]` | Form / H2H / venue stats computation |
| `[Native Scraper]` | Real result scraper activity |
| `[Firebase Index Debug/Error Details]` | Firebase errors (check for index URLs) |
| `[AI Stream]` | SSE push to frontend |

### Enable Node.js debugger
```bash
npm run debug               # attaches inspector on port 9229
# or
npm run debug-brk           # pauses on first line (for breakpoints)
```
Then open `chrome://inspect` in Chrome → click **Inspect** under Remote Target.

---

## 12. Full Reset (Nuclear Option)

Clears all in-memory state and restarts everything cleanly:

```bash
# Terminal 1
cd server
Ctrl+C
pkill -f "node index.js" 2>/dev/null   # kill any orphan processes
rm -f /tmp/sportybet_scraper_profile -rf  # clear old Chrome profile
npm run dev

# Terminal 2
cd client
Ctrl+C
npm run dev
```
