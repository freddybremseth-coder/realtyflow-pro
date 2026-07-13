import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmailReceivedRevenueEventInput,
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

test("buildMessageSentRevenueEventInput supports specialized source metadata", () => {
  const event = buildMessageSentRevenueEventInput({
    brandId: "zeneco",
    toAddresses: ["buyer@example.com"],
    subject: "Prospekt",
    bodyPreview: "Vedlagt prospekt.",
    sentAt: "2026-07-12T14:45:00.000Z",
    sourceSystem: "property_pdf",
    sourceType: "single_property_pdf",
    createdBy: "api/property-pdf/send",
    extraMetadata: {
      property_id: "property-1",
      filename: "Z-1-prospekt.pdf",
    },
  });

  assert.equal(event.sourceSystem, "property_pdf");
  assert.equal(event.sourceType, "single_property_pdf");
  assert.equal(event.createdBy, "api/property-pdf/send");
  assert.equal((event.metadata as Record<string, unknown>).property_id, "property-1");
  assert.equal((event.metadata as Record<string, unknown>).filename, "Z-1-prospekt.pdf");
});

test("buildEmailReceivedRevenueEventInput creates a customer inbound email event", () => {
  const event = buildEmailReceivedRevenueEventInput({
    brandId: "zeneco",
    fromAddress: " Buyer@Example.com ",
    fromName: "Anna Buyer",
    toAddresses: ["freddy@zenecohomes.com"],
    subject: "Vi vil gjerne booke en prat",
    bodyPreview: "Hei, vi har sett på områdene.",
    receivedAt: "2026-07-12T15:00:00.000Z",
    messageId: "<incoming-123@example.com>",
    threadId: "thread-123",
    storedEmailMessageId: "email-message-123",
    contactId: "contact-123",
  });

  assert.equal(event.eventType, "email_received");
  assert.equal(event.title, "E-post mottatt: Vi vil gjerne booke en prat");
  assert.equal(event.description, "Fra Anna Buyer <buyer@example.com>");
  assert.equal(event.contactId, "contact-123");
  assert.equal(event.brandId, "zeneco");
  assert.equal(event.sourceSystem, "email_inbox");
  assert.equal(event.sourceType, "inbound_email");
  assert.equal(event.sourceId, "incoming-123@example.com");
  assert.equal(event.actorType, "customer");
  assert.equal(event.confidenceScore, 88);
  assert.equal(event.dedupeKey, "email_inbox:zeneco:incoming-123-example-com:buyer-example-com:vi-vil-gjerne-booke-en-prat");
  assert.deepEqual(event.metadata, {
    from_address: "buyer@example.com",
    from_name: "Anna Buyer",
    to_addresses: ["freddy@zenecohomes.com"],
    subject: "Vi vil gjerne booke en prat",
    body_preview: "Hei, vi har sett på områdene.",
    smtp_message_id: "<incoming-123@example.com>",
    thread_id: "thread-123",
    stored_email_message_id: "email-message-123",
  });
});
