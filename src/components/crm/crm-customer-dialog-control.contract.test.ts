import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const cardSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/crm/crm-customer-card.tsx"),
  "utf8",
);
const controlSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/customers/[contactId]/communication-control/route.ts"),
  "utf8",
);
const suppressionSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/email-suppression.ts"),
  "utf8",
);

test("Customer 360 shows latest sent mail and latest customer reply on overview", () => {
  assert.match(cardSource, /Siste dialog/);
  assert.match(cardSource, /Sist sendt/);
  assert.match(cardSource, /Siste svar fra kunden/);
  assert.match(cardSource, /latestSentMessage/);
  assert.match(cardSource, /latestReplyMessage/);
  assert.match(cardSource, /Venter på svar|venter på kundesvar/);
});

test("Customer 360 exposes explicit manual takeover control", () => {
  assert.match(cardSource, /Jeg tar over kunden/);
  assert.match(cardSource, /Du har tatt over · auto e-post stoppet/);
  assert.match(cardSource, /communication-control/);
  assert.match(cardSource, /Gi tilbake til Nexus/);
});

test("manual takeover writes a CRM suppression that cannot overwrite stronger opt-out state", () => {
  assert.match(controlSource, /manual_owner_takeover/);
  assert.match(controlSource, /email_suppressed: true/);
  assert.match(controlSource, /nurture_status: "paused"/);
  assert.match(controlSource, /sterkere CRM-sperre/);
  assert.match(controlSource, /do_not_contact/);
});

test("central suppression gate recognizes manual takeover recipients", () => {
  assert.match(suppressionSource, /manualTakeoverEmails/);
  assert.match(suppressionSource, /manual_owner_takeover/);
  assert.match(suppressionSource, /blockedEmails/);
});
