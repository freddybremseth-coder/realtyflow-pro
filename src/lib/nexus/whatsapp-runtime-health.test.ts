import assert from "node:assert/strict";
import test from "node:test";
import { classifyWhatsAppRuntimeHealth } from "./whatsapp-runtime-health";

const now = Date.parse("2026-09-05T14:00:00.000Z");

function base() {
  return {
    lastWebhookAt: "2026-09-05T13:30:00.000Z",
    lastWebhookStatus: "success",
    webhookRuns24h: 4,
    webhookFailures24h: 0,
    webhookPartial24h: 0,
    persistedMessages24h: 5,
    unresolvedReferrals: 0,
    overdueWhatsAppWorkItems: 0,
  };
}

test("healthy runtime evidence stays healthy", () => {
  const result = classifyWhatsAppRuntimeHealth(base(), now);
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.score, 100);
});

test("unresolved referrals and overdue work degrade runtime health", () => {
  const result = classifyWhatsAppRuntimeHealth({ ...base(), unresolvedReferrals: 2, overdueWhatsAppWorkItems: 2 }, now);
  assert.equal(result.status, "DEGRADED");
  assert.ok(result.score < 85);
  assert.ok(result.reasons.some((reason) => reason.includes("unresolved Soleada")));
});

test("multiple failures put WhatsApp at risk", () => {
  const result = classifyWhatsAppRuntimeHealth({ ...base(), webhookFailures24h: 4, webhookPartial24h: 2 }, now);
  assert.equal(result.status, "AT_RISK");
  assert.ok(result.score < 55);
});

test("no runtime evidence is unknown rather than falsely healthy", () => {
  const result = classifyWhatsAppRuntimeHealth({
    lastWebhookAt: null,
    lastWebhookStatus: null,
    webhookRuns24h: 0,
    webhookFailures24h: 0,
    webhookPartial24h: 0,
    persistedMessages24h: 0,
    unresolvedReferrals: 0,
    overdueWhatsAppWorkItems: 0,
  }, now);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.score, 50);
});
