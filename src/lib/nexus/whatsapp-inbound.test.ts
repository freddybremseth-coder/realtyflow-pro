import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWhatsAppLeadMemory,
  decideWhatsAppAutoReply,
  extractWhatsAppLeadSignals,
} from "@/lib/nexus/whatsapp-inbound";

test("extracts essential buyer signals from WhatsApp text", () => {
  const signals = extractWhatsAppLeadSignals("Hi, interested in villa AB-1234 in Altea. Budget €650k, 3 bedrooms, want viewing this week.");
  assert.equal(signals.budgetEur, 650000);
  assert.equal(signals.bedrooms, 3);
  assert.deepEqual(signals.areas, ["altea"]);
  assert.deepEqual(signals.propertyRefs, ["AB-1234"]);
  assert.equal(signals.timeline, "ASAP");
  assert.equal(signals.intent, "VIEWING");
  assert.equal(signals.hotSignal, true);
});

test("negative intent disables automated sales response", () => {
  const signals = extractWhatsAppLeadSignals("No me interesa, stop please");
  const decision = decideWhatsAppAutoReply({ signals, isKnownContact: true });
  assert.equal(signals.intent, "NOT_INTERESTED");
  assert.equal(decision.allowed, false);
  assert.equal(decision.mode, "NONE");
});

test("high-intent viewing gets immediate acknowledgement and handoff", () => {
  const signals = extractWhatsAppLeadSignals("Can I see property ZX9988 tomorrow in Benidorm?");
  const decision = decideWhatsAppAutoReply({ signals, isKnownContact: false });
  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "HANDOFF");
  assert.ok(decision.suggestedReply);
});

test("memory payload is deduplicated by WhatsApp message id and phone identity", () => {
  const memory = buildWhatsAppLeadMemory({
    messageId: "wamid.abc",
    from: "34 600 123 456",
    profileName: "Maria",
    text: "Looking for an apartment in Finestrat, budget 300000",
    timestamp: "2026-09-05T12:00:00Z",
  });
  assert.equal(memory.dedupeKey, "whatsapp:wamid.abc");
  assert.equal(memory.identity.phone, "+34600123456");
  assert.equal(memory.identity.name, "Maria");
  assert.equal(memory.signals.budgetEur, 300000);
  assert.deepEqual(memory.signals.areas, ["finestrat"]);
});
