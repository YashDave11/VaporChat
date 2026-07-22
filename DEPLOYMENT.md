# Deploying Vapor

This guide takes the Vapor repository from clone to a live, public deployment.
Follow it top to bottom; every command and value is specific to this repo.

---

## 1. Overview

Vapor ships as **two independently deployed pieces** from **one repository**:

| Piece        | Hosts                         | Platform            | Talks over            |
| ------------ | ----------------------------- | ------------------- | --------------------- |
| **Frontend** | React SPA (`src/`, `index.html`) | **Vercel** (static) | HTTPS + WSS to backend |
| **Backend**  | Socket.IO + Express (`server/`)  | **Render** Web Service | WebSocket / HTTP     |

- The frontend is a static Vite build served by Vercel's CDN.
- The backend is a long-running Node process on Render that owns **all** real-time
  traffic (stranger matching, rooms, presence, invites). There is no database —
  everything is in-memory and ephemeral by design.
- The frontend reaches the backend using the build-time variable `VITE_API_URL`.
- Routing is **hash-based** (`#/chat`, `#/join/<token>`), so no server-side
  rewrites or redirects are needed on Vercel.

```
Browser ──HTTPS──▶ Vercel (static SPA)
   │
   └──────WSS / Socket.IO──────▶ Render (vapor-backend)  ──▶ /health
```

---

## 2. Prerequisites

- A **GitHub** repository containing this code (both platforms deploy from Git).
- A **Vercel** account — https://vercel.com
- A **Render** account — https://render.com
- **Node 20+** locally if you want to test the production build (`node --version`).
- No domain is required to launch — you can ship on the free
  `*.vercel.app` and `*.onrender.com` subdomains. A custom domain is optional
  (see §7).

Repo readiness (already done in this repo, listed so you can verify):

- `package.json` has a `start` script and `tsx` in **dependencies** (so the
  backend runs under `NODE_ENV=production`).
- `.env.example` documents every variable.
- Backend binds to `process.env.PORT`, has a `/health` endpoint, and reads CORS
  from `CORS_ORIGIN`.
- Frontend reads the backend URL from `VITE_API_URL`.

---

## 3. Project structure

```
Vapor_Chat/
├── index.html            # SPA entry (Vercel build input)
├── src/                  # React frontend
│   └── chat/socket.ts    # ← reads VITE_API_URL to reach the backend
├── public/               # static assets: favicons, site.webmanifest
├── server/               # backend (run with tsx, no compile step)
│   ├── index.ts          # ← entry: PORT, CORS, helmet, /health, Socket.IO
│   ├── handlers.ts       # socket event logic, validation, rate limiting
│   └── rooms.ts          # in-memory room/session state
├── shared/protocol.ts    # wire types shared by both sides
├── vite.config.ts        # frontend build + dev proxy to :3001
├── render.yaml           # optional Render blueprint for the backend
├── .env.example          # canonical list of env vars
└── dist/                 # frontend build output (generated, git-ignored)
```

**Files that matter for deployment:** `package.json` (scripts/deps),
`vite.config.ts`, `server/index.ts`, `src/chat/socket.ts`, `render.yaml`,
`.env.example`.

---

## 4. Environment variables

### Backend (set in **Render → Environment**)

| Variable      | Required | Secret? | Purpose                                                                 | Example                                   |
| ------------- | -------- | ------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `PORT`        | No¹      | No      | Port to bind. **Render injects this automatically — do not set it.**    | `10000` (Render-assigned)                 |
| `NODE_ENV`    | Yes      | No      | Enables HSTS, CSP, trust-proxy, and quiet error logs.                   | `production`                              |
| `CORS_ORIGIN` | Yes      | No      | Frontend origin(s) allowed to open a socket. Comma-separate for many.   | `https://vapor.vercel.app`                |

¹ The server falls back to `3001` locally if `PORT` is unset.

### Frontend (set in **Vercel → Settings → Environment Variables**)

| Variable       | Required | Secret? | Purpose                                              | Example                        |
| -------------- | -------- | ------- | --------------------------------------------------- | ------------------------------ |
| `VITE_API_URL` | Yes      | **No**² | Public backend origin the client opens sockets to.  | `https://vapor-backend.onrender.com` |

² `VITE_`-prefixed vars are **embedded into the client bundle at build time** and
are visible to anyone. This is just the public backend address — never put a
secret in a `VITE_` variable.

> **Order of operations:** deploy the backend first (§5) so you know its URL,
> then set `VITE_API_URL` on Vercel and deploy the frontend (§6). Finally, come
> back and set `CORS_ORIGIN` on Render to the Vercel URL.

---

## 5. Backend deployment (Render)

You can use the **dashboard** (recommended, below) or the included
`render.yaml` blueprint (New → Blueprint → pick the repo).

### Dashboard steps

1. **New → Web Service**, then connect your GitHub repo.
2. **Root Directory:** leave blank (the backend lives at the repo root; there is
   no subfolder).
3. **Runtime:** Node.
4. **Build Command:**
   ```
   npm install
   ```
5. **Start Command:**
   ```
   npm start
   ```
   (This runs `tsx server/index.ts`. `tsx` is a runtime dependency, so it
   survives `NODE_ENV=production` pruning.)
6. **Instance type:** Free is fine to start.
7. **Environment variables** (Advanced → Add):
   - `NODE_ENV = production`
   - `CORS_ORIGIN =` *(leave as a placeholder for now, e.g. `https://example.com`;
     you'll set the real Vercel URL in §6 after the frontend exists)*
   - **Do not** add `PORT` — Render provides it.
8. **Health Check Path:** `/health`
9. Click **Create Web Service** and wait for the first deploy.

### Verify the backend

- The deploy log should show:
  ```
  [vapor] listening on :10000 — in-memory only, no history
  [vapor] env=production  cors=...
  ```
- Open `https://<your-service>.onrender.com/health` → must return
  `{"ok":true}`.
- **Copy the backend URL** (e.g. `https://vapor-backend.onrender.com`). This is
  your `VITE_API_URL`. Socket.IO uses this same origin — the client upgrades to
  `wss://` automatically.

> On Render's free tier the service sleeps after inactivity; the first request
> after idle takes ~30s to wake. This is expected.

---

## 6. Frontend deployment (Vercel)

1. **Add New → Project**, import the same GitHub repo.
2. **Root Directory:** leave as repo root (`./`).
3. **Framework Preset:** Vercel auto-detects **Vite**. Confirm:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. **Environment Variables:**
   - `VITE_API_URL = https://<your-service>.onrender.com` (the URL from §5)
5. Click **Deploy** and wait for the build.
6. **Copy the Vercel URL** (e.g. `https://vapor.vercel.app`).
7. **Wire CORS back to the backend:** go to **Render → your service →
   Environment**, set `CORS_ORIGIN` to the exact Vercel origin
   (`https://vapor.vercel.app`), and save. Render redeploys automatically.
8. **Redeploy the frontend only if you change `VITE_API_URL`** — because it's
   baked in at build time, env changes require a fresh build. Setting
   `CORS_ORIGIN` on the backend does **not** require a frontend rebuild.

### Verify the frontend

- Open the Vercel URL. The landing page loads with its favicon.
- Enter the chat — the browser should open a socket to the Render backend with
  no CORS error in the console.

---

## 7. Domain / URL setup

Free subdomains work out of the box. If you use a custom domain, the clean
split is:

| Role     | Suggested host            | Points to |
| -------- | ------------------------- | --------- |
| Frontend | `vapor.chat` (app)        | Vercel    |
| Backend  | `api.vapor.chat`          | Render    |

Then set:

- Vercel: `VITE_API_URL = https://api.vapor.chat` → **redeploy frontend**.
- Render: `CORS_ORIGIN = https://vapor.chat` (add `https://www.vapor.chat` too
  if you serve `www`).

Socket URL is derived entirely from `VITE_API_URL` — there is nothing else to
configure. Always use `https://` (not `ws://`/`wss://`) as the value;
Socket.IO negotiates the WebSocket upgrade to `wss://` itself. Because both
sides are HTTPS, there is no mixed-content risk.

---

## 8. Post-deployment verification checklist

Run through this on the live Vercel URL:

- [ ] Frontend loads over HTTPS.
- [ ] Favicon and tab title (“Vapor — Talk. Then it's gone.”) appear.
- [ ] `GET https://<backend>/health` returns `{"ok":true}`.
- [ ] Entering chat opens a socket (Network tab → `socket.io`, status 101).
- [ ] **Stranger chat:** two tabs can match and message each other.
- [ ] **Private 1v1:** create → share key/link → second tab joins by key.
- [ ] **Public group room:** appears in the lobby, others can join.
- [ ] **Private group room:** join by invite link and by key.
- [ ] **Invite links:** copy a `#/join/<token>` link, open in a new tab — it
      resolves to the doorstep and joins.
- [ ] **Leave / vaporize:** leaving a 1v1 ends it for both; leaving a group
      only removes you; the last leaver cleans up the room.
- [ ] No request in the Network tab points at `localhost`.
- [ ] Browser console is free of CORS / connection errors.
- [ ] Render logs show `env=production` and the correct `cors=` origin.

---

## 9. Troubleshooting

**Frontend still calls `localhost`**
`VITE_API_URL` was missing or empty at build time (the client falls back to
same-origin, which is Vercel — wrong). Set it in Vercel and **redeploy** (env is
baked in at build, not runtime).

**CORS error in console**
`CORS_ORIGIN` on Render doesn't exactly match the frontend origin. It must be
the scheme + host with no trailing slash (`https://vapor.vercel.app`). Add every
origin you serve, comma-separated. Save and let Render redeploy.

**WebSocket connection fails / socket won't connect**
1. Confirm `/health` returns `{"ok":true}` — if not, the backend is down.
2. Confirm `VITE_API_URL` points at the backend origin (no `/socket.io` suffix,
   no trailing slash).
3. Check Render logs for the `cors=` line — if it says `same-origin only`,
   `CORS_ORIGIN` isn't set.

**Mixed content / `ws` vs `wss`**
Set `VITE_API_URL` to an `https://` URL, never `http://` or `ws://`. Socket.IO
upgrades to `wss://` on its own. An `http://` value on an HTTPS page is blocked
by the browser.

**Invite links broken in production**
Links are `https://<frontend>/#/join/<token>`. They only work while the room is
alive (rooms are in-memory and vaporize when empty). A “dead link” screen means
the room already ended — that's expected behavior, not a deploy bug. Confirm the
link's origin is the Vercel URL, not `localhost`.

**Favicon not updating**
Assets are cache-busted with `?v=6` in `index.html`. If you replace an icon,
bump that query (`?v=7`) or hard-reload. Vercel's CDN also caches — a redeploy
purges it.

**Wrong env vars**
`VITE_*` = frontend/Vercel only, public, baked at build. `PORT` / `NODE_ENV` /
`CORS_ORIGIN` = backend/Render only. Putting a `VITE_` var on Render, or
`CORS_ORIGIN` on Vercel, has no effect.

**Health endpoint failing**
If `/health` 404s or times out: the Start Command isn't `npm start`, or the
build failed (check that `tsx` resolved — it must be under `dependencies`, which
it is in this repo). Render's Health Check Path must be exactly `/health`.

**Render deploy succeeds but the socket doesn't connect**
The backend is up (health OK) but rejecting the socket — this is almost always
CORS. Set `CORS_ORIGIN` to the exact Vercel origin and redeploy the backend.
Also verify the frontend was rebuilt after `VITE_API_URL` was set.

---

## 10. Launch checklist

- [ ] Backend live on Render, `/health` returns `{"ok":true}`.
- [ ] `NODE_ENV=production` and `CORS_ORIGIN=<frontend origin>` set on Render.
- [ ] Frontend live on Vercel, built with `VITE_API_URL=<backend origin>`.
- [ ] Production URLs correct on both sides (no `localhost`, no trailing slashes).
- [ ] Smoke test complete: stranger, private 1v1, public group, private group,
      invite link, and leave/vaporize all work end-to-end.
- [ ] Console and Render logs clean.
- [ ] Ready to share the Vercel URL publicly.
