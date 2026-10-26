import { rootCertificates } from "node:tls";

export type DatabaseSslMode = "disable" | "require" | "no-verify";

// libpq parameters that node-postgres reads from the URL. pg lets them override
// the explicit `ssl` option, and treats sslmode=require as full verification
// against the system CA store, which Supabase's own CA isn't part of.
const URL_TLS_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslcrl", "ssl", "uselibpqcompat"];

/**
 * node-postgres connection options where DATABASE_SSL alone decides TLS:
 * - `disable`: no TLS (local development only);
 * - `no-verify`: encrypted, server certificate not verified;
 * - `require`: encrypted and verified against the system CAs plus `ca` (the
 *   PEM from DATABASE_SSL_CA, e.g. Supabase's root certificate).
 */
export function connectionOptions(url: string, mode: DatabaseSslMode, ca?: string) {
  let connectionString = url;
  try {
    const parsed = new URL(url);
    for (const key of URL_TLS_PARAMS) parsed.searchParams.delete(key);
    connectionString = parsed.toString();
  } catch {
    // Not a URL (e.g. a key=value string): pass it through unchanged.
  }

  if (mode === "disable") return { connectionString, ssl: undefined };
  if (mode === "no-verify") return { connectionString, ssl: { rejectUnauthorized: false } };
  // Setting `ca` replaces Node's trust store, so keep the public roots alongside it.
  const pem = ca?.replace(/\\n/g, "\n").trim();
  return {
    connectionString,
    ssl: { rejectUnauthorized: true, ...(pem ? { ca: [...rootCertificates, pem] } : {}) },
  };
}
