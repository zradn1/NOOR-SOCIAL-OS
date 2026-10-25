# Social platform integrations

None of the seven platform adapters is implemented yet. This page explains what
already exists around them, what each platform requires, and how to add one
without touching the rest of the app.

## What already works

Everything except the provider's own HTTP calls:

| Piece | Where | Behaviour |
| --- | --- | --- |
| Connect button | Social Accounts page | Disabled with an explanation until the adapter is implemented **and** its credentials are set. |
| OAuth start | `POST /api/integrations/{platform}/authorize` | Same-origin check, `accounts.connect` permission, rate limit, 256-bit `state` stored as a SHA-256 hash (single use, 10 minutes, bound to user + workspace + platform), PKCE S256 verifier stored encrypted. |
| OAuth callback | `GET /api/integrations/{platform}/callback` | Verifies the signed-in user, consumes the state, exchanges the code, fetches the account, and stores tokens encrypted. Only a verified provider response creates a `connected` account. |
| Token storage | `oauth_connections` | AES-256-GCM with a versioned key ring (`TOKEN_ENCRYPTION_KEYS`), the account id bound as associated data, no API role can read the table, never sent to the browser. |
| Refresh | `runMaintenance()` (worker and cron) | Refreshes tokens nearing expiry; repeated failures mark the account `expired` and notify the workspace's admins. |
| Disconnect | Social Accounts page | Revokes at the provider when it supports revocation, wipes the ciphertexts, blocks queued jobs, and writes an audit entry. |
| Publishing | `src/server/publishing/worker.ts` | Checks connection, capability, and platform rules, then calls `publish()`. A target becomes `published` only with the provider's post id (a database constraint enforces this). |
| Analytics sync | `src/server/analytics/ingest.ts` | The same ingestion path CSV imports use; rows are tagged `provider_sync`. |

All of this is tested with a test-only fake provider (`tests/integration/oauth.test.ts`,
`tests/integration/publishing-worker.test.ts`).

## Callback URLs to register

```
{NEXT_PUBLIC_APP_URL}/api/integrations/instagram/callback
{NEXT_PUBLIC_APP_URL}/api/integrations/tiktok/callback
{NEXT_PUBLIC_APP_URL}/api/integrations/facebook/callback
{NEXT_PUBLIC_APP_URL}/api/integrations/youtube/callback
{NEXT_PUBLIC_APP_URL}/api/integrations/linkedin/callback
{NEXT_PUBLIC_APP_URL}/api/integrations/x/callback
{NEXT_PUBLIC_APP_URL}/api/integrations/pinterest/callback
```

## Per platform

Endpoints and scopes are recorded in `src/server/integrations/providers/index.ts`.
Verify them against current documentation before implementing: platforms change
APIs, scopes, and review rules often.

| Platform | Credentials | Official API | Review / access needed | Notes |
| --- | --- | --- | --- | --- |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | Instagram API with Instagram Login | Meta app review for content publishing and insights | Professional (Business/Creator) accounts only. Media must be at public URLs; publish via container + `media_publish`. No text-only posts. |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Content Posting API | App audit; unaudited apps can only post privately | Query creator info before each post (privacy options, max duration). |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Pages API (Graph) | Meta app review for page permissions | Publish with a Page token derived from a long-lived user token. |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | YouTube Data API v3, YouTube Analytics | Google OAuth verification; unverified projects upload as private | Resumable `videos.insert`; uploads consume quota. Request `access_type=offline`. |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Posts API | Community Management API product for organization pages | Versioned headers. Member posting works with `w_member_social`. |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | X API v2 | Paid API access tier | OAuth 2.0 with PKCE. Volume and metrics depend on the tier. |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | Pinterest API v5 | Standard access review | Pins go to a board; choose one per target. |

## Implementing an adapter

1. Create `src/server/integrations/providers/<platform>.ts` implementing
   `SocialProvider` (`src/server/integrations/types.ts`):
   - `buildAuthorizationUrl({ state, codeChallenge, redirectUri })`
   - `exchangeCode()` and `refreshToken()` return absolute expiry instants
   - `revokeToken()` (throw `IntegrationNotImplementedError` if the platform has
     no revocation endpoint, and set `capabilities.revoke = false`)
   - `fetchAccount()` returns the platform's own account id
   - `publish()` returns `{ outcome: "published", externalPostId, … }` **only**
     when the platform confirms the post exists
   - `fetchMetrics()` returns daily values; leave a metric out (or `null`) when
     the platform doesn't report it, never `0`
2. Errors:
   - throw `ProviderError` with `retryable: true` only when the platform
     rejected the request before processing it (rate limits, 5xx with no side
     effects), and pass `retryAfterSeconds` when given;
   - anything else non-retryable is a permanent failure;
   - network timeouts become "outcome unknown" and are never retried
     automatically unless `capabilities.idempotentPublish` is true.
3. Set `status().implemented = true` and register the adapter in `PROVIDERS`.
4. Update `src/lib/platforms/constraints.ts` and `src/lib/platforms/metrics.ts`
   if the platform's limits or metrics differ from what's recorded.
5. Add contract tests with recorded or stand-in responses; never call the live
   API from CI.

## What never happens

- No passwords are requested for any platform.
- No scraping or unofficial APIs.
- No account is shown as connected without a verified provider response.
- No post is shown as published without the platform's post id.
