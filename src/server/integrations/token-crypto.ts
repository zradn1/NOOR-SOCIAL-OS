import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for platform tokens: AES-256-GCM with a random 96-bit IV
 * and the owning record's id as additional authenticated data, so a
 * ciphertext copied onto another account fails to decrypt.
 *
 *   TOKEN_ENCRYPTION_KEYS="v2:<base64 32 bytes>,v1:<base64 32 bytes>"
 *   TOKEN_ENCRYPTION_ACTIVE_KEY_ID="v2"
 *
 * New values are written with the active key; older keys stay listed until
 * every row has been re-encrypted (rotation).
 */
export type KeyRing = { activeKeyId: string; keys: Map<string, Buffer> };

const KEY_ID = /^[a-z0-9]{1,16}$/;

export function parseKeyRing(keysValue: string | undefined, activeKeyId: string | undefined): KeyRing {
  if (!keysValue || !activeKeyId) {
    throw new Error("TOKEN_ENCRYPTION_KEYS and TOKEN_ENCRYPTION_ACTIVE_KEY_ID must be set to store platform tokens");
  }
  const keys = new Map<string, Buffer>();
  for (const entry of keysValue.split(",").map((s) => s.trim()).filter(Boolean)) {
    const separator = entry.indexOf(":");
    const id = entry.slice(0, separator);
    const key = Buffer.from(entry.slice(separator + 1), "base64");
    if (separator < 1 || !KEY_ID.test(id)) throw new Error("Invalid key id in TOKEN_ENCRYPTION_KEYS");
    if (key.length !== 32) throw new Error(`Encryption key ${id} must be 32 bytes (base64-encoded)`);
    keys.set(id, key);
  }
  if (!keys.has(activeKeyId)) throw new Error("TOKEN_ENCRYPTION_ACTIVE_KEY_ID is not present in TOKEN_ENCRYPTION_KEYS");
  return { activeKeyId, keys };
}

export function encryptSecret(ring: KeyRing, plaintext: string, aad: string): string {
  const key = ring.keys.get(ring.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ring.activeKeyId, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(ring: KeyRing, envelope: string, aad: string): string {
  const [keyId, iv, tag, ciphertext] = envelope.split(".");
  if (!keyId || !iv || !tag || ciphertext === undefined) throw new Error("Malformed encrypted value");
  const key = ring.keys.get(keyId);
  if (!key) throw new Error(`Encryption key ${keyId} is not configured`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function keyIdOf(envelope: string) {
  return envelope.split(".")[0] ?? "";
}

/** Generates a key suitable for TOKEN_ENCRYPTION_KEYS (used by docs/scripts). */
export function generateKey() {
  return randomBytes(32).toString("base64");
}
