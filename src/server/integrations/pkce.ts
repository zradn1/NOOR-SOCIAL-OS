import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit random value, base64url (OAuth state and PKCE verifier). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** RFC 7636 S256 code challenge. */
export function codeChallengeS256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
