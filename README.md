# CreativHeads SEO Studio — working model

Twelve sections based on the approved Stitch design, with saved client workspaces, server-side permissions, record editing, review workflows and reports.

Start by opening **All Clients → Add Client**. Then configure the workspace, create records and use each section's review actions. Real metrics start empty; the original sample client statistics are not presented as live data.

See `docs/IMPLEMENTATION_STATUS.md` for exact implemented coverage and production work still required. This is a working hosted model, not completion of the PDF's full S1–S9 production rollout.

## Easy Windows setup

Double-click `START_SEO_STUDIO.bat`, then open **API Keys & Connections**. See `LOCAL_SETUP.md` for provider-by-provider steps and WordPress connector installation.

## Local use

Requires Node.js 24 or later.

    npm ci
    npm run build
    npm run dev

Open http://127.0.0.1:8000. The local server stores data in `.local/studio.sqlite` and provides a developer owner session. It binds only to loopback. Do not expose this local development server publicly.

## Tests

    npm test

Backend tests cover permissions, persistence, stale edit conflicts, quality gates, planning, budget reservations and report approval. No live provider credentials are included and external API adapters require integration testing on a real client.

## Structure

- `reference/`: original Stitch exports.
- `build.mjs`: compiles the original per-screen styles.
- `web/`: working UI and record forms.
- `worker/`: authenticated API, workflows, provider adapters and server entry point.
- `db/schema.ts`, `drizzle/`: database schema and immutable generated migrations.
- `scripts/build-working.mjs`: embeds the working screens and bundles the server.
- `.env.example`: required server settings. Copy to a secure local configuration if needed; never commit real values.

Production on Sites uses platform sign-in, a server-side member allowlist and D1. The brief's proposed Next.js / Supabase / Microsoft / Vercel deployment is a separate migration requiring the existing repository and accounts.
