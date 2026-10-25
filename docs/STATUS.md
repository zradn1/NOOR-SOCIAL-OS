# Status

What works today, what's simulated, what's a placeholder, and what's blocked on
outside setup. "Verified" means covered by automated tests against a real
PostgreSQL database and/or exercised end to end in a browser against the local
stack (system Postgres + Supabase schema shim + test-only auth emulator). Nothing
here has been run against a hosted Supabase project, live Stripe, live Anthropic,
or any social platform API.

## Implemented

| Area | Notes |
| --- | --- |
| Authentication | Email + password sign-up, sign-in, sign-out, password recovery, email-link confirmation (`/auth/confirm`, token-hash and PKCE). Verified with the auth emulator. |
| Sessions | Server-verified JWT on every request, HttpOnly cookies, suspension and deletion checked per request. |
| Organizations and workspaces | Create, rename, delete; brand and client workspaces; workspace switching; last-used workspace. |
| Roles and access | Owner / Admin / Editor / Analyst / Viewer, explicit workspace assignment, invitations by one-time link, client guests. Enforced in RLS and services. |
| Row Level Security | Every table; security-definer helpers with empty `search_path`; append-only audit log; immutable demo flags. |
| Social accounts | Manual tracking (no credentials), demo accounts, disconnect with token wipe and revocation where supported. OAuth start/callback with hashed single-use state and PKCE, encrypted token storage, refresh scheduling. |
| Content Studio | Drafts, captions, hashtags, first comment, link, media by URL, per-platform overrides, live validation against platform rules, duplicate, archive, delete, optimistic concurrency. |
| Media uploads | Signed direct uploads to Supabase Storage with type and size checks. **Not verified** against a real Storage bucket here. |
| Calendar | Month and week views, planned dates and schedules, filters, drag-free reschedule dialog, time zones. |
| Publishing pipeline | Queue, idempotency keys, `SKIP LOCKED` claiming, retries with backoff and jitter, blocked and failed states, manual retry, stale-lock recovery as "outcome unknown", worker process and cron endpoint, heartbeats. |
| Analytics | Dashboard and explorer, range and platform filters, provenance and freshness labels, metric availability per platform, CSV import into manually tracked accounts (plan-gated). |
| AI assistant | Ideas, captions, hooks, hashtags, campaigns, adaptation; history; start a post from a result; quota and rate limits. Claude provider contract-tested against a local stand-in API. **Not run** against the live API (no key here). |
| Billing | Plans, usage meters, server-side limits and features, Stripe Checkout and portal, verified webhooks with idempotent ordered application. Webhook verification tested with SDK-signed payloads. **Checkout and portal not run** against Stripe here. |
| Admin panel | Overview, health, configuration presence, integrations, organizations (manual plans), users (suspend/restore), failed jobs, audit log. |
| Security | CSP and security headers, rate limits, audit logging, encrypted tokens, signed webhooks, input validation (Zod). |

## Demo (simulated, clearly labelled)

- Demo workspaces: one per organization, banner on every page, excluded from
  plan limits and usage.
- Demo social accounts for every platform, with synthetic but internally
  consistent metrics (labelled "Demo data").
- Demo publishing: jobs end as **Simulated**, never Published.
- AI demo provider: template output labelled "Demo · no AI model".

## Placeholders

- **All seven platform adapters** (Instagram, TikTok, Facebook, YouTube,
  LinkedIn, X, Pinterest). They report "not implemented" and throw from every
  network method; jobs for real accounts end **Blocked** with a clear reason.
  The surrounding OAuth, token, publishing, and analytics machinery is built
  and tested with a test-only fake provider. See [INTEGRATIONS.md](./INTEGRATIONS.md).
- **Analytics provider sync**: the ingestion path is shared with CSV import and
  ready for adapters.
- **Email delivery for invitations**: links are copied and shared by hand.
  Supabase sends auth emails (confirmation, recovery) itself.

## Blocked on outside setup

| Needs | For |
| --- | --- |
| Hosted Supabase project (Auth, Postgres via transaction pooler, Storage) | Production |
| Platform developer apps and app reviews (Meta, TikTok audit, Google verification, LinkedIn Community Management API, X API tier, Pinterest Standard access) | Real connections and publishing |
| Stripe account, products and recurring prices, webhook endpoint | Online payments |
| Anthropic API key | AI assistant beyond demo mode |
| Scheduler hitting `/api/cron/publishing`, or a host for `pnpm worker` | Running the publishing queue |

## Not built

- Post approval workflows and comments on drafts.
- Analytics export (the `analytics.export` permission exists; no export yet).
- Email or push notifications (in-app notifications only).
- Self-service user account deletion (organizations can be deleted; users can leave).
- Audit log retention job (`app.audit_purge` is ready; nothing schedules it).
- Light theme and UI translations.
- Hashtag or trend research (would need real data sources; nothing is invented).
