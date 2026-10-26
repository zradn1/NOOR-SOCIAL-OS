# Security

How NOOR SOCIAL OS protects tenant data, what's enforced where, and the known
trade-offs. Architecture details are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Controls

| Concern | Control | Where |
| --- | --- | --- |
| Tenant isolation | Row Level Security on every table; user queries run as `authenticated` with server-verified claims | `supabase/migrations`, `src/server/db/client.ts` (`withUser`) |
| Authorization | Hierarchical roles checked on the server before every service call; the same ranks in SQL | `src/lib/auth/permissions.ts`, `src/server/auth/guard.ts`, `app.*` helpers |
| Client guests | Flag on membership, editor rank at most, client workspaces only, limited roster visibility | `20261025000900_client_guests.sql` |
| Sessions | `getClaims()` signature verification, per-request suspension/deletion check, HttpOnly + SameSite=Lax + Secure cookies | `src/server/auth/session.ts`, `src/lib/security/cookies.ts` |
| Input validation | Zod on every Server Action, route handler, CSV import, and webhook | `src/lib/validation`, `src/server/actions` |
| Platform tokens | AES-256-GCM, versioned key ring, account id as associated data, system-only table | `src/server/integrations/token-crypto.ts` |
| OAuth | Hashed single-use state with expiry, PKCE S256, same-origin start | `src/server/services/social-accounts.ts` |
| Webhooks | Stripe signature on the raw body with a 5-minute replay window; idempotent, ordered application; payload digest only | `src/app/api/webhooks/stripe`, `src/server/billing` |
| Cron | Bearer secret compared in constant time; rate limited | `src/server/security/cron.ts` |
| Rate limiting | Postgres fixed window per user or HMAC'd IP | `src/server/security/rate-limit.ts` |
| Audit | Append-only `audit_logs` for membership, invitations, accounts, billing, imports, and every platform-admin action | `src/server/services/audit.ts` |
| Secrets | Server-only modules (`import "server-only"`), runtime env, never in client bundles or logs (log redaction) | `src/server/env.ts`, `src/server/observability/logger.ts` |
| HTTP | CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP; no `X-Powered-By` | `src/proxy.ts`, `next.config.ts` |
| Demo isolation | Immutable `is_demo` flags, demo-only statuses and sources, no tokens in demo workspaces, simulated publishing | Migrations, `src/server/integrations/demo.ts` |
| Admin | `/admin` 404s for non-admins; actions re-verify admin rights, need a reason, and are audited | `src/server/admin`, `src/server/services/admin.ts` |

## Verification in this repository

- RLS and tenancy rules are tested against PostgreSQL as the real API roles
  (`tests/db`).
- Services are tested for role, plan, and tenant boundaries (`tests/integration`).
- End-to-end tests check headers, HttpOnly cookies, the admin 404, suspension,
  cron auth, and webhook signatures (`e2e/security.spec.ts`).
- Client bundles were scanned for secret names after a production build; none
  were present.

## Known trade-offs

- **CSP allows inline scripts.** Partial Prerendering can't carry per-request
  nonces, and Next.js streams its payload in inline scripts. All other sources
  are restricted, and HttpOnly cookies keep session tokens out of reach of
  injected scripts. Revisit if nonce support for prerendered shells lands.
- **AI quota under concurrency.** The monthly quota is checked before calling
  the model and recorded after, so simultaneous requests can exceed it by a few
  (bounded by the per-user rate limit).
- **Images and media from any HTTPS host** are allowed by the CSP because posts
  can attach media by URL. The server never fetches those URLs.

## Deployment recommendations

- Remove `public` from the Supabase Data API's exposed schemas (Project
  Settings → API). The app doesn't use PostgREST; RLS protects the tables
  either way, but there's no reason to expose them.
- Use the transaction pooler with `DATABASE_SSL=require` and Supabase's root
  certificate in `DATABASE_SSL_CA` (Database Settings → SSL Configuration).
  `no-verify` still encrypts but doesn't authenticate the server.
- Generate `TOKEN_ENCRYPTION_KEYS`, `IP_HASH_SECRET`, and `CRON_SECRET` with a
  CSPRNG (`openssl rand -base64 32`). Rotate encryption keys by adding a new id
  and switching `TOKEN_ENCRYPTION_ACTIVE_KEY_ID`; keep old ids until tokens are
  refreshed.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, Stripe, and Anthropic keys in the host's
  secret store, never in the repository.
- Grant platform admin rights sparingly with `pnpm admin:grant`.

## Reporting a vulnerability

Report privately to Noor Studio Agency with steps to reproduce, and please
don't open a public issue. **Before launch:** publish a dedicated security
contact here (and in `/.well-known/security.txt`); none is configured yet.
