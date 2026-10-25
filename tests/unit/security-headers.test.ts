import { describe, expect, it } from "vitest";
import { authCookieOptions } from "@/lib/security/cookies";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

const directives = (policy: string) =>
  Object.fromEntries(policy.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("content security policy", () => {
  it("locks down everything except what the app needs", () => {
    const csp = directives(buildContentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/", isDev: false, upgradeInsecure: true }));
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["connect-src"]).toEqual(["'self'", "https://abc.supabase.co"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp).toHaveProperty("upgrade-insecure-requests");
  });

  it("allows eval only in development and ignores malformed Supabase URLs", () => {
    const dev = directives(buildContentSecurityPolicy({ supabaseUrl: "not a url", isDev: true, upgradeInsecure: false }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toEqual(["'self'"]);
    expect(dev).not.toHaveProperty("upgrade-insecure-requests");
  });
});

describe("auth cookies", () => {
  it("are HttpOnly and Lax, Secure on HTTPS", () => {
    expect(authCookieOptions("https://app.noor.studio")).toEqual({ path: "/", sameSite: "lax", httpOnly: true, secure: true });
    expect(authCookieOptions("http://localhost:3000").secure).toBe(false);
  });
});
