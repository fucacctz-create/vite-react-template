# AGENTS.md

## Cursor Cloud specific instructions

This is a **Vite + React + Hono + Cloudflare Workers** project. See `README.md` for standard commands (`npm run dev`, `npm run build`, `npm run lint`, etc.).

### Key services

| Service | Command | URL | Notes |
|---|---|---|---|
| Dev server (frontend + API) | `npm run dev` | `http://localhost:5173` | Runs Vite with Cloudflare Workers local runtime via `@cloudflare/vite-plugin`. Single command serves both React SPA and Hono API routes. |

### Non-obvious notes

- The `@cloudflare/vite-plugin` emulates the Cloudflare Workers runtime locally — no Cloudflare account or `wrangler` login is needed for local development.
- The API routes (e.g. `GET /api/`) are served by Hono through the same dev server; no separate backend process is required.
- `npm run build` runs `tsc -b && vite build` and outputs to `dist/`. The Worker bundle goes to `dist/vite_react_template/` and client assets to `dist/client/`.
- No tests are configured in the repo yet (no test framework or test scripts in `package.json`).
- No Docker, databases, or external services are needed for local development.
- The `punycode` deprecation warning on `npm run dev` is harmless (comes from Node.js internals, not project code).
