import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  parseMetaWhatsAppWebhook,
  parsePhoneBrandMap,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/lib/nexus/whatsapp-meta";

test("webhook challenge requires exact verify token", () => {
  assert.deepEqual(verifyMetaWebhookChallenge({
    mode: "subscribe",
    verifyToken: "secret",
    challenge: "12345",
    expectedToken: "secret",
  }), { ok: true, challenge: "12345" });
  assert.equal(verifyMetaWebhookChallenge({
    mode: "subscribe",
    verifyToken: "wrong",
    challenge: "12345",
    expectedToken: "secret",
  }).ok, false);
});

test("webhook signature uses sha256 app-secret HMAC", () => {
  const raw = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifyMetaWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(`${raw}x`, signature, secret), false);
  assert.equal(verifyMetaWebhookSignature(raw, null, secret), false);
});

test("parser extracts text messages, sender profile and brand mapping", () => {
  const messages = parseMetaWhatsAppWebhook({
    entry: [{
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "pn-1" },
          contacts: [{ wa_id: "34600111222", profile: { name: "Maria" } }],
          messages: [{
            id: "wamid.1",
            from: "34600111222",
            timestamp: "1788600000",
            type: "text",
            text: { body: "I want a viewing in Altea, budget 500k" },
          }],
        },
      }],
    }],
  }, { "pn-1": "zenecohomes" });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].messageId, "wamid.1");
  assert.equal(messages[0].from, "34600111222");
  assert.equal(messages[0].profileName, "Maria");
  assert.equal(messages[0].brandId, "zenecohomes");
  assert.equal(messages[0].phoneNumberId, "pn-1");
});

test("parser accepts interactive replies and ignores delivery statuses", () => {
  const messages = parseMetaWhatsAppWebhook({
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "pn-2" },
      statuses: [{ id: "wamid.sent", status: "delivered" }],
      messages: [{
        id: "wamid.2",
        from: "34600999888",
        type: "interactive",
        interactive: { button_reply: { id: "viewing", title: "Book a viewing" } },
      }],
    } }] }],
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Book a viewing");
});

test("phone-to-brand map is configuration only and fails closed on invalid JSON", () => {
  assert.deepEqual(parsePhoneBrandMap('{"111":"soleada","222":"zenecohomes"}'), { 111: "soleada", 222: "zenecohomes" });
  assert.deepEqual(parsePhoneBrandMap("not-json"), {});
});
