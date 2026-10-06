import assert from "node:assert/strict";
import test from "node:test";
import { evaluateManualCustomerOutreach } from "./outreach-policy";
import { buildCustomerOutreachTemplates } from "./outreach";

test("manual takeover allows explicit Customer 360 send but keeps warning", () => {
  const result = evaluateManualCustomerOutreach({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    email_suppressed: true,
    suppression_reason: "manual_owner_takeover",
    nurture_status: "paused",
  }, { now: new Date("2026-10-06T12:00:00Z") });

  assert.equal(result.allowed, true);
  assert.ok(result.warnings.some((item) => /takeover/i.test(item)));
  assert.ok(result.warnings.some((item) => /Nurture er pauset/i.test(item)));
});

test("hard suppression cannot be bypassed by manual outreach", () => {
  const result = evaluateManualCustomerOutreach({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    email_suppressed: true,
    suppression_reason: "customer_unsubscribe",
  });

  assert.equal(result.allowed, false);
  assert.match(result.blockedReason || "", /CRM-sperre/);
});

test("ON_HOLD and future waiting dates block sales outreach", () => {
  const onHold = evaluateManualCustomerOutreach({
    email: "buyer@example.com",
    pipeline_status: "ON_HOLD",
    waiting_until: "2028-10-06T12:00:00Z",
  }, { now: new Date("2026-10-06T12:00:00Z") });
  assert.equal(onHold.allowed, false);
  assert.match(onHold.blockedReason || "", /ON_HOLD/);

  const waiting = evaluateManualCustomerOutreach({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    waiting_until: "2027-10-06T12:00:00Z",
  }, { now: new Date("2026-10-06T12:00:00Z") });
  assert.equal(waiting.allowed, false);
  assert.match(waiting.blockedReason || "", /ventetid/);
});

test("awaiting reply is a warning, not a hidden hard block for deliberate manual send", () => {
  const result = evaluateManualCustomerOutreach({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
  }, { awaitingReply: true });

  assert.equal(result.allowed, true);
  assert.ok(result.warnings.some((item) => /venter allerede på kundesvar/i.test(item)));
});

test("standard outreach templates use first name and brand website", () => {
  const templates = buildCustomerOutreachTemplates({ contactName: "Ola Nordmann", brandId: "zeneco" });
  assert.equal(templates.length, 5);
  assert.ok(templates.every((template) => template.body.startsWith("Hei Ola,")));
  assert.ok(templates.every((template) => template.body.includes("https://www.zenecohomes.com")));
  assert.ok(templates.some((template) => template.id === "soft_reconnect"));
  assert.ok(templates.some((template) => template.id === "short_call"));
});
