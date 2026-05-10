/**
 * AES-256-GCM helpers for OAuth token storage.
 *
 * Why GCM and not just throwing tokens in a TEXT column:
 *   - The Supabase service role key is shared by every server-side route, so
 *     anyone who can read `oauth_tokens.access_token_ciphertext` would
 *     historically have been able to read the plaintext token too. Encrypting
 *     at the application layer means a leaked DB dump alone is not enough to
 *     post to Freddy's Facebook pages.
 *   - GCM gives us authenticated encryption: tampering with the ciphertext
 *     fails decryption rather than producing a plausible-looking wrong token
 *     that we'd then send to Graph API and get a confusing error from.
 *
 * Key:
 *   - Read once, on first use, from `OAUTH_ENCRYPTION_KEY`.
 *   - Must be 32 bytes, hex-encoded (i.e. 64 hex chars). Generate with
 *     `openssl rand -hex 32`.
 *   - Crashing at first encrypt/decrypt with a clear error is intentional —
 *     silently falling back to plaintext storage would defeat the point.
 *
 * Envelope:
 *   { ciphertext: bytea, iv: bytea, tag: bytea, key_id: 'v1' }
 *   IV is a fresh 12-byte random value per encryption (NIST recommended for
 *   GCM). Tag is the 16-byte auth tag. `key_id` lets us migrate to v2 later
 *   without rewriting old rows.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — NIST SP 800-38D §5.2.1.1
const TAG_LENGTH = 16; // 128 bits

export const CURRENT_KEY_ID = "v1" as const;
export type KeyId = "v1";

export interface EncryptedEnvelope {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: KeyId;
}

let cachedKey: Buffer | null = null;

/**
 * Lazy-loads the encryption key. Throws on misconfiguration so callers fail
 * fast at the first OAuth flow rather than silently storing plaintext.
 *
 * Test/CI shortcut: if `NODE_ENV !== 'production'` and `OAUTH_ENCRYPTION_KEY`
 * is not set, no fallback is provided — the explicit failure is what we want.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "OAUTH_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` and add it to .env.local + Vercel env vars.",
    );
  }
  // Accept hex (64 chars) or base64 (~44 chars). Reject anything else.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    key = Buffer.from(raw.trim(), "hex");
  } else {
    try {
      key = Buffer.from(raw.trim(), "base64");
    } catch {
      throw new Error("OAUTH_ENCRYPTION_KEY must be 32 bytes hex (64 chars) or base64-encoded.");
    }
  }
  if (key.length !== 32) {
    throw new Error(
      `OAUTH_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). Use \`openssl rand -hex 32\`.`,
    );
  }
  cachedKey = key;
  return cachedKey;
}

/**
 * Encrypt a UTF-8 plaintext (typically an OAuth access/refresh token) into
 * an envelope ready to persist as three `bytea` columns.
 */
export function encrypt(plaintext: string): EncryptedEnvelope {
  if (typeof plaintext !== "string") {
    throw new TypeError("encrypt() expects a string plaintext");
  }
  if (plaintext.length === 0) {
    throw new Error("Refusing to encrypt an empty string — caller should pass NULL through instead.");
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_LENGTH) {
    // Defensive: Node always returns 16 bytes for GCM, but if some future
    // refactor passes a different mode we want the failure to be loud.
    throw new Error(`Unexpected GCM auth tag length: ${tag.length}`);
  }
  return { ciphertext, iv, tag, keyId: CURRENT_KEY_ID };
}

/**
 * Decrypt an envelope previously produced by `encrypt`. Throws if the auth
 * tag fails (tampering, wrong key, corrupt row).
 */
export function decrypt(envelope: EncryptedEnvelope): string {
  if (envelope.keyId !== CURRENT_KEY_ID) {
    // Reserved for future rotation. When we add a v2 key, this branch will
    // dispatch to the right key. For now anything other than v1 is a bug.
    throw new Error(`Unknown OAUTH_ENCRYPTION_KEY key_id: ${envelope.keyId}`);
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  const plaintext = Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Convenience wrapper for the common case "encrypt this token if it's
 * non-empty, otherwise skip". Returns null when input is null/undefined/empty
 * so callers can pass the result straight to a nullable-bytea column.
 */
export function encryptOptional(plaintext: string | null | undefined): EncryptedEnvelope | null {
  if (!plaintext) return null;
  return encrypt(plaintext);
}

/**
 * Inverse of encryptOptional: decrypt a row that may have a NULL refresh
 * token (e.g. Facebook Page tokens, which are long-lived but not
 * refreshable).
 */
export function decryptOptional(
  envelope: { ciphertext: Buffer | null; iv: Buffer | null; tag: Buffer | null; keyId?: KeyId } | null,
): string | null {
  if (!envelope || !envelope.ciphertext || !envelope.iv || !envelope.tag) return null;
  return decrypt({
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    tag: envelope.tag,
    keyId: envelope.keyId ?? CURRENT_KEY_ID,
  });
}

/**
 * Test-only: clear the cached key. Used by `scripts/test-oauth-crypto.mjs`
 * to verify rotation behavior. Do NOT call from production code.
 */
export function __resetKeyCacheForTests(): void {
  cachedKey = null;
}
