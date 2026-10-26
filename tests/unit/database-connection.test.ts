import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";
import { connectionOptions } from "@/server/db/connection";

const POOLER = "postgresql://postgres.abc:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

describe("database connection options", () => {
  it("removes TLS parameters from the URL so DATABASE_SSL decides", () => {
    const { connectionString } = connectionOptions(`${POOLER}?sslmode=require&supa=base-pooler.x`, "no-verify");
    expect(connectionString).toBe(`${POOLER}?supa=base-pooler.x`);
  });

  it("keeps the password encoding and the rest of the URL intact", () => {
    expect(connectionOptions(POOLER, "require").connectionString).toBe(POOLER);
  });

  it("maps each mode to node-postgres TLS options", () => {
    expect(connectionOptions(POOLER, "disable").ssl).toBeUndefined();
    expect(connectionOptions(POOLER, "no-verify").ssl).toEqual({ rejectUnauthorized: false });
    expect(connectionOptions(POOLER, "require").ssl).toEqual({ rejectUnauthorized: true });
  });

  it("trusts a provided CA alongside the system roots", () => {
    const { ssl } = connectionOptions(POOLER, "require", PEM);
    expect(ssl?.rejectUnauthorized).toBe(true);
    const ca = (ssl as { ca: string[] }).ca;
    expect(ca).toHaveLength(rootCertificates.length + 1);
    expect(ca.at(-1)).toBe(PEM);
  });

  it("accepts a PEM pasted on one line with escaped newlines", () => {
    const { ssl } = connectionOptions(POOLER, "require", PEM.replace(/\n/g, "\\n"));
    expect((ssl as { ca: string[] }).ca.at(-1)).toBe(PEM);
  });

  it("ignores the CA when verification is off", () => {
    expect(connectionOptions(POOLER, "no-verify", PEM).ssl).toEqual({ rejectUnauthorized: false });
  });
});
