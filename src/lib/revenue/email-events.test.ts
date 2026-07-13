import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMessageSentRevenueEventInput,
  normalizeEmailAddresses,
} from "@/lib/revenue/email-events";

test("normalizeEmailAddresses lowercases, validates and deduplicates recipients", () => {
  assert.deepEqual(
    normalizeEmailAddresses([" Buyer@Example.com ", "buyer@example.com", "not-email", "team@example.com"]),
    ["buyer@example.com", "team@example.com"]
  );
});

test("buildMessageSentRevenueEventInput creates a contact-linked draft reply event", () => {
  const event = buildMessageSentRevenueEventInput({
    brandId: "zeneco",
    toAddresses: ["buyer@example.com"],
    subject: "Her er boligene vi snakket om",
    bodyPreview: "Hei, her er tre forslag.",
    sentAt: "2026-07-12T14:00:00.000Z",
    messageId: "<smtp-123@example.com>",
    draftId: "draft-123",
    sentEmailMessageId: "outbound-123",
    originalEmailMessageId: "incoming-123",
    contactId: "contact-123",
  });

  assert.equal(event.eventType, "message_sent");
  assert.equal(event.title, "E-post sendt: Her er boligene vi snakket om");
  assert.equal(event.description, "Sendt til buyer@example.com");
  assert.equal(event.contactId, "contact-123");
  assert.equal(event.brandId, "zeneco");
  assert.equal(event.sourceSystem, "email_send");
  assert.equal(event.sourceType, "draft_reply");
  assert.equal(event.sourceId, "smtp-123@example.com");
  assert.equal(event.actorType, "human");
  assert.equal(event.confidenceScore, 86);
  assert.equal(event.dedupeKey, "email_send:zeneco:smtp-123-example-com:buyer-example-com:her-er-boligene-vi-snakket-om");
  assert.deepEqual(event.metadata, {
    to_addresses: ["buyer@example.com"],
    subject: "Her er boligene vi snakket om",
    body_preview: "Hei, her er tre forslag.",
    smtp_message_id: "<smtp-123@example.com>",
    draft_id: "draft-123",
    sent_email_message_id: "outbound-123",
    original_email_message_id: "incoming-123",
    primary_recipient: "buyer@example.com",
  });
});

test("buildMessageSentRevenueEventInput supports direct sends without a matched contact", () => {
  const event = buildMessageSentRevenueEventInput({
    brandId: "soleada",
    toAddresses: ["external@example.com"],
    subject: "",
    bodyPreview: "",
    sentAt: "2026-07-12T14:30:00.000Z",
  });

  assert.equal(event.title, "E-post sendt");
  assert.equal(event.sourceType, "direct_email");
  assert.equal(event.contactId, null);
  assert.equal(event.confidenceScore, 62);
});
