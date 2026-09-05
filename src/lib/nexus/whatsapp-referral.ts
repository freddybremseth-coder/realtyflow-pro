import type { WhatsAppInboundMessage } from "@/lib/nexus/whatsapp-inbound";

export type WhatsAppReferralResolution = {
  mode: "DIRECT" | "REFERRAL_RESOLVED" | "REFERRAL_UNRESOLVED";
  message: WhatsAppInboundMessage | null;
  referrer: { name: string | null; phone: string } | null;
  customer: { name: string | null; phone: string | null } | null;
  reason: string;
};

const DEFAULT_REFERRER_NAMES = ["hans kristian", "roar haug"];

function normalizeName(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? `+${digits}` : "";
}

function configuredReferrerNames(raw?: string | null) {
  const extra = String(raw || "").split(",").map(normalizeName).filter(Boolean);
  return [...new Set([...DEFAULT_REFERRER_NAMES, ...extra])];
}

export function isKnownSoleadaReferrer(profileName: unknown, configuredNames?: string | null) {
  const name = normalizeName(profileName);
  if (!name) return false;
  return configuredReferrerNames(configuredNames).some((candidate) => name === candidate || name.includes(candidate));
}

function extractCustomerPhone(text: string, senderPhone: string) {
  const sender = normalizePhone(senderPhone);
  const candidates = [...String(text || "").matchAll(/(?:\+|00)?\d[\d\s().-]{6,18}\d/g)]
    .map((match) => normalizePhone(match[0].replace(/^00/, "+")))
    .filter((phone) => phone && phone !== sender);
  return candidates[0] || null;
}

function extractCustomerName(text: string) {
  const patterns = [
    /(?:kunde|kunden|customer|client|lead|navn|name)\s*[:\-]\s*([\p{L}][\p{L} .'-]{1,70})/iu,
    /(?:heter|is called|se llama)\s+([\p{L}][\p{L} .'-]{1,70})/iu,
  ];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[,.].*$/, "").trim() || null;
  }
  return null;
}

export function resolveWhatsAppLeadIdentity(
  message: WhatsAppInboundMessage,
  options?: { configuredReferrerNames?: string | null },
): WhatsAppReferralResolution {
  const senderPhone = normalizePhone(message.from);
  const referrer = isKnownSoleadaReferrer(message.profileName, options?.configuredReferrerNames);
  if (!referrer) {
    return {
      mode: "DIRECT",
      message,
      referrer: null,
      customer: { name: message.profileName || null, phone: senderPhone || null },
      reason: "Sender is treated as the customer.",
    };
  }

  const customerPhone = extractCustomerPhone(message.text, senderPhone);
  const customerName = extractCustomerName(message.text);
  const referrerContext = { name: message.profileName || null, phone: senderPhone };

  if (!customerPhone) {
    return {
      mode: "REFERRAL_UNRESOLVED",
      message: null,
      referrer: referrerContext,
      customer: { name: customerName, phone: null },
      reason: "Known Soleada referrer sent a lead, but no separate customer phone number was found in the message.",
    };
  }

  return {
    mode: "REFERRAL_RESOLVED",
    message: {
      ...message,
      from: customerPhone,
      profileName: customerName || undefined,
      text: `${message.text}\n\n[Referral source: ${message.profileName || "Soleada"}; sender ${senderPhone}]`,
    },
    referrer: referrerContext,
    customer: { name: customerName, phone: customerPhone },
    reason: "Known Soleada referrer detected; CRM identity resolved from customer details in the message.",
  };
}
