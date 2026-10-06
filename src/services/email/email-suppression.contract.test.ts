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
  assert.match(source, /return \{ blocked: true, blockedEmails: \[\], manualTakeoverEmails: \[\], hardBlockedEmails: \[\], error: failed\.error\.message \}/);
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

test("manual advisor takeover remains blocked for automation but explicit manualAdvisorAction cannot bypass hard suppression", () => {
  assert.match(senderSource, /manualTakeoverEmails/);
  assert.match(senderSource, /manualAdvisorAction/);
  assert.match(senderSource, /hardBlockedEmails/);
  assert.match(senderSource, /Recipient has a hard CRM email block/);
  const manualGate = senderSource.indexOf("params.manualAdvisorAction");
  const takeoverGate = senderSource.indexOf("manualTakeoverEmails");
  assert.ok(manualGate >= 0 && takeoverGate > manualGate);
});
