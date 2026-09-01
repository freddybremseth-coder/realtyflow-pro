import assert from "node:assert/strict";
import test from "node:test";
import { assessEmailLink, buildEmailLinkHealth } from "./email-link-health";
import { filterOwnAddressEmailHealth } from "./email-link-health-own-addresses";

const contacts = [{ id: "c1", name: "Kari", email: "kari@example.com", brand_id: "soleada" }];

test("own active brand sender is excluded only when inbound and otherwise unlinked", () => {
  const health = buildEmailLinkHealth([
    { id: "own", direction: "inbound", from_address: " Freddy.Bremseth@gmail.com ", ai_intent: "inquiry" },
    { id: "external", direction: "inbound", from_address: "lead@gmail.com", ai_intent: "inquiry" },
  ], contacts);

  const result = filterOwnAddressEmailHealth(health, ["freddy.bremseth@gmail.com"]);
  assert.equal(result.summary.totalMessages, 2);
  assert.equal(result.summary.excludedSystemNotifications, 0);
  assert.equal(result.summary.excludedOwnAddresses, 1);
  assert.equal(result.summary.excludedNonCrm, 1);
  assert.equal(result.summary.messages, 1);
  assert.deepEqual(result.items.map((item) => item.message.id), ["external"]);
});

test("explicit conflict from own address remains visible", () => {
  const conflict = assessEmailLink({
    id: "own-conflict",
    direction: "inbound",
    from_address: "freddy.bremseth@gmail.com",
    matched_lead_id: "missing-contact",
  }, contacts);
  const health = {
    summary: { messages: 1, totalMessages: 1, excludedNonCrm: 0, linked: 0, exactCandidates: 0, ambiguous: 1, unlinked: 0, safeCoveragePercent: 0 },
    items: [conflict],
  };

  const result = filterOwnAddressEmailHealth(health, ["freddy.bremseth@gmail.com"]);
  assert.equal(result.summary.excludedOwnAddresses, 0);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.state, "ambiguous");
});

test("outbound mail from own address remains CRM-relevant", () => {
  const health = buildEmailLinkHealth([
    { id: "outbound", direction: "outbound", from_address: "freddy.bremseth@gmail.com", to_addresses: ["prospect@example.org"] },
  ], contacts);
  const result = filterOwnAddressEmailHealth(health, ["freddy.bremseth@gmail.com"]);
  assert.equal(result.summary.excludedOwnAddresses, 0);
  assert.equal(result.items.length, 1);
});
