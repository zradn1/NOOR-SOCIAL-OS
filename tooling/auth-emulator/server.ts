/**
 * ============================================================================
 *  LOCAL AUTH EMULATOR — DEVELOPMENT AND END-TO-END TESTS ONLY
 * ============================================================================
 *
 * Implements the subset of the Supabase Auth (GoTrue) HTTP API that
 * @supabase/supabase-js uses in this app, backed by `auth.users` in the local
 * Postgres. It exists because the Supabase CLI stack needs Docker. The
 * application code is unchanged: it talks to this server exactly as it would
 * talk to hosted Supabase Auth.
 *
 * Not implemented: OAuth providers, MFA, phone auth, rate limits, email
 * delivery. "Emails" (confirmation/recovery links) are printed to stdout and
 * appended to `.local/auth-emulator-mail.log`.
 *
 *   DATABASE_URL=... APP_URL=http://localhost:3000 pnpm auth:emulator
 *
 * Refuses to start when NODE_ENV=production.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import bcrypt from "bcryptjs";
import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT, type JWK } from "jose";
import { Pool } from "pg";

if (process.env.NODE_ENV === "production") {
  console.error("The auth emulator must never run in production.");
  process.exit(1);
}

const PORT = Number(process.env.AUTH_EMULATOR_PORT ?? 54321);
const ISSUER_BASE = process.env.AUTH_EMULATOR_URL ?? `http://127.0.0.1:${PORT}`;
const ISSUER = `${ISSUER_BASE}/auth/v1`;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SERVICE_KEY = process.env.AUTH_EMULATOR_SERVICE_KEY ?? "local-service-role-key";
const ACCESS_TTL = Number(process.env.AUTH_EMULATOR_ACCESS_TTL ?? 3600);
const STATE_DIR = path.resolve(import.meta.dirname, "../../.local");
const KEY_FILE = path.join(STATE_DIR, "auth-emulator-keys.json");
const MAIL_LOG = path.join(STATE_DIR, "auth-emulator-mail.log");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Keys = { kid: string; privateJwk: JWK; publicJwk: JWK };

async function loadKeys(): Promise<Keys> {
  mkdirSync(STATE_DIR, { recursive: true });
  if (existsSync(KEY_FILE)) return JSON.parse(readFileSync(KEY_FILE, "utf8"));
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const kid = randomUUID();
  const keys: Keys = {
    kid,
    privateJwk: { ...(await exportJWK(privateKey)), kid, alg: "ES256", use: "sig" },
    publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig", key_ops: ["verify"] },
  };
  writeFileSync(KEY_FILE, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

const keysPromise = loadKeys();
// refresh token -> session
const refreshTokens = new Map<string, { userId: string; sessionId: string }>();
// sha256(token) -> pending email action
const otpTokens = new Map<string, { userId: string; type: "recovery" | "signup" | "email"; expires: number }>();

type UserRow = {
  id: string;
  email: string;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  last_sign_in_at: Date | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  banned_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

function userJson(u: UserRow) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.email_confirmed_at?.toISOString() ?? null,
    confirmed_at: u.email_confirmed_at?.toISOString() ?? null,
    phone: "",
    last_sign_in_at: u.last_sign_in_at?.toISOString() ?? null,
    app_metadata: u.raw_app_meta_data ?? { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [],
    created_at: u.created_at.toISOString(),
    updated_at: u.updated_at.toISOString(),
    is_anonymous: false,
    banned_until: u.banned_until?.toISOString() ?? undefined,
  };
}

async function findUserByEmail(email: string) {
  const { rows } = await pool.query<UserRow>("select * from auth.users where lower(email) = lower($1)", [email]);
  return rows[0];
}

async function findUserById(id: string) {
  const { rows } = await pool.query<UserRow>("select * from auth.users where id = $1", [id]);
  return rows[0];
}

async function issueSession(user: UserRow, sessionId: string = randomUUID()) {
  const keys = await keysPromise;
  const key = await importJWK(keys.privateJwk, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    aud: "authenticated",
    email: user.email,
    phone: "",
    app_metadata: user.raw_app_meta_data ?? { provider: "email", providers: ["email"] },
    user_metadata: user.raw_user_meta_data ?? {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: sessionId,
    is_anonymous: false,
  })
    .setProtectedHeader({ alg: "ES256", kid: keys.kid, typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL)
    .sign(key);
  const refreshToken = randomBytes(24).toString("base64url");
  refreshTokens.set(refreshToken, { userId: user.id, sessionId });
  await pool.query("update auth.users set last_sign_in_at = now() where id = $1", [user.id]);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TTL,
    expires_at: now + ACCESS_TTL,
    refresh_token: refreshToken,
    user: userJson({ ...user, last_sign_in_at: new Date() }),
  };
}

async function userFromBearer(req: IncomingMessage) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const keys = await keysPromise;
    const { payload } = await jwtVerify(token, await importJWK(keys.publicJwk, "ES256"), { issuer: ISSUER });
    if (typeof payload.sub !== "string") return null;
    return (await findUserById(payload.sub)) ?? null;
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function authError(res: ServerResponse, status: number, code: string, message: string) {
  send(res, status, { code: status, error_code: code, msg: message, error: code, error_description: message });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function mail(to: string, subject: string, link: string) {
  const line = `${new Date().toISOString()}\t${to}\t${subject}\t${link}\n`;
  console.log(`[auth-emulator] email to ${to}: ${subject}\n  ${link}`);
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(MAIL_LOG, line);
}

function newOtp(userId: string, type: "recovery" | "signup" | "email") {
  const token = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  otpTokens.set(hash, { userId, type, expires: Date.now() + 3600_000 });
  return hash;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", ISSUER_BASE);
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /auth/v1/.well-known/jwks.json") {
      return send(res, 200, { keys: [(await keysPromise).publicJwk] });
    }
    if (route === "GET /auth/v1/settings" || route === "GET /auth/v1/health") {
      return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true, version: "emulator" });
    }

    if (route === "POST /auth/v1/signup") {
      const body = await readJson(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authError(res, 400, "validation_failed", "Invalid email");
      if (password.length < 8) return authError(res, 422, "weak_password", "Password should be at least 8 characters.");
      if (await findUserByEmail(email)) return authError(res, 422, "user_already_exists", "User already registered");
      const id = randomUUID();
      const data = (body.data as Record<string, unknown>) ?? {};
      await pool.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         values ($1, 'authenticated', 'authenticated', $2, $3, now(), $4)`,
        [id, email, await bcrypt.hash(password, 10), JSON.stringify(data)],
      );
      const user = (await findUserById(id))!;
      return send(res, 200, await issueSession(user));
    }

    if (route === "POST /auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      const body = await readJson(req);
      if (grant === "password") {
        const user = await findUserByEmail(String(body.email ?? ""));
        const ok = user?.encrypted_password && (await bcrypt.compare(String(body.password ?? ""), user.encrypted_password));
        if (!user || !ok) return authError(res, 400, "invalid_credentials", "Invalid login credentials");
        if (user.banned_until && user.banned_until > new Date()) return authError(res, 400, "user_banned", "User is banned");
        return send(res, 200, await issueSession(user));
      }
      if (grant === "refresh_token") {
        const entry = refreshTokens.get(String(body.refresh_token ?? ""));
        if (!entry) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        refreshTokens.delete(String(body.refresh_token));
        const user = await findUserById(entry.userId);
        if (!user) return authError(res, 400, "user_not_found", "User not found");
        return send(res, 200, await issueSession(user, entry.sessionId));
      }
      return authError(res, 400, "unsupported_grant_type", "Unsupported grant type");
    }

    if (route === "GET /auth/v1/user") {
      const user = await userFromBearer(req);
      return user ? send(res, 200, userJson(user)) : authError(res, 401, "bad_jwt", "invalid JWT");
    }

    if (route === "PUT /auth/v1/user") {
      const user = await userFromBearer(req);
      if (!user) return authError(res, 401, "bad_jwt", "invalid JWT");
      const body = await readJson(req);
      if (typeof body.password === "string") {
        if (body.password.length < 8) return authError(res, 422, "weak_password", "Password should be at least 8 characters.");
        await pool.query("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [
          user.id,
          await bcrypt.hash(body.password, 10),
        ]);
      }
      if (body.data && typeof body.data === "object") {
        await pool.query("update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1", [
          user.id,
          JSON.stringify(body.data),
        ]);
      }
      return send(res, 200, userJson((await findUserById(user.id))!));
    }

    if (route === "POST /auth/v1/logout") {
      return send(res, 204);
    }

    if (route === "POST /auth/v1/recover") {
      const body = await readJson(req);
      const user = await findUserByEmail(String(body.email ?? ""));
      // Same response whether or not the account exists (no enumeration).
      if (user) {
        const hash = newOtp(user.id, "recovery");
        mail(user.email, "Reset your password", `${APP_URL}/auth/confirm?token_hash=${hash}&type=recovery&next=/reset-password`);
      }
      return send(res, 200, {});
    }

    if (route === "POST /auth/v1/verify") {
      const body = await readJson(req);
      const hash = String(body.token_hash ?? "");
      const entry = otpTokens.get(hash);
      if (!entry || entry.expires < Date.now() || entry.type !== body.type) {
        return authError(res, 403, "otp_expired", "Email link is invalid or has expired");
      }
      otpTokens.delete(hash);
      const user = await findUserById(entry.userId);
      if (!user) return authError(res, 403, "otp_expired", "Email link is invalid or has expired");
      return send(res, 200, await issueSession(user));
    }

    // --- Admin API (service role) -----------------------------------------
    if (url.pathname.startsWith("/auth/v1/admin/")) {
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (bearer !== SERVICE_KEY) return authError(res, 401, "not_admin", "User not allowed");
      if (route === "GET /auth/v1/admin/users") {
        const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
        const perPage = Math.min(1000, Math.max(1, Number(url.searchParams.get("per_page") ?? 50)));
        const { rows } = await pool.query<UserRow>("select * from auth.users order by created_at limit $1 offset $2", [
          perPage,
          (page - 1) * perPage,
        ]);
        return send(res, 200, { users: rows.map(userJson), aud: "authenticated" });
      }
      const match = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
      if (match && req.method === "PUT") {
        const body = await readJson(req);
        if (typeof body.ban_duration === "string") {
          const until = body.ban_duration === "none" ? null : new Date(Date.now() + 100 * 365 * 24 * 3600_000);
          await pool.query("update auth.users set banned_until = $2, updated_at = now() where id = $1", [match[1], until]);
        }
        const user = await findUserById(match[1]!);
        return user ? send(res, 200, userJson(user)) : authError(res, 404, "user_not_found", "User not found");
      }
      if (match && req.method === "GET") {
        const user = await findUserById(match[1]!);
        return user ? send(res, 200, userJson(user)) : authError(res, 404, "user_not_found", "User not found");
      }
    }

    authError(res, 404, "not_found", `No emulator route for ${route}`);
  } catch (error) {
    console.error("[auth-emulator]", error);
    authError(res, 500, "unexpected_failure", "Emulator error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[auth-emulator] listening on ${ISSUER} (LOCAL USE ONLY)`);
});
