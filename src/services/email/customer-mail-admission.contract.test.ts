import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const admission = fs.readFileSync(new URL("./customer-mail-admission.ts", import.meta.url), "utf8");
const ingest = fs.readFileSync(new URL("../../app/api/cron/email-ingest/route.ts", import.meta.url), "utf8");
const history = fs.readFileSync(new URL("./history-backfill-worker.ts", import.meta.url), "utf8");
const crmBoundary = fs.readFileSync(new URL("./apply-inbound-crm-actions-safe.ts", import.meta.url), "utf8");

test("customer admission fails closed for non-customer and unknown identities", () => {
  assert.match(admission, /kind !== "customer"/);
  assert.match(admission, /owned_mailbox_address/);
  assert.match(admission, /internal_same_domain/);
  assert.match(admission, /duplicate_global_contact_email/);
  assert.match(admission, /unknown_sender_candidate/);
  assert.match(admission, /vendor_outreach/);
});

test("exact global customer and customer-thread evidence can pass admission across brands", () => {
  assert.match(admission, /exact_global_contact/);
  assert.match(admission, /resolved_customer_thread/);
  assert.match(admission, /outbound_exact_global_contact/);
  assert.match(crmBoundary, /rows\.length !== 1/);
  assert.doesNotMatch(crmBoundary, /rows\[0\]\.brand_id.*params\.brandId/);
});

test("non-customer decisions are quarantined instead of becoming CRM messages", () => {
  assert.match(admission, /email_admission_queue/);
  assert.match(admission, /admission_status/);
  assert.match(admission, /keepBody = input\.decision\.status === "review"/);
});

test("live ingest gates every new message before email_messages insert", () => {
  const decisionIndex = ingest.indexOf("decideCustomerMailAdmission");
  const insertIndex = ingest.indexOf('.from("email_messages").insert');
  assert.ok(decisionIndex >= 0);
  assert.ok(insertIndex > decisionIndex);
  assert.match(ingest, /decision\.status !== "accept"/);
  assert.match(ingest, /recordCustomerMailAdmission/);
  assert.match(ingest, /ownedMailboxAddresses/);
  assert.match(ingest, /total_filtered/);
  assert.match(ingest, /total_review/);
});

test("history backfill uses the same customer admission boundary", () => {
  assert.match(history, /decideCustomerMailAdmission/);
  assert.match(history, /recordCustomerMailAdmission/);
  assert.match(history, /ownedMailboxAddresses/);
  assert.match(history, /total_filtered/);
  assert.match(history, /total_review/);
  assert.match(history, /loadCustomerMailAdmissionIds/);
});


test("live review candidates are promoted before historical review backlog", () => {
  const historicalOrder = admission.indexOf('.order("is_historical", { ascending: true })');
  const receivedOrder = admission.indexOf('.order("received_at", { ascending: false })', historicalOrder);
  assert.ok(historicalOrder >= 0);
  assert.ok(receivedOrder > historicalOrder);
});
