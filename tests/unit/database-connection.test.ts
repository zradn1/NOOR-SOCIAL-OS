import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";
import { connectionOptions } from "@/server/db/connection";
import { resolveDatabaseUrl } from "@/server/env";

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

describe("database URL resolution", () => {
  const none = { DATABASE_URL: undefined, POSTGRES_URL: undefined, POSTGRES_PRISMA_URL: undefined };

  it("prefers DATABASE_URL, then the integration's POSTGRES_URL and POSTGRES_PRISMA_URL", () => {
    expect(resolveDatabaseUrl({ ...none, DATABASE_URL: POOLER, POSTGRES_URL: "postgres://other" })).toBe(POOLER);
    expect(resolveDatabaseUrl({ ...none, POSTGRES_URL: POOLER, POSTGRES_PRISMA_URL: "postgres://other" })).toBe(POOLER);
    expect(resolveDatabaseUrl({ ...none, POSTGRES_PRISMA_URL: POOLER })).toBe(POOLER);
  });

  it("reports a missing database URL", () => {
    expect(() => resolveDatabaseUrl(none)).toThrow(/Missing configuration: DATABASE_URL/);
  });

  it("names a malformed variable instead of falling through to another database", () => {
    for (const bad of [`"${POOLER}"`, `DATABASE_URL=${POOLER}`, "db.example.com:6543"]) {
      expect(() => resolveDatabaseUrl({ ...none, DATABASE_URL: bad, POSTGRES_URL: POOLER })).toThrow(
        /^DATABASE_URL must be a postgres:\/\//,
      );
    }
  });

  it("never echoes the value in the error", () => {
    const secret = `"postgresql://u:hunter2@h:6543/postgres"`;
    expect(() => resolveDatabaseUrl({ ...none, DATABASE_URL: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("hunter2") }),
    );
  });
});
