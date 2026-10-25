import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/utils/redirect";
import { resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { createOrganizationSchema, inviteMemberSchema } from "@/lib/validation/tenancy";
import { isValidTimeZone } from "@/lib/time/timezones";

describe("safeRedirectPath (open redirect protection)", () => {
  it.each([
    ["/w/acme/dashboard", "/w/acme/dashboard"],
    ["/w/acme/content?status=draft#top", "/w/acme/content?status=draft#top"],
    ["https://evil.example/phish", "/app"],
    ["//evil.example", "/app"],
    ["/\\evil.example", "/app"],
    ["javascript:alert(1)", "/app"],
    ["", "/app"],
    [undefined, "/app"],
    ["/path\nwith-newline", "/app"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("auth validation", () => {
  it("normalizes email casing and whitespace", () => {
    expect(signInSchema.parse({ email: "  Amira@Noor.Test ", password: "x" }).email).toBe("amira@noor.test");
  });

  it("requires strong passwords at sign-up", () => {
    const weak = signUpSchema.safeParse({ fullName: "Amira", email: "a@b.co", password: "onlyletters" });
    expect(weak.success).toBe(false);
    const ok = signUpSchema.safeParse({ fullName: "Amira", email: "a@b.co", password: "letters-and-42" });
    expect(ok.success).toBe(true);
  });

  it("caps passwords at bcrypt's 72-byte limit", () => {
    expect(signUpSchema.safeParse({ fullName: "Amira", email: "a@b.co", password: `a1${"x".repeat(80)}` }).success).toBe(false);
  });

  it("requires matching confirmation when resetting", () => {
    const result = resetPasswordSchema.safeParse({ password: "new-pass-123", confirmPassword: "new-pass-124" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});

describe("tenancy validation", () => {
  it("rejects invalid time zones", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(
      createOrganizationSchema.safeParse({ organizationName: "Maison", workspaceName: "Main", timezone: "Nope/Zone" }).success,
    ).toBe(false);
  });

  it("refuses owner invitations", () => {
    expect(inviteMemberSchema.safeParse({ email: "x@y.co", role: "owner" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "x@y.co", role: "admin" }).success).toBe(true);
  });

  it("only accepts UUID workspace ids", () => {
    expect(
      inviteMemberSchema.safeParse({ email: "x@y.co", role: "viewer", workspaceIds: ["../../etc"] }).success,
    ).toBe(false);
  });
});
