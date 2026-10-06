import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/customers/[contactId]/outreach/route.ts"),
  "utf8",
);
const card = fs.readFileSync(
  path.join(process.cwd(), "src/components/crm/crm-customer-card.tsx"),
  "utf8",
);
const sender = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/send-brand-email.ts"),
  "utf8",
);
const suppression = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/email-suppression.ts"),
  "utf8",
);

test("Customer 360 outreach has standard, AI and manual composition modes", () => {
  assert.match(card, /1\. Standard e-post/);
  assert.match(card, /2\. AI fra tema\/stikkord/);
  assert.match(card, /3\. Skriv selv/);
  assert.match(card, /Lag e-postutkast/);
  assert.match(card, /Send e-post nå/);
});

test("Customer 360 outreach requires explicit reviewed confirmation before send", () => {
  assert.match(route, /confirmReviewed:\s*z\.literal\(true\)/);
  assert.match(card, /window\.confirm/);
  assert.match(card, /E-posten sendes med en gang/);
});

test("AI generation cannot itself send email", () => {
  const generateIndex = route.indexOf('parsed.data.action === "GENERATE"');
  const manualSendIndex = route.indexOf("const freshLoaded", generateIndex);
  assert.ok(generateIndex >= 0 && manualSendIndex > generateIndex);
  const generateBlock = route.slice(generateIndex, manualSendIndex);
  assert.doesNotMatch(generateBlock, /await sendBrandEmail/);
  assert.ok(route.indexOf("await sendBrandEmail", manualSendIndex) > manualSendIndex);
});

test("manual Customer 360 send rechecks eligibility and hard suppression immediately before provider send", () => {
  assert.match(route, /const freshLoaded = await loadContext/);
  assert.match(route, /if \(!freshLoaded\.eligibility\.allowed\)/);
  assert.match(route, /manualAdvisorAction:\s*true/);
  assert.match(route, /crmContactId:\s*freshLoaded\.contact\.id/);
  assert.ok(route.indexOf("const freshLoaded") < route.indexOf("await sendBrandEmail"));
});

test("manual advisor action bypasses takeover only, never hard CRM suppression", () => {
  assert.match(suppression, /hardBlockedEmails/);
  assert.match(sender, /params\.manualAdvisorAction/);
  assert.match(sender, /suppression\.hardBlockedEmails/);
  assert.match(sender, /Recipient has a hard CRM email block/);
});

test("outreach route is permissioned and logs the manual send back to Customer 360", () => {
  assert.match(route, /getRequestAccessContext/);
  assert.match(route, /customers\.write/);
  assert.match(route, /manual_outreach_email/);
  assert.match(route, /customer-360-outreach/);
  assert.match(route, /appendCustomerInteraction/);
});
