import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment variable.
 * Must be a 32-byte (64 hex characters) key.
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.EMAIL_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "EMAIL_ENCRYPTION_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (keyHex.length !== 64) {
    throw new Error(
      "EMAIL_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
    );
  }
  return Buffer.from(keyHex, "hex");
}

export interface EncryptedData {
  encrypted: string; // base64 encoded ciphertext + auth tag
  iv: string; // base64 encoded IV
}

/**
 * Encrypt a plaintext password using AES-256-GCM.
 * Returns the encrypted data and initialization vector.
 */
export function encryptPassword(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Combine ciphertext and auth tag for storage
  const combined = Buffer.concat([
    Buffer.from(encrypted, "base64"),
    authTag,
  ]).toString("base64");

  return {
    encrypted: combined,
    iv: iv.toString("base64"),
  };
}

/**
 * Decrypt an encrypted password using AES-256-GCM.
 * Requires the encrypted data and the IV used during encryption.
 */
export function decryptPassword(encrypted: string, iv: string): string {
  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, "base64");
  const combinedBuffer = Buffer.from(encrypted, "base64");

  // Extract auth tag (last 16 bytes) and ciphertext
  const authTag = combinedBuffer.subarray(combinedBuffer.length - AUTH_TAG_LENGTH);
  const ciphertext = combinedBuffer.subarray(0, combinedBuffer.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}
