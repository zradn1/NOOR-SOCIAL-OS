# NOOR SOCIAL OS

**The social media operating system for agencies, businesses, and creators. Powered by Noor Studio Agency.**

One workspace per brand or client to plan, schedule, and measure content across
Instagram, TikTok, Facebook, YouTube, LinkedIn, X, and Pinterest. Every number
says where it came from, and nothing is shown as connected or published without
the platform confirming it.

> **Status:** the product, data model, security model, publishing pipeline,
> billing, and admin tooling are built and tested. **Real platform connections
> and publishing are not**: the seven platform adapters are placeholders
> awaiting developer apps and app reviews. See [docs/STATUS.md](docs/STATUS.md)
> for the full picture.

## Contents

- [What's inside](#whats-inside)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Migrations](#migrations)
- [Authentication setup](#authentication-setup)
- [Demo mode](#demo-mode)
- [Social integrations](#social-integrations)
- [Background worker](#background-worker)
- [Billing](#billing)
- [AI assistant](#ai-assistant)
- [Platform admin](#platform-admin)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)
- [Production-readiness checklist](#production-readiness-checklist)

## What's inside

| Area | Highlights |
| --- | --- |
| Workspaces | Organizations with brand and client workspaces, roles (Owner, Admin, Editor, Analyst, Viewer), invitations, client guests who only see their own workspace |
| Social accounts | Manual tracking for imports, demo accounts, OAuth + PKCE machinery with encrypted token storage (adapters pending) |
| Content Studio | Drafts, captions, hashtags, media, per-platform overrides, live validation against each platform's rules |
| Calendar | Month and week views, planned dates, scheduling in the workspace's time zone |
| Publishing | Durable queue with idempotency keys, retries with backoff, blocked/failed/unknown outcomes, worker or cron |
| Analytics | Dashboard and explorer with provenance and freshness, CSV import, per-platform metric availability |
| AI Assistant | Ideas, captions, hooks, hashtags, campaigns, and adaptations via Claude, or labelled demo templates |
| Billing | Free, Starter, Pro, Agency; usage meters; Stripe Checkout, portal, and verified webhooks |
| Admin | Platform overview, health, organizations, users, failed jobs, audit log |

Stack: Next.js 16 (App Router, Cache Components, Partial Prerendering),
TypeScript, Tailwind CSS 4, Supabase (Auth, Postgres, Storage), Kysely + `pg`,
Zod, Recharts, Radix UI, Framer Motion, Stripe SDK, Anthropic SDK, Vitest,
Playwright.

## Architecture

The short version:

- **All data access runs on the server** against Postgres. User requests run
  inside a transaction as the `authenticated` role with server-verified JWT
  claims, so **Row Level Security** applies to every query, exactly as it would
  through Supabase's API ([ADR-001](docs/ARCHITECTURE.md#2-adr-001-direct-postgres-access-with-rls-scoped-transactions)).
- Supabase is used for Auth and Storage; the browser never holds a Supabase
  session it can read (HttpOnly cookies).
- Privileged work (publishing jobs, tokens, billing, audit) uses a separate
  system connection, reached only after a server-side authorization check.
- Security-definer SQL functions perform multi-table transitions (create an
  organization, schedule a post, accept an invitation) and check the caller's
  role themselves.

Read more: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/SECURITY.md](docs/SECURITY.md), [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md).

```
src/app/           routes: marketing, auth, onboarding, /w/[workspace]/…, /admin, /api
src/components/    design system and app shell
src/features/      client components per product area
src/lib/           client-safe shared code (permissions, platforms, validation, time)
src/server/        server-only code: auth, db, services, integrations, publishing,
                   analytics, ai, billing, security, observability
supabase/          SQL migrations (schema, RLS, functions)
tests/             unit, database (RLS), and integration suites
e2e/               Playwright end-to-end tests
scripts/           worker, dev seed, admin grant
tooling/           local Postgres shim and test-only auth emulator
```

## Local development

Requirements: Node.js 22+, pnpm 10+, and PostgreSQL 16+ (or Docker for the
Supabase CLI).

### Option A: no Docker (fastest)

Uses your local Postgres plus a small Supabase-compatible schema shim and a
**test-only auth emulator**. The emulator refuses to run with
`NODE_ENV=production` and must never be deployed.

```bash
pnpm install
cp .env.example .env.local
```

Fill `.env.local` with local values:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-publishable-key   # any value; the emulator ignores it
SUPABASE_SERVICE_ROLE_KEY=local-service-role-key             # the emulator's default admin key
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/noor_dev
TOKEN_ENCRYPTION_KEYS=v1:<output of: openssl rand -base64 32>
TOKEN_ENCRYPTION_ACTIVE_KEY_ID=v1
IP_HASH_SECRET=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>
```

Then:

```bash
pnpm db:reset          # creates noor_dev: shim + every migration
pnpm db:seed           # demo agency, users, clients, and a demo workspace

# terminal 1
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/noor_dev \
APP_URL=http://localhost:3000 pnpm auth:emulator

# terminal 2
pnpm dev
```

Open http://localhost:3000 and sign in as `amira@noor.test` (owner and platform
admin), `sami@noor.test` (editor), or `lina@riadbotanica.test` (client guest).
The seed prints the shared local password. Emails the emulator "sends" are
written to `.local/auth-emulator-mail.log`.

`pnpm db:reset` expects a superuser at
`postgresql://postgres:postgres@127.0.0.1:5432/postgres`; set
`LOCAL_PG_ADMIN_URL` (and `LOCAL_DB_NAME`) to change that.

### Option B: Supabase CLI

```bash
supabase init            # once; keeps the existing supabase/migrations
supabase start           # local Supabase in Docker
supabase db reset        # applies supabase/migrations
```

Point `.env.local` at the URLs and keys `supabase start` prints, with
`DATABASE_URL` set to its Postgres URL. This path uses real Supabase Auth and
Storage locally. It hasn't been exercised in this repository's CI environment.

## Environment variables

Every variable is listed, with its purpose and default, in
[`.env.example`](.env.example). It contains names only, never values.

| Group | Variables |
| --- | --- |
| App | `NEXT_PUBLIC_APP_URL` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `…_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Database | `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_SSL`, `DATABASE_SSL_CA` |
| Security | `TOKEN_ENCRYPTION_KEYS`, `TOKEN_ENCRYPTION_ACTIVE_KEY_ID`, `IP_HASH_SECRET`, `CRON_SECRET`, `RATE_LIMIT_MULTIPLIER` |
| AI | `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` |
| Billing | `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY` |
| Demo | `DEMO_MODE_ENABLED` |
| Integrations | `INSTAGRAM_*`, `TIKTOK_*`, `FACEBOOK_*`, `GOOGLE_*`, `LINKEDIN_*`, `X_*`, `PINTEREST_*` |
| Worker | `WORKER_POLL_INTERVAL_MS` |

Only `NEXT_PUBLIC_*` values reach the browser. Everything else is read at
runtime by server-only modules, so one build can be deployed to any
environment.

## Supabase setup

1. Create a Supabase project.
2. **Database URL:** use the **transaction pooler** connection string
   (port 6543) for `DATABASE_URL`. Supabase signs its database certificates
   with its own CA, which isn't in Node's trust store: download it from
   Database Settings → SSL Configuration, put the PEM in `DATABASE_SSL_CA`, and
   set `DATABASE_SSL=require`. `DATABASE_SSL=no-verify` encrypts without
   verifying the server; use it only until the CA is in place. TLS parameters
   in the URL (`sslmode` …) are ignored; `DATABASE_SSL` decides.
3. **API keys:** copy the project URL, the publishable key, and the service role
   key (server only) into your environment.
4. **Data API:** under Project Settings → API, remove `public` from the exposed
   schemas. The app talks to Postgres directly; RLS protects the tables either
   way.
5. **Storage:** the `media` bucket and its policies are created by the
   migrations.
6. Apply the [migrations](#migrations), then configure [auth](#authentication-setup).

## Migrations

`supabase/migrations/*.sql` is the source of truth for the schema, RLS policies,
and SQL functions. They run in filename order.

```bash
supabase link --project-ref <ref>
supabase db push
```

Locally, `pnpm db:reset` rebuilds `noor_dev` from scratch, and `pnpm db:migrate`
applies only new files. `pnpm db:types` regenerates
`src/server/db/schema.generated.ts` from a scratch database after a schema
change.

## Authentication setup

In Supabase → Authentication:

- **Site URL:** your `NEXT_PUBLIC_APP_URL`.
- **Redirect URLs:** add `{APP_URL}/auth/confirm`.
- **Email templates:** point links at `/auth/confirm` using the token hash:
  - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
  - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- **SMTP:** configure a real email provider; Supabase's built-in sender is
  rate-limited and meant for testing.
- Email confirmation can be on or off; sign-up handles both.

Suspension (from `/admin/users`) uses the Supabase Auth admin API and takes
effect on the user's next request.

## Demo mode

`DEMO_MODE_ENABLED=true` (default) lets an organization admin create **one demo
workspace** with simulated accounts on every platform, synthetic metrics, and
sample posts. Demo data:

- is flagged `is_demo` in the database, immutably, and can't mix with real data;
- shows a banner on every page and "Demo data" on every number;
- "publishes" as **Simulated**, never Published;
- never counts toward plan limits or usage.

The AI assistant has its own labelled demo mode when no AI key is configured.

## Social integrations

No platform adapter is implemented yet. Real accounts can be tracked manually,
with analytics imported from platform CSV exports, and scheduled posts for them
end **Blocked** with an explanation. The OAuth, token, publishing, and sync
machinery is complete and tested against a fake provider.
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) lists the official APIs, review
requirements, and callback URLs, and explains how to implement an adapter.

## Background worker

Scheduled posts are processed by a queue that needs something to run it. Pick
one:

- **Long-running worker** on any Node host (Fly.io, Railway, Render, a VM):

  ```bash
  pnpm worker      # polls every WORKER_POLL_INTERVAL_MS (default 15 s)
  ```

  Several instances can run at once; jobs are claimed with `FOR UPDATE SKIP LOCKED`.

- **Cron endpoint**, called every minute by Vercel Cron, Supabase `pg_cron` +
  `pg_net`, GitHub Actions, or similar:

  ```
  POST {APP_URL}/api/cron/publishing
  Authorization: Bearer {CRON_SECRET}
  ```

Every run first recovers jobs whose worker died mid-flight (marked "outcome
unknown", never retried blindly), records a heartbeat shown in `/admin`, and
periodically runs maintenance: token refresh, expired OAuth state cleanup, and
rate-limit pruning.

## Billing

Plans live in the `subscription_plans` table: Free, Starter ($19), Pro ($49),
and Agency ($149) per month. Limits and features are enforced on the server and
in SQL.

To enable Stripe:

1. Create a product with a recurring monthly price per paid plan; set
   `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, and `STRIPE_PRICE_AGENCY`.
2. Set `BILLING_PROVIDER=stripe` and `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint at `{APP_URL}/api/webhooks/stripe` subscribed to
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`, and
   `invoice.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Enable the customer portal in Stripe (plan changes, cancellation, payment
   methods).

Plans change **only** when a verified webhook confirms the subscription. After
checkout the billing page shows "Waiting for payment confirmation" until then.
Without Stripe, a platform admin can assign plans manually from `/admin`.

## AI assistant

Set `ANTHROPIC_API_KEY` to use Claude. The default model is `claude-opus-5-5`
at `medium` effort; change it with `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT`.
Requests use structured outputs and Anthropic's server-side fallback for
declined requests. The key is only read on the server.

Without a key (or with `AI_PROVIDER=demo`) the assistant uses templates built
from the user's brief and labels every result "Demo · no AI model". Usage is
limited per plan (`ai_generations_per_month`) and rate-limited per user.

## Platform admin

```bash
pnpm admin:grant someone@example.com            # grant /admin access
pnpm admin:grant someone@example.com --revoke   # remove it
```

The user must have signed up first. Against a non-local database the script
asks for `--yes`. Every grant and every admin action is audited.

## Testing

```bash
pnpm typecheck         # route types + tsc
pnpm lint
pnpm test:unit         # pure logic: permissions, validation, constraints, crypto, CSP, Stripe parsing…
pnpm test:db           # RLS, SQL functions, and services against real Postgres
pnpm build && pnpm test:e2e   # Playwright against the production build
pnpm verify            # typecheck + lint + all Vitest suites + build
```

`test:db` and `test:e2e` need a local Postgres superuser at
`postgres:postgres@127.0.0.1:5432` (override with `LOCAL_PG_ADMIN_URL`). Each
database test clones a fresh, fully migrated template database. The e2e suite
rebuilds `noor_e2e`, starts the auth emulator and `next start`, and runs Stripe
in test mode with fake keys (signatures are verified locally; no network calls).

Coverage includes authentication, authorization and roles, tenant isolation,
workspace switching, client guests, content validation, scheduling, publishing
job idempotency and retries, analytics filtering and imports, feature gating,
billing webhooks, admin access, demo isolation, and security headers.

## Deployment

- **Web app:** any Node host for Next.js 16 (Vercel, or `pnpm build && pnpm start`).
  Set every variable from [`.env.example`](.env.example) that applies.
- **Database:** apply migrations with `supabase db push` before deploying code
  that depends on them.
- **Queue:** run `pnpm worker` somewhere, or schedule the cron endpoint every minute.
- **Webhooks:** register the Stripe endpoint (if billing is on) and the
  platform OAuth callbacks (when adapters exist).
- **First admin:** `pnpm admin:grant <email>` with production `DATABASE_URL`.
- Never deploy `tooling/auth-emulator` or run `pnpm db:seed` against production
  (both refuse to).

## Known limitations

- Platform adapters are placeholders; no real connection or publishing yet.
- Media uploads to Supabase Storage are implemented but unverified against a
  real bucket here. Attaching media by URL works everywhere.
- The Claude provider is contract-tested against a stand-in API, not the live
  API. Stripe Checkout and the portal haven't been run against Stripe.
- No email provider for invitations: links are copied and shared by hand.
- A sole owner can't delete their user account; transfer ownership or delete
  the organization first. (Self-service account deletion isn't built.)
- The CSP allows inline scripts (Partial Prerendering can't use nonces); see
  [docs/SECURITY.md](docs/SECURITY.md).
- The AI monthly quota can be exceeded by a few under simultaneous requests.
- Dark theme only; English only. No approval workflow, analytics export, or
  email notifications yet. See [docs/STATUS.md](docs/STATUS.md#not-built).

## Production-readiness checklist

**Infrastructure**

- [ ] Supabase project with the transaction pooler; `DATABASE_SSL=require` with `DATABASE_SSL_CA`
- [ ] Migrations applied with `supabase db push`
- [ ] `public` removed from the Data API's exposed schemas
- [ ] Auth site URL, redirect URLs, token-hash email templates, and SMTP configured
- [ ] Storage upload verified end to end in the target project
- [ ] Worker deployed or cron endpoint scheduled every minute; heartbeat green in `/admin`

**Secrets**

- [ ] `TOKEN_ENCRYPTION_KEYS`, `IP_HASH_SECRET`, `CRON_SECRET` generated with a CSPRNG and stored in the host's secret manager
- [ ] Service role, Stripe, and Anthropic keys only in server environment
- [ ] Key rotation procedure documented for the team

**Product integrations**

- [ ] At least one platform adapter implemented, reviewed by the platform, and contract-tested
- [ ] Stripe products, prices, webhook endpoint, and customer portal configured; a full test-mode purchase verified
- [ ] Anthropic key configured and a generation verified
- [ ] Invitation email delivery (or a documented manual process)

**Operations**

- [ ] First platform admin granted with `pnpm admin:grant`
- [ ] Error monitoring and log shipping (logs are JSON on stdout/stderr)
- [ ] Database backups and point-in-time recovery enabled
- [ ] Audit log retention policy decided (and `app.audit_purge` scheduled if needed)
- [ ] Security contact published (`/.well-known/security.txt`)
- [ ] `pnpm verify` and `pnpm test:e2e` green on the release commit
