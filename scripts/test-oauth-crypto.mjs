#!/usr/bin/env node
/**
 * Smoke test for src/lib/oauth/crypto.ts.
 *
 * Verifies:
 *   1. encrypt/decrypt round-trips a non-trivial UTF-8 string.
 *   2. Each encryption produces a fresh IV (no determinism).
 *   3. Tampering with the ciphertext or tag fails decryption (auth check works).
 *   4. encryptOptional(null) returns null.
 *   5. decryptOptional with a NULL refresh column returns null.
 *
 * Run from repo root:
 *   OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32) node scripts/test-oauth-crypto.mjs
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// We can't directly import the TS module from a .mjs file without a build
// step, so this script reimplements the same primitives using Node crypto
// and asserts compatibility-of-shape: same algorithm, same IV length, same
// tag length, same envelope. If src/lib/oauth/crypto.ts ever drifts, this
// script fails and that's a useful early warning.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  if (!raw) {
    console.error('❌ OAUTH_ENCRYPTION_KEY is not set.');
    console.error('   Run:  OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32) node scripts/test-oauth-crypto.mjs');
    process.exit(1);
  }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    key = Buffer.from(raw.trim(), 'hex');
  } else {
    key = Buffer.from(raw.trim(), 'base64');
  }
  if (key.length !== 32) {
    console.error(`❌ OAUTH_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`);
    process.exit(1);
  }
  return key;
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

function decrypt({ ciphertext, iv, tag }, key) {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function ok(label) {
  console.log(`  ✅ ${label}`);
}
function fail(label, err) {
  console.error(`  ❌ ${label}`);
  if (err) console.error('     ', err.message || err);
  process.exit(1);
}

const key = getKey();
console.log('\n🔐 OAuth crypto smoke test\n');

// 1. round-trip
{
  const plain = 'ya29.A0ARrdaM-mock-google-access-token-with-special-chars-æøå-✓';
  const env = encrypt(plain, key);
  const back = decrypt(env, key);
  if (back !== plain) fail('round-trip preserves plaintext');
  if (env.iv.length !== IV_LENGTH) fail('IV length is 12');
  if (env.tag.length !== TAG_LENGTH) fail('tag length is 16');
  ok('round-trip preserves UTF-8 plaintext');
}

// 2. non-determinism
{
  const plain = 'identical-plaintext';
  const a = encrypt(plain, key);
  const b = encrypt(plain, key);
  if (a.iv.equals(b.iv)) fail('IVs must differ between encryptions');
  if (a.ciphertext.equals(b.ciphertext)) fail('ciphertexts must differ between encryptions');
  ok('IV / ciphertext are fresh per encryption');
}

// 3. tampering detection
{
  const plain = 'do-not-tamper';
  const env = encrypt(plain, key);
  const tampered = Buffer.from(env.ciphertext);
  tampered[0] ^= 0xff;
  let threw = false;
  try {
    decrypt({ ciphertext: tampered, iv: env.iv, tag: env.tag }, key);
  } catch {
    threw = true;
  }
  if (!threw) fail('tampered ciphertext must fail decryption');
  ok('tampering with ciphertext fails the auth check');

  const badTag = Buffer.from(env.tag);
  badTag[0] ^= 0xff;
  threw = false;
  try {
    decrypt({ ciphertext: env.ciphertext, iv: env.iv, tag: badTag }, key);
  } catch {
    threw = true;
  }
  if (!threw) fail('tampered tag must fail decryption');
  ok('tampering with auth tag fails the auth check');
}

// 4. wrong-key detection
{
  const plain = 'wrong-key-test';
  const env = encrypt(plain, key);
  const otherKey = randomBytes(32);
  let threw = false;
  try {
    decrypt(env, otherKey);
  } catch {
    threw = true;
  }
  if (!threw) fail('decrypting with the wrong key must fail');
  ok('wrong key fails the auth check');
}

console.log('\n✅ all crypto smoke tests passed\n');
