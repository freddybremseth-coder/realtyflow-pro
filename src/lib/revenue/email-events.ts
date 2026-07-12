import {
  buildRevenueEventDedupeKey,
  type RevenueEventInput,
} from "@/lib/revenue/events";

function clean(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function cleanMessageId(value: unknown) {
  return clean(value)?.replace(/^<+|>+$/g, "") || null;
}

export function normalizeEmailAddresses(addresses: unknown): string[] {
  const list = Array.isArray(addresses) ? addresses : [addresses];
  return Array.from(
    new Set(
      list
        .map((address) => String(address || "").trim().toLowerCase())
        .filter((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    )
  );
}

export function buildMessageSentRevenueEventInput({
  brandId,
  toAddresses,
  subject,
  bodyPreview,
  sentAt,
  messageId,
  draftId,
  sentEmailMessageId,
  originalEmailMessageId,
  contactId,
  actorType = "human",
}: {
  brandId: string;
  toAddresses: string[];
  subject: string;
  bodyPreview: string;
  sentAt: string;
  messageId?: string | null;
  draftId?: string | null;
  sentEmailMessageId?: string | null;
  originalEmailMessageId?: string | null;
  contactId?: string | null;
  actorType?: "human" | "ai" | "automation" | "system";
}): RevenueEventInput {
  const primaryRecipient = normalizeEmailAddresses(toAddresses)[0] || clean(toAddresses[0]);
  const sourceId = cleanMessageId(messageId) || clean(draftId) || clean(sentEmailMessageId) || null;

  return {
    eventType: "message_sent",
    title: subject ? `E-post sendt: ${subject}` : "E-post sendt",
    description: primaryRecipient ? `Sendt til ${primaryRecipient}` : null,
    contactId: contactId || null,
    brandId,
    sourceSystem: "email_send",
    sourceType: draftId ? "draft_reply" : "direct_email",
    sourceId,
    actorType,
    confidenceScore: contactId ? 86 : 62,
    occurredAt: sentAt,
    dedupeKey: buildRevenueEventDedupeKey([
      "email_send",
      brandId,
      sourceId,
      primaryRecipient,
      subject,
    ]),
    metadata: {
      to_addresses: normalizeEmailAddresses(toAddresses),
      subject,
      body_preview: bodyPreview,
      smtp_message_id: messageId || null,
      draft_id: draftId || null,
      sent_email_message_id: sentEmailMessageId || null,
      original_email_message_id: originalEmailMessageId || null,
      primary_recipient: primaryRecipient,
    },
    createdBy: "api/email/send",
  };
}

export function buildEmailReceivedRevenueEventInput({
  brandId,
  fromAddress,
  fromName,
  toAddresses,
  subject,
  bodyPreview,
  receivedAt,
  messageId,
  threadId,
  storedEmailMessageId,
  contactId,
}: {
  brandId: string;
  fromAddress?: string | null;
  fromName?: string | null;
  toAddresses: string[];
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  messageId?: string | null;
  threadId?: string | null;
  storedEmailMessageId?: string | null;
  contactId?: string | null;
}): RevenueEventInput {
  const normalizedFrom = normalizeEmailAddresses([fromAddress])[0] || clean(fromAddress);
  const sourceId = cleanMessageId(messageId) || clean(storedEmailMessageId) || null;

  return {
    eventType: "email_received",
    title: subject ? `E-post mottatt: ${subject}` : "E-post mottatt",
    description: normalizedFrom ? `Fra ${fromName ? `${fromName} <${normalizedFrom}>` : normalizedFrom}` : null,
    contactId: contactId || null,
    brandId,
    sourceSystem: "email_inbox",
    sourceType: "inbound_email",
    sourceId,
    actorType: "customer",
    confidenceScore: contactId ? 88 : 66,
    occurredAt: receivedAt,
    dedupeKey: buildRevenueEventDedupeKey([
      "email_inbox",
      brandId,
      sourceId,
      normalizedFrom,
      subject,
    ]),
    metadata: {
      from_address: normalizedFrom,
      from_name: fromName || null,
      to_addresses: normalizeEmailAddresses(toAddresses),
      subject,
      body_preview: bodyPreview,
      smtp_message_id: messageId || null,
      thread_id: threadId || null,
      stored_email_message_id: storedEmailMessageId || null,
    },
    createdBy: "api/email/inbox",
  };
}
