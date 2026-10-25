import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the production build against a disposable local stack:
 * PostgreSQL (database `noor_e2e`, rebuilt each run) and the test-only auth
 * emulator. Build first: `pnpm build`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const AUTH_PORT = Number(process.env.E2E_AUTH_PORT ?? 54329);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/noor_e2e";
export const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: `LOCAL_DB_NAME=noor_e2e npx tsx tooling/local-db/apply.ts reset && npx tsx tooling/auth-emulator/server.ts`,
      url: `http://127.0.0.1:${AUTH_PORT}/auth/v1/health`,
      env: {
        DATABASE_URL,
        AUTH_EMULATOR_PORT: String(AUTH_PORT),
        APP_URL: BASE_URL,
        NODE_ENV: "test",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: BASE_URL,
      env: {
        NEXT_PUBLIC_APP_URL: BASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${AUTH_PORT}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
        DATABASE_URL,
        IP_HASH_SECRET: "e2e-ip-hash-secret",
        CRON_SECRET: "e2e-cron-secret",
        TOKEN_ENCRYPTION_KEYS: "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "v1",
        // Every test signs up from the same IP.
        RATE_LIMIT_MULTIPLIER: "100",
        // Stripe in test mode with fake keys: webhook signatures are verified
        // locally; no request leaves the machine in these tests.
        BILLING_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_test_e2e_not_a_real_key",
        STRIPE_WEBHOOK_SECRET: "whsec_e2e_secret",
        STRIPE_PRICE_PRO: "price_e2e_pro",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
