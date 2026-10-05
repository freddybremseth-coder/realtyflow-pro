import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/customers/[contactId]/communication-control/route.ts"),
  "utf8",
);
const cardSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/crm/crm-customer-card.tsx"),
  "utf8",
);
const customer360Source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/customers/[contactId]/360/route.ts"),
  "utf8",
);
const suppressionSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/email-suppression.ts"),
  "utf8",
);
const sendBrandEmailSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/send-brand-email.ts"),
  "utf8",
);

test("manual takeover requires customer write access and never changes pipeline status", () => {
  assert.match(routeSource, /customers\.write/);
  assert.match(routeSource, /manual_owner_takeover/);
  assert.match(routeSource, /email_suppressed: true/);
  assert.match(routeSource, /nurture_status: "paused"/);
  assert.doesNotMatch(routeSource, /pipeline_status:/);
});

test("manual takeover is a hard system-email block even for allowSuppressed sends", () => {
  assert.match(suppressionSource, /manualTakeoverEmails/);
  assert.match(suppressionSource, /manual_owner_takeover/);
  assert.match(sendBrandEmailSource, /suppression\.manualTakeoverEmails\.length > 0/);
  const takeoverGate = sendBrandEmailSource.indexOf("suppression.manualTakeoverEmails.length > 0");
  const allowSuppressedGate = sendBrandEmailSource.indexOf("!params.allowSuppressed");
  assert.ok(takeoverGate >= 0 && allowSuppressedGate >= 0 && takeoverGate < allowSuppressedGate);
});

test("Customer 360 combines CRM-linked and email-address-linked customer messages", () => {
  assert.match(customer360Source, /crm_contact_id\.eq/);
  assert.match(customer360Source, /\.ilike\("from_address", email\)/);
  assert.match(customer360Source, /\.contains\("to_addresses", \[email\]\)/);
  assert.match(customer360Source, /communicationDialogue/);
  assert.match(customer360Source, /awaitingReply/);
  assert.match(customer360Source, /manualTakeover/);
});

test("customer card exposes sent-versus-reply dialogue and takeover button", () => {
  assert.match(cardSource, /"dialog", "E-post & svar"/);
  assert.match(cardSource, /Jeg tar over kunden/);
  assert.match(cardSource, /Gi tilbake til Nexus/);
  assert.match(cardSource, /SENDT/);
  assert.match(cardSource, /SVAR/);
  assert.match(cardSource, /STOPPET AV DEG/);
  assert.match(cardSource, /communication-control/);
});
