# Deploying to Vercel

This application is fully optimized for zero-configuration deployment on [Vercel](https://vercel.com).

---

## 1. Quick Deploy to Vercel

1. Log into your **Vercel Dashboard** and click **Add New Project**.
2. Select and import the repository: `juniorwasiu/sb`.
3. **Framework Preset**: Vercel will automatically detect **Vite**.
4. **Root Directory**:
   - You can leave it as `./` (default) — root `vercel.json` and `package.json` are pre-configured.
   - Or you can select `client` — a dedicated `client/vercel.json` is also provided.
5. Click **Deploy**.

---

## 2. Connecting the Frontend to Your Backend (`VITE_API_URL`)

The frontend is a static React application hosted globally on Vercel's Edge Network. The backend API server (which runs the live scrapers, background predictors, and Puppeteer) typically runs on **Coolify**, **Railway**, **Render**, or a VPS.

To connect your Vercel frontend to your deployed backend:

1. In your Vercel project, go to **Settings** → **Environment Variables**.
2. Add the variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://your-backend-domain.com` (e.g., `https://live-sports-backend.up.railway.app` or your Coolify server domain).
3. Check all environments: **Production**, **Preview**, **Development**.
4. Click **Save** and trigger a **Redeploy** so Vite injects the environment variable during build.

> **Note**: If `VITE_API_URL` is omitted, the frontend defaults to relative paths (`/api/...`). When running locally with `npm run dev`, Vite automatically proxies `/api` calls to `http://127.0.0.1:3001`.

---

## 3. What Was Pre-Configured for Vercel

- **Root `package.json`**: Provides standard `build` scripts recognized by Vercel's build pipeline.
- **Root `vercel.json` & `client/vercel.json`**:
  - Sets Vite build command and output directory (`client/dist`).
  - Implements Single Page Application (SPA) catch-all rewrite (`/(.*) -> /index.html`), preventing `404: NOT_FOUND` errors when refreshing routes or navigating directly.
- **Global API Interceptor (`client/src/apiConfig.js`)**:
  - Automatically prepends `VITE_API_URL` to all `window.fetch('/api/...')` requests and Server-Sent Event (`EventSource('/api/live-stream')`) connections across all components without needing manual changes.
  - Gracefully alerts developers in the browser console if deployed on Vercel without a configured `VITE_API_URL`.
- **CORS Compatibility**: The Express server has `cors()` pre-enabled to seamlessly accept requests from `*.vercel.app` domains.
