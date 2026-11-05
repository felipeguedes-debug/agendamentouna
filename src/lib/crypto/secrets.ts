import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Provider credentials at rest (PRD 7, Segurança): WhatsAPI instance tokens now,
 * Google refresh tokens in Block 6. AES-256-GCM with TOKEN_ENCRYPTION_KEY, a
 * 32-byte key in base64. The stored form is "v1:" + base64(iv | tag | ciphertext).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretError extends Error {
  override name = "SecretError";
}

function key() {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY;
  const bytes = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new SecretError("TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (see .env.example)");
  return bytes;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptSecret(stored: string) {
  const [version, payload] = stored.split(":", 2);
  if (version !== VERSION || !payload) throw new SecretError("Not an encrypted secret");
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length <= IV_BYTES + TAG_BYTES) throw new SecretError("Not an encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, IV_BYTES));
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretError("The secret does not decrypt with this key");
  }
}

/** Compares a received credential with the stored one in constant time. */
export function sameSecret(received: string, expected: string) {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
