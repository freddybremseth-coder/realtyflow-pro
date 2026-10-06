import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/email-suppression.ts"),
  "utf8",
);
const senderSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/send-brand-email.ts"),
  "utf8",
);

test("email suppression includes inbound opt-out evidence", () => {
  assert.match(source, /from\("email_messages"\)/);
  assert.match(source, /eq\("direction", "inbound"\)/);
  assert.match(source, /ilike\("from_address", email\)/);
  assert.match(source, /crm_reply_classification/);
  assert.match(source, /"unsubscribe"/);
  assert.match(source, /"do_not_contact"/);
});

test("email suppression remains fail closed", () => {
  assert.match(source, /contactResult\.error \|\| inboundOptOutResult\.error/);
  assert.match(source, /return \{ blocked: true, blockedEmails: \[\], manualTakeoverEmails: \[\], error: failed\.error\.message \}/);
});

test("existing CRM suppression remains authoritative", () => {
  assert.match(source, /from\("contacts"\)/);
  assert.match(source, /do_not_contact\.eq\.true,email_suppressed\.eq\.true/);
  assert.match(source, /contactRows\.length \|\| check\.inboundOptOutRows\.length/);
});

test("manual advisor takeover is exposed separately from ordinary suppression", () => {
  assert.match(source, /manualTakeoverEmails/);
  assert.match(source, /manual_owner_takeover/);
});

test("manual advisor takeover blocks sendBrandEmail even when allowSuppressed is true", () => {
  assert.match(senderSource, /manualTakeoverEmails/);
  const takeoverGate = senderSource.indexOf("manualTakeoverEmails");
  const allowSuppressedGate = senderSource.indexOf("!params.allowSuppressed");
  assert.ok(takeoverGate >= 0 && allowSuppressedGate >= 0 && takeoverGate < allowSuppressedGate);
});
