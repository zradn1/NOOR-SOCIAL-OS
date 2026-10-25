# NOOR SOCIAL OS — Architecture

NOOR SOCIAL OS is a multi-tenant social media management platform by Noor Studio Agency.
This document describes how the system is put together and why. Status of each
capability (implemented / demo / placeholder) lives in [`STATUS.md`](./STATUS.md).

## 1. System overview

```
Browser ──► Next.js (App Router, Node runtime)
              │  proxy.ts ─ refreshes the Supabase session cookie, redirects anonymous users
              │  Server Components ─ read data inside <Suspense> (Cache Components)
              │  Server Actions / Route Handlers ─ validate (Zod) → authorize → service
              ▼
          src/server/services/*  ── business logic, permission checks, audit logging
              │
              ├── withUser(claims)  → Postgres transaction as role `authenticated`
              │                        (RLS enforced, auth.uid() = verified user)
              ├── withSystem()      → privileged transaction (jobs, tokens, billing, audit)
              ├── integrations/*    → social provider adapters (placeholders + demo)
              ├── ai/*              → AI provider adapters (Anthropic + demo)
              └── billing/*         → billing provider adapters (Stripe + none)

Supabase Auth ── identity, sessions, password recovery (via @supabase/ssr cookies)
Supabase Postgres ── all application data, RLS on every tenant-owned table
Supabase Storage ── media binaries (metadata in media_assets)
Worker process / cron endpoint ── publishing queue, token refresh, analytics sync
```

## 2. ADR-001: Direct Postgres access with RLS-scoped transactions

**Decision.** Server code reaches Supabase Postgres directly (`pg` + Kysely)
instead of going through PostgREST via `supabase-js`. User-initiated
operations run inside a transaction that switches to the `authenticated` role
and sets `request.jwt.claims` from a **server-verified** Supabase session:

```sql
select set_config('request.jwt.claims', $verified_claims, true),
       set_config('role', 'authenticated', true);
```

PostgREST performs exactly this setup on every request, so every RLS policy
behaves identically whether a row is reached through this server or through the
Supabase REST API.

**Why.**

- RLS stays the source of truth for tenant isolation. It is enforced on every
  user query and is not bypassed by a service-role client.
- Real transactions: multi-step writes (create organization + owner + subscription +
  workspace, schedule a post + create its jobs) are atomic.
- `FOR UPDATE SKIP LOCKED` job claiming for the publishing queue.
- The entire data layer is testable against a real Postgres with real policies.
  Hosted Supabase services are not needed to run the tests.

**Consequences.**

- Production must use the Supabase **transaction pooler** (`DATABASE_URL`,
  port 6543). Settings are transaction-local (`set_config(..., true)`), so they
  are safe under transaction pooling.
- Claims are only ever built from `supabase.auth.getClaims()` output (signature
  verified). The `role` claim is always forced to `authenticated`, never taken
  from input.
- `supabase-js` is still used for Auth (sessions, recovery, admin user
  management) and Storage.

## 3. Multi-tenancy model

```
organization (billing entity: agency, business, or creator)
 ├── organization_members (user, role)
 ├── subscription (plan, status)          — one per organization
 └── workspaces (a brand or client)       — kind: internal | client, is_demo flag
      ├── workspace_members (user, role)  — explicit assignment
      ├── social_accounts ─ oauth_connections (encrypted tokens, system-only)
      ├── content_posts ─ post_platform_targets ─ publishing_jobs
      ├── media_assets
      └── analytics_snapshots
```

### Roles

Roles are hierarchical: `viewer (1) < analyst (2) < editor (3) < admin (4) < owner (5)`.

| Capability | viewer | analyst | editor | admin | owner |
| --- | :-: | :-: | :-: | :-: | :-: |
| View dashboard, content, calendar, analytics, accounts | ✓ | ✓ | ✓ | ✓ | ✓ |
| Import or export analytics, use AI assistant | | ✓ | ✓ | ✓ | ✓ |
| Create, edit, schedule, and retry content; upload media | | | ✓ | ✓ | ✓ |
| Connect or disconnect accounts, manage workspace and members, client workspaces, view billing and audit log | | | | ✓ | ✓ |
| Manage billing, delete organization, manage owners | | | | | ✓ |

**Effective workspace role.**

- An organization `owner` or `admin` has that role in **every** workspace of the organization.
- Every other organization member has **no access** to a workspace until assigned
  through `workspace_members`. Their effective role is the assigned workspace role.
  This is the "explicitly authorized" rule for client workspaces.

The matrix lives in `src/lib/auth/permissions.ts` (UI and server checks). The
same rank comparisons are implemented in SQL (`app.workspace_role_rank()`), so
RLS and the server always agree.

### Platform administrators

Noor Studio operators are recorded in `platform_admins`. No API role can read or
write this table. Membership is granted with `pnpm admin:grant <email>` and
checked server-side for every `/admin` request and action.

## 4. Authentication and protected routes

- Supabase Auth with email and password: sign-up (with email confirmation when the
  project requires it), sign-in, password recovery (`/forgot-password` →
  email → `/auth/confirm` → `/reset-password`), sign-out.
- `src/proxy.ts` refreshes the session cookie and redirects anonymous users away
  from `/app`, `/w/*`, `/onboarding`, and `/admin`. **It is not the security
  boundary.** Every page, Server Action, and Route Handler re-verifies the session
  and permissions through the data access layer (`src/server/auth/*`).
- Workspace context comes from the URL (`/w/[workspace]/…`).
  `requireWorkspaceContext(slug)` loads the workspace **through RLS**. A workspace
  the user cannot access is indistinguishable from one that does not exist (404).
- The last-used workspace is stored in `profiles.default_workspace_id`.

## 5. Data protection layers

1. **Input validation.** Zod schemas for every Server Action, Route Handler, and webhook.
2. **Server authorization.** `assertPermission(ctx, permission)` before any service work.
3. **Row Level Security.** Enabled on every table. Tenant tables use
   `app.*` security-definer helpers (`search_path = ''`) for membership checks.
   System tables (`oauth_connections`, `oauth_states`, `publishing_jobs`,
   `subscriptions`, `usage_records`, `audit_logs`, `billing_events`,
   `rate_limit_buckets`, `platform_admins`) have **no** write grants for
   `authenticated`/`anon`. Some are readable through scoped policies.
4. **State-transition guards.** Triggers stop API roles from setting system-owned
   states (for example, a post can never be set to `published` by a user). A
   check constraint requires `external_post_id` and `published_at` before a
   target can be `published`.
5. **Privileged security-definer functions** for transitions that need atomic
   cross-table writes (`app.create_organization`, `app.schedule_post`,
   `app.accept_invitation`, …). Each verifies `auth.uid()` and role itself.

## 6. Demo mode isolation

Demo mode exists so the product can be explored before platform credentials exist.
It is isolated at the **workspace** level:

- `workspaces.is_demo` is immutable after creation.
- Every tenant-owned row carries `is_demo`. A trigger copies it from the workspace
  on insert and makes it immutable, so it cannot be set by hand.
- Demo workspaces cannot hold OAuth tokens (trigger), cannot hold non-demo
  analytics, and non-demo workspaces cannot hold demo analytics
  (`data_source = 'demo'` iff `is_demo`).
- Demo social accounts have `connection_status = 'demo'` and an
  `external_account_id` prefixed `demo_`. A check constraint enforces both.
- The demo publishing adapter never returns `published`. Jobs end in the
  `simulated` state, labelled "Simulated — nothing was posted".
- Demo workspaces are excluded from plan limits and usage metering.
- The UI shows a persistent demo banner, and every metric shows its data source.

## 7. Social provider integrations

`src/server/integrations/` defines a `SocialProvider` interface:

```ts
interface SocialProvider {
  platform: Platform;
  status(): ProviderStatus;            // configured? implemented? what's missing?
  capabilities: ProviderCapabilities;  // publish types, metrics, refresh, revoke
  buildAuthorizationUrl(input): URL;   // OAuth 2.0 + PKCE
  exchangeCode(input): Promise<TokenSet>;
  refreshToken(input): Promise<TokenSet>;
  revokeToken(input): Promise<void>;
  fetchAccount(input): Promise<ProviderAccount>;
  publish(input): Promise<PublishResult>;
  fetchMetrics(input): Promise<MetricSnapshotInput[]>;
}
```

All seven platform adapters (Instagram, TikTok, Facebook, YouTube, LinkedIn, X,
Pinterest) are **placeholders**. They document the official endpoints and scopes,
report `implemented: false`, and throw `IntegrationNotImplementedError` from every
network method. The surrounding machinery is fully implemented and tested with a
test-only fake provider:

- **OAuth state.** A 256-bit random `state` is stored hashed in `oauth_states`,
  bound to user, workspace, and platform, with a 10-minute expiry and single use.
  It is compared in constant time. PKCE (S256) verifiers are stored encrypted.
- **Token storage.** AES-256-GCM with versioned keys (`TOKEN_ENCRYPTION_KEYS`).
  The social account id is bound as additional authenticated data, so ciphertexts
  cannot be swapped between accounts. Tokens never leave the server.
- **Refresh and revocation.** A refresh job selects connections nearing expiry.
  Disconnect revokes at the provider when supported, wipes ciphertexts, and keeps an
  audit record.

## 8. Content, scheduling, and publishing

- `content_posts` holds caption, hashtags, status, and schedule.
  `post_platform_targets` has one row per destination account, with optional
  per-platform caption overrides and settings. `post_media` links `media_assets`.
- Platform constraints (caption length, hashtag count, media requirements) live
  in `src/lib/platforms/constraints.ts` and run on both client and server.
- Scheduling stores a UTC instant plus the IANA time zone used to choose it.
  The calendar renders in the workspace time zone.
- **Publishing queue.** `app.schedule_post()` creates one `publishing_jobs` row
  per target with a deterministic `idempotency_key` (unique). Workers claim due
  jobs with `FOR UPDATE SKIP LOCKED`, run the adapter, and then:
  - success with provider confirmation → target `published` (requires external id)
  - demo adapter → `simulated`
  - adapter not implemented or not configured → `blocked` (never retried automatically)
  - retryable error → `pending` with exponential backoff and jitter, up to `max_attempts`
  - permanent error or attempts exhausted → `failed`, visible with a manual retry
  - expired lock → `failed` with `outcome_unknown`. It is **not** retried
    automatically, because the provider may have published.
- **Execution.** `pnpm worker` (long-running process) or
  `POST /api/cron/publishing` (bounded batch, `CRON_SECRET`), triggered by
  Vercel Cron, Supabase `pg_cron` + `pg_net`, or another scheduler. Never an
  in-process timer in a web request.

## 9. Analytics ingestion

`analytics_snapshots` stores daily account-level metrics in normalized columns
(followers, impressions, reach, views, likes, comments, shares, saves, clicks,
watch time). `NULL` means *not available*, never zero. Each row records
`data_source`:

- `demo`: synthetic, demo workspaces only
- `manual_import`: uploaded by a user from a platform export (CSV); labelled
  "Imported — not verified by the platform"
- `provider_sync`: fetched from an official API (no adapter implemented yet)

Platform metric definitions and limitations live in `src/lib/platforms/metrics.ts`.
Freshness is derived from `captured_at`.

## 10. AI provider abstraction

`src/server/ai/` defines `AIProvider.generate(task, input)` for captions, hooks,
ideas, hashtags, campaigns, and platform adaptation. The `anthropic` provider is
used when `ANTHROPIC_API_KEY` is set. Otherwise the `demo` provider returns
template-based output marked `isDemo: true`, and the UI says no AI model was
used. Keys are read only in server modules (`import "server-only"`).

## 11. Billing provider abstraction

- Plans (`free`, `starter`, `pro`, `agency`) live in `subscription_plans`, with
  limits mirrored in `src/lib/billing/plans.ts`.
- Limits are enforced server-side (`assertWithinLimit`) before creating
  workspaces, connecting accounts, scheduling posts, adding members, and generating AI output.
- `BillingProvider` has two implementations. `none` is the default: upgrades
  explain that billing is not configured. `stripe` creates Checkout and Portal
  sessions and verifies webhooks with HMAC-SHA256, a timestamp tolerance, and a
  constant-time compare.
- A subscription changes **only** from a verified webhook event. Events are recorded in
  `billing_events` (unique provider event id) so replays are no-ops. After
  checkout the UI shows "Awaiting confirmation from the payment provider", never
  "Payment succeeded".

## 12. Audit logging

`audit_logs` is append-only (a trigger rejects `UPDATE`/`DELETE`). It is written
through the system connection by `recordAudit()` for administrative actions:
membership and role changes, invitations, account connect and disconnect, billing
changes, publishing retries, demo workspace creation, and every platform-admin
action. Organization owners and admins can read their organization's entries.

## 13. Rate limiting

`app.rate_limit_hit(key, window, max)` implements a fixed-window counter in
Postgres, so it works across serverless instances without extra infrastructure.
It is applied to sign-in, sign-up, password recovery, OAuth start, AI generation,
invitations, and the cron and webhook endpoints. Keys use an HMAC of the IP
address (`IP_HASH_SECRET`) and never the raw IP.

## 14. Source layout

```
src/
  app/                 routes (marketing, auth, onboarding, /w/[workspace]/…, /admin, /api)
  components/ui/       design system primitives
  components/shell/    application shell
  components/…         shared feature components
  features/<domain>/   client components per product area
  lib/                 client-safe shared code (platforms, permissions, plans, validation, time)
  server/              server-only code
    auth/ db/ services/ integrations/ publishing/ analytics/ ai/ billing/ security/ observability/
supabase/migrations/   SQL migrations (source of truth for the schema and RLS)
tooling/               local database shim, test-only auth emulator
tests/                 unit, database (RLS), and integration suites
e2e/                   Playwright end-to-end tests
scripts/               worker, admin grant, database utilities
```
