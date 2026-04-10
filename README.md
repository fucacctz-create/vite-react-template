# FlatFinder waitlist app

This repo now contains:
- A working FlatFinder landing page with a modal waitlist form.
- A real `/api/waitlist` backend endpoint in the Cloudflare Worker.
- Supabase storage integration for waitlist submissions.
- Optional confirmation emails through Resend.

## 1) Supabase setup (one-time)

1. Open your Supabase project.
2. Go to SQL Editor.
3. Run `supabase_migration.sql`.
4. If your existing table is named `beta_signups`, this API now supports that too.

## 2) Environment setup (required before form submission works)

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Fill in your real values:
   - `SUPABASE_URL` **or** `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Optional: set `RESEND_API_KEY` + `FROM_EMAIL` for confirmation emails.
4. Health check your config:
   - `GET /api/waitlist/health`
   - It reports whether URL/key are detected and which Supabase host is being used.

## 3) Which page to use

- Use `http://localhost:5173/flatfinder-landing.html` for the FlatFinder landing page experience.
- It is now wired directly to the modal waitlist and `POST /api/waitlist`.

## 4) Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Note: `npm run dev` and `npm run build` automatically sync `flatfinder-landing.html` into `public/` so deploy always includes your latest landing page edits.

## 5) Deploy

Before deploy, add the same secrets in your Cloudflare Worker environment:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (optional) `RESEND_API_KEY`
- (optional) `FROM_EMAIL`

Then deploy:

```bash
npm run deploy
```

## Troubleshooting quick checks

- `500` with `waitlist_table_missing`: Run the SQL migration in Supabase.
- `500` with `waitlist_auth_error`: key is wrong for your table policy; set `SUPABASE_SERVICE_ROLE_KEY`.
- `500` with `waitlist_insert_failed`: check table schema/constraints in Supabase response details.
- `409` with `You're already on the list!`: email uniqueness is enforced globally; each email can sign up once.
