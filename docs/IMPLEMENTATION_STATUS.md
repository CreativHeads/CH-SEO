# SEO Studio — working model status

The visual shell uses the approved Stitch theme. This build replaces illustrative records with saved client data and adds a server API and database.

## Implemented and locally verified

- Fixed hosted authentication for verified email sessions that omit the optional user-ID header; unknown or inactive members remain blocked.
- Profile editing, user administration, local development role switching, hosted sign-out, working record filters, scoped CSV export, search and notifications.

- Admin-only API configuration with encrypted persistence, masked secrets, credential removal, server-side tests and optimistic edit conflicts.
- Windows launcher, automatic local encryption key creation and `.env` loading.
- WordPress connector from PDF Appendix C, packaged and syntax checked; requires installation and live validation on the client site.

- Invited-user allowlist, owner bootstrap and server-side Admin / SEO Lead / Head / Staff checks.
- Persistent client workspace create/edit/archive; connection test history; encrypted WordPress credentials when a server encryption key is configured.
- Saved keyword metrics, intent, clusters, tracked flags and striking-distance filtering.
- Saved issues, severity, evidence, priority estimates and manual resolution/ignore reasons.
- Fix proposals, before/after review, role-gated approval, optimistic revisions and audit trail.
- Developer tickets, generated developer prompts, change reports and documented human verification.
- Content editor, quality gate, revisions, review, rejection, approval and reset to draft after editing.
- JSON-LD required-field validation, schema review and WordPress schema fix proposal.
- Monthly deficit planning, exact-title duplicate avoidance, Monday–Saturday dates and explicit confirmation.
- Refresh candidate records and linked refresh-content creation.
- AEO question sets and manual observation records with citations.
- Frozen monthly report snapshots, commentary, Admin-only approval and PDF export.
- Provider budgets and cost reservations; blocked/queued/running/completed/failed jobs.
- CSV exports, search, per-client workspace switching, member configuration, activity log.

## Implemented adapters requiring credentials and live verification

Google Search Console and GA4 daily totals, PageSpeed, DataForSEO keyword research, live rank checks, On-Page crawl start and manual polling, ChatGPT/Gemini/Google AI Overview samples, Knowledgebase-backed OpenAI drafting, read-only OpenAI answers, WordPress application-password authentication and connector fixes, approved WordPress draft creation.

No provider account has been connected or tested live in this session. A configured key alone is not proof that its APIs or client permissions work. Paid requests also require a verified maximum per-request cost in server configuration. Unknown-cost failures retain their reservation. External API response changes may require adapter updates during activation.

## Not equivalent to complete PDF production scope

This hosted working model uses Sites sign-in, a server-side membership allowlist and D1, not the brief's Microsoft Entra + Supabase RLS + Next.js/Vercel monorepo. Migration to that stack needs the existing repository and account setup.

The following remain production work: scheduled jobs / retry-backoff runner; Teams delivery and quiet hours; complete 40-type audit catalogue and audit diff reconciliation; GSC page-query snapshots, cannibalisation, site CTR curve and forecasts; competitor Labs and backlink automation; semantic topic deduplication, embedding similarity and automatic content refresh detection; full automatic quality checks; Google AI Mode / Perplexity adapters; automatic 14-day fix-watch alerts, delayed live verification and automatic WordPress publish sync; per-provider reconciliation UI; sitemap submission; automatic low-risk fixes (intentionally disabled); full pilot against a real client.

The working model supports manual confirmation for checks that require human evidence. It must not be represented as having passed the PDF's entire S1–S9 production acceptance suite.

## Scheduling

No external automation has been created. The schedule must only be activated after source access, provider budgets and unattended identity are verified. All dates and reporting boundaries must follow Asia/Kolkata in the production scheduler.

## Access

The owner bootstrap is admin@creativheads.com, configurable by ADMIN_EMAIL. Other visitors need both Site sharing access and an active saved membership. Saving membership does not send an invitation. The local development server is loopback-only and injects a developer owner session; never expose it as production hosting.
