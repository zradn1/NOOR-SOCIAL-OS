import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { codeChallengeS256, constantTimeEqual } from "@/server/integrations/pkce";
import { decryptSecret, encryptSecret, keyIdOf, parseKeyRing } from "@/server/integrations/token-crypto";

const key = () => randomBytes(32).toString("base64");

describe("token encryption at rest", () => {
  it("round-trips and never contains the plaintext", () => {
    const ring = parseKeyRing(`v1:${key()}`, "v1");
    const envelope = encryptSecret(ring, "secret-access-token", "account-1");
    expect(envelope).not.toContain("secret-access-token");
    expect(decryptSecret(ring, envelope, "account-1")).toBe("secret-access-token");
  });

  it("uses a fresh IV every time", () => {
    const ring = parseKeyRing(`v1:${key()}`, "v1");
    expect(encryptSecret(ring, "same", "a")).not.toBe(encryptSecret(ring, "same", "a"));
  });

  it("fails when the ciphertext is tampered with or moved to another record", () => {
    const ring = parseKeyRing(`v1:${key()}`, "v1");
    const envelope = encryptSecret(ring, "token", "account-1");
    const [id, iv, tag, ct] = envelope.split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret(ring, [id, iv, tag, flipped.toString("base64url")].join("."), "account-1")).toThrow();
    expect(() => decryptSecret(ring, envelope, "account-2")).toThrow();
  });

  it("supports key rotation: old ciphertexts stay readable, new ones use the active key", () => {
    const k1 = key();
    const old = parseKeyRing(`v1:${k1}`, "v1");
    const envelope = encryptSecret(old, "token", "a");
    const rotated = parseKeyRing(`v2:${key()},v1:${k1}`, "v2");
    expect(decryptSecret(rotated, envelope, "a")).toBe("token");
    expect(keyIdOf(encryptSecret(rotated, "token", "a"))).toBe("v2");
  });

  it("rejects malformed configuration", () => {
    expect(() => parseKeyRing(undefined, "v1")).toThrow(/must be set/);
    expect(() => parseKeyRing("v1:c2hvcnQ=", "v1")).toThrow(/32 bytes/);
    expect(() => parseKeyRing(`v1:${key()}`, "v9")).toThrow(/not present/);
    expect(() => parseKeyRing(`Bad-Id:${key()}`, "Bad-Id")).toThrow(/Invalid key id/);
  });
});

describe("PKCE", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("compares secrets in constant time and handles length mismatch", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
