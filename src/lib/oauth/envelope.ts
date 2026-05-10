/**
 * JSON-safe (de)serialization of EncryptedEnvelope.
 *
 * The picker flow (Google channel picker, Facebook page picker) needs to
 * carry an encrypted token across one HTTP roundtrip — from the OAuth
 * callback to the user-confirmed `finalize` request. We persist it in
 * `oauth_states.metadata` (JSONB), so the Buffer fields have to be encoded
 * as strings.
 *
 * Base64 keeps the metadata blob small enough that we don't worry about
 * Postgres JSONB size limits (the encrypted token + IV + tag + nonce list
 * comes to a few hundred bytes — vs. the ~1GB JSONB limit).
 */

import { CURRENT_KEY_ID, type EncryptedEnvelope, type KeyId } from "./crypto";

export interface SerializedEnvelope {
  c: string;
  i: string;
  t: string;
  k: KeyId;
}

export function serializeEnvelope(env: EncryptedEnvelope): SerializedEnvelope {
  return {
    c: env.ciphertext.toString("base64"),
    i: env.iv.toString("base64"),
    t: env.tag.toString("base64"),
    k: env.keyId,
  };
}

export function deserializeEnvelope(s: unknown): EncryptedEnvelope {
  if (!s || typeof s !== "object") {
    throw new Error("Cannot deserialize envelope: input is not an object");
  }
  const obj = s as Partial<SerializedEnvelope>;
  if (!obj.c || !obj.i || !obj.t) {
    throw new Error("Cannot deserialize envelope: missing ciphertext / iv / tag");
  }
  return {
    ciphertext: Buffer.from(obj.c, "base64"),
    iv: Buffer.from(obj.i, "base64"),
    tag: Buffer.from(obj.t, "base64"),
    keyId: (obj.k ?? CURRENT_KEY_ID) as KeyId,
  };
}
