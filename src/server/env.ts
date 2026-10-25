import "server-only";
import { z } from "zod";

/**
 * Server environment. Parsed lazily on first use so `next build` works without
 * secrets, and validated with Zod so a misconfiguration fails loudly at
 * runtime instead of producing undefined behaviour. Never import this module
 * from client components.
 */
const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Public app origin, used for auth redirects and OAuth callbacks.
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  // Supabase Auth (public values; safe for the browser).
  NEXT_PUBLIC_SUPABASE_URL: optional.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,

  // Server-only Supabase admin key (user administration, storage signing).
  SUPABASE_SERVICE_ROLE_KEY: optional,
  SUPABASE_STORAGE_BUCKET: z.string().default("media"),

  // Postgres (Supabase transaction pooler in production).
  DATABASE_URL: optional,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_SSL: z.enum(["disable", "require", "no-verify"]).default("disable"),

  // Secrets
  TOKEN_ENCRYPTION_KEYS: optional,
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: optional,
  IP_HASH_SECRET: optional,
  CRON_SECRET: optional,
  // Scales every rate limit (e.g. 100 for load or end-to-end tests). Bounded
  // so a typo can't silently disable protection.
  RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),

  // AI
  AI_PROVIDER: z.enum(["auto", "anthropic", "demo"]).default("auto"),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),

  // Billing
  BILLING_PROVIDER: z.enum(["none", "stripe"]).default("none"),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_STARTER: optional,
  STRIPE_PRICE_PRO: optional,
  STRIPE_PRICE_AGENCY: optional,

  // Demo mode
  DEMO_MODE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

// `schema.safeParse(process.env)` reads the whole object at runtime, so values
// are never inlined at build time (see src/proxy.ts).

export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      // Report variable names only, never values.
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export class ConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing configuration: ${missing.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

export function supabaseConfig() {
  const e = env();
  const key = e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !key) {
    throw new ConfigurationError(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  }
  return { url: e.NEXT_PUBLIC_SUPABASE_URL, key };
}

export function databaseUrl() {
  const url = env().DATABASE_URL;
  if (!url) throw new ConfigurationError(["DATABASE_URL"]);
  return url;
}

/** Which required pieces are configured. Names only, never values. */
export function configurationStatus() {
  const e = env();
  return {
    supabaseAuth: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && (e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
    supabaseServiceRole: Boolean(e.SUPABASE_SERVICE_ROLE_KEY),
    database: Boolean(e.DATABASE_URL),
    tokenEncryption: Boolean(e.TOKEN_ENCRYPTION_KEYS && e.TOKEN_ENCRYPTION_ACTIVE_KEY_ID),
    ipHashing: Boolean(e.IP_HASH_SECRET),
    cron: Boolean(e.CRON_SECRET),
    ai: e.AI_PROVIDER !== "demo" && Boolean(e.ANTHROPIC_API_KEY),
    billing: e.BILLING_PROVIDER === "stripe" && Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET),
    demoMode: e.DEMO_MODE_ENABLED,
  };
}
