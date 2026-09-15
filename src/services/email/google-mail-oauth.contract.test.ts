import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

test("Google OAuth Gmail flow requests full mail scope and binds a concrete email account", () => {
  const start = source("src/app/api/oauth/google/route.ts");
  assert.match(start, /GOOGLE_MAIL_SCOPE/);
  assert.match(start, /account_id/);
  assert.match(start, /expected_email/);
  assert.match(start, /access_type.*offline/);
  assert.match(start, /prompt.*consent/);
  assert.match(start, /login_hint/);
});

test("Gmail callback verifies exact Google identity and IMAP XOAUTH2 before enabling auto fetch", () => {
  const callback = source("src/app/api/oauth/google/callback/route.ts");
  assert.match(callback, /gmail_account_mismatch/);
  assert.match(callback, /connectedEmail !== expectedEmail/);
  assert.match(callback, /imap\.gmail\.com/);
  assert.match(callback, /accessToken: tokenData\.access_token/);
  assert.match(callback, /platform: "gmail"/);
  assert.match(callback, /auto_fetch: true/);
  assert.match(callback, /auto_fetch_paused_by_system: false/);
});

test("legacy Gmail callback cannot persist a plaintext global refresh token", () => {
  const legacy = source("src/app/api/oauth/gmail/callback/route.ts");
  assert.doesNotMatch(legacy, /gmail_refresh_token/);
  assert.doesNotMatch(legacy, /brand_settings/);
  assert.match(legacy, /legacy_gmail_callback_disabled/);
});

test("email transports accept OAuth access tokens while retaining password fallback", () => {
  const imap = source("src/services/email/imap-reader.ts");
  const smtp = source("src/services/email/smtp-sender.ts");
  const resolver = source("src/services/email/account-auth.ts");

  assert.match(imap, /accessToken\?: string/);
  assert.match(imap, /accessToken: config\.accessToken/);
  assert.match(smtp, /type: "OAuth2"/);
  assert.match(smtp, /accessToken: config\.accessToken/);
  assert.match(resolver, /getChannelsByBrand\(config\.brand_id, "gmail"\)/);
  assert.match(resolver, /decryptPassword/);
});

test("Communications exposes Sign in with Google and hides password flow for Gmail", () => {
  const page = source("src/app/(content)/nexus-os/communications/page.tsx");
  assert.match(page, /Logg inn med Google/);
  assert.match(page, /service: "gmail"/);
  assert.match(page, /account_id: repair\.id/);
  assert.match(page, /provider === "gmail"/);
});
