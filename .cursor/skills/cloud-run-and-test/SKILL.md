---
name: cloud-run-and-test
description: Run, verify, and troubleshoot this Vite + React + Hono + Cloudflare Workers repo locally and in CI-style checks. Use for dev setup, API/landing workflows, env vars, and when no automated tests exist yet.
---

# Cloud run and test (this repo)

Minimal runbook for Cloud agents. **Local dev does not require a Cloudflare account or `wrangler login`.** Login is only needed for real deploys (`wrangler deploy`).

## Prerequisites

- **Node.js** with `npm` (use versions compatible with the lockfile).
- **Network** for `npm install` and any API calls that hit Supabase or Resend.

## First-time setup

```bash
cd /path/to/repo
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with real values before testing waitlist writes (see Worker API section).
```

**Secrets file:** Values in `.dev.vars` are loaded for the local Worker runtime (Vite + `@cloudflare/vite-plugin`). The file is gitignored; never commit it.

**There is no in-app user login.** The only “account” concept here is **optional Cloudflare auth for deploy** (`wrangler login` / dashboard) and **Supabase/Resend credentials** in `.dev.vars` for backend features.

---

## By codebase area

### 1) Toolchain and quality gates (whole repo)

**Purpose:** Confirm TypeScript, Vite build, and Worker bundle without deploying.

| Command | What it does |
|--------|----------------|
| `npm run lint` | ESLint across the project |
| `npm run build` | Syncs landing HTML → `public/`, then `tsc -b` + `vite build` |
| `npm run check` | Sync + `tsc` + `vite build` + `wrangler deploy --dry-run` (closest thing to a full CI smoke) |

**Agent workflow:** After substantive edits, run `npm run lint` and at least `npm run build` or `npm run check` before considering the task done.

**Note:** `playwright` is listed in `package.json` but there is **no configured Playwright test suite** in this repo yet—do not assume `npx playwright test` will do anything useful until tests exist.

---

### 2) Dev server (frontend + Worker together)

**Start:**

```bash
npm run dev
```

- **URL:** `http://localhost:5173` (Vite default unless overridden).
- **What runs:** Single process serves the React app, static assets, and Hono routes on the same origin (Cloudflare Vite plugin emulates the Worker locally).

**Agent workflow:**

1. Start `npm run dev` (background in agent environments).
2. Hit the shell with `curl -sS http://localhost:5173/api/` and expect JSON like `{ "name": "Cloudflare" }`.
3. Open or `curl` the landing page path below.

**Harmless noise:** A Node `punycode` deprecation warning may appear; project `AGENTS.md` marks it as safe to ignore.

---

### 3) React SPA (`src/react-app/`, `index.html`)

**Behavior today:** The root app **redirects** to the FlatFinder static landing (`/flatfinder-landing.html`). The React tree is minimal.

**Agent workflow:**

1. With dev server up, request `http://localhost:5173/` — you should be redirected (or see a brief “Redirecting…” state).
2. For UI work, prefer verifying **`/flatfinder-landing.html`** unless you are changing the redirect or root shell.

---

### 4) Static FlatFinder landing (`flatfinder-landing.html` → `public/`)

**Source of truth:** Edit **`flatfinder-landing.html`** at the repo root.

**Sync:** `npm run dev` and `npm run build` run `npm run sync:landing`, which copies `flatfinder-landing.html` → `public/flatfinder-landing.html`.

**Agent workflow:**

1. Change the root file, run `npm run dev` or `npm run sync:landing`, then fetch `http://localhost:5173/flatfinder-landing.html`.
2. Confirm the waitlist form still posts to `/api/waitlist` (same origin).

---

### 5) Cloudflare Worker / Hono API (`src/worker/index.ts`)

**Key routes:**

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/` | Simple JSON ping |
| POST | `/api/waitlist` | Requires Supabase URL + key in `.dev.vars` for real inserts |
| GET | `/api/waitlist/health` | JSON summary: whether URL/key are set, host, `usingServiceRole`, expected table names |

**Environment variables** (see `.dev.vars.example`): `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`; key via `SUPABASE_SERVICE_ROLE_KEY` (recommended), `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_KEY`, or `SUPABASE_TOKEN`. Optional email: `RESEND_API_KEY`, `FROM_EMAIL`.

**Feature flags:** This app **does not use a feature-flag SDK**. The only “flags” in config are **Worker compatibility flags** in `wrangler.json` (e.g. `nodejs_compat`)—runtime/platform toggles, not product features. To **toggle behavior**, use env vars (e.g. omit `RESEND_API_KEY` to skip email; wrong/missing Supabase config to exercise error paths).

**Agent testing workflows:**

1. **Config smoke (no Supabase required for the route to respond):** `curl -sS http://localhost:5173/api/waitlist/health` — inspect `ok`, `urlConfigured`, `keyConfigured`.
2. **Happy path (needs real Supabase):** `POST /api/waitlist` with JSON body including at least `name` and `email`. Expect `201` and `{ "success": true }` when the table exists and RLS/key are correct.
3. **Error catalog (from README):** Match status/error text to migration/key issues (`waitlist_table_missing`, `waitlist_auth_error`, `waitlist_insert_failed`, or `409` duplicate).

**Deploy-only:** `npm run deploy` uses `wrangler deploy`; that path needs Cloudflare credentials and Worker secrets configured in the dashboard or via Wrangler—not covered by local `.dev.vars` on Workers production unless you mirror them.

---

## Keeping this skill up to date

When you discover a new command, env var, failure mode, or manual test sequence:

1. **Change the code or README first** if the behavior is intentional and should be documented for humans.
2. **Edit this file** (`.cursor/skills/cloud-run-and-test/SKILL.md`): add a row to a table or a short subsection under the right **codebase area**.
3. **Prefer concrete commands** (`curl` one-liners, npm scripts) over prose.
4. **Remove or flag stale notes** (e.g. if Playwright tests are added, document the real `npm`/`npx` entry and where specs live).

This keeps Cloud agents aligned with how the repo actually runs.
