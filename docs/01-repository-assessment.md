# Stage 1 — Repository assessment

Date: 2026-10-25

## What existed before this work

| Area | Finding |
| --- | --- |
| Commits | One commit (`Initial commit`) |
| Files | `README.md` containing only the heading `# NOOR-SOCIAL-OS` |
| Framework | None |
| Package manager | None (no `package.json`, no lockfile) |
| Database | None (no migrations, no Supabase config) |
| Authentication | None |
| Styling system | None |
| Components / routes | None |
| Environment files | None |
| Tests | None |
| CI | None |

There was no application code to preserve, so there were no conflicts. The
project was built from a fresh `create-next-app` scaffold (Next.js 16.4.3), then
extended stage by stage.

## Requested stack: availability check

| Dependency | Status before | Action |
| --- | --- | --- |
| Next.js (App Router) | absent | installed 16.4.3 (`cacheComponents` + `partialPrefetching` enabled — scaffold default) |
| TypeScript | absent | installed 5.9 (strict) |
| Tailwind CSS | absent | installed 4.3 (CSS-first `@theme` tokens) |
| Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | absent | installed |
| Recharts | absent | installed 3.x |
| Framer Motion | absent | installed (`framer-motion`) |
| Zod | absent | installed 4.x |

## Build and test status at the start

- No build or test tooling existed.
- Baseline after scaffolding: `pnpm build`, `pnpm lint`, and `tsc --noEmit` all pass.

## Environment constraints discovered (sandbox used for this build)

| Constraint | Impact | Mitigation |
| --- | --- | --- |
| No Docker daemon | `supabase start` (local Supabase stack) cannot run here | Local PostgreSQL 16 plus a minimal Supabase compatibility shim (`tooling/local-db/supabase-shim.sql`) is used for database tests |
| GitHub release downloads blocked by network policy | PostgREST / GoTrue binaries cannot be fetched | Server data access goes straight to Postgres (see ADR-001), so PostgREST is not required at runtime; a small **test-only** Auth emulator (`tooling/auth-emulator`) stands in for Supabase Auth in local end-to-end tests |
| No Supabase project credentials | Cannot verify against a hosted Supabase project | Migrations target real Supabase; the shim mirrors the Supabase objects they depend on. Verifying against a real project is listed in the production-readiness checklist |
| No social platform credentials | No real OAuth or publishing | Provider adapters are explicit placeholders that refuse to run; a clearly labelled demo mode is isolated at the workspace level |
| No AI or billing credentials | No live AI or payments | Provider abstractions with a labelled demo AI provider and a "billing not configured" provider |

## Risks and technical constraints

1. **Next.js 16 Cache Components.** Runtime data (cookies, params, search params) must be read inside `<Suspense>` boundaries, and `new Date()`, `Math.random()` and similar calls are build errors in prerendered scope. Every authenticated page streams behind a skeleton.
2. **Serverless database connections.** Direct Postgres access needs the Supabase transaction pooler (Supavisor, port 6543) in production. Documented in the README.
3. **Untestable external APIs.** Social, AI and billing calls cannot be exercised here. The abstractions are tested with in-repo fakes, and nothing claims an external operation succeeded.
4. **Shim drift.** The local Supabase shim can diverge from hosted Supabase. It is kept minimal and mirrors the published definitions of `auth.uid()`, `auth.jwt()`, and the default role grants.

## Recommended implementation sequence (followed)

1. Assessment and architecture documentation (this file, `ARCHITECTURE.md`).
2. Design tokens and UI primitives.
3. Application shell.
4. Authentication, tenancy tables, RLS, and workspace context.
5. Remaining domain schema and RLS tests against real Postgres.
6. Product surfaces: dashboard, accounts, content studio, calendar.
7. Publishing infrastructure, analytics, AI assistant.
8. Clients, billing, admin panel.
9. Security hardening, end-to-end tests, documentation.
