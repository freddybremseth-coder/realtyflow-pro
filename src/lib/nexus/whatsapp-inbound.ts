export type WhatsAppInboundMessage = {
  messageId: string;
  from: string;
  profileName?: string | null;
  text: string;
  timestamp?: string | null;
  brandId?: string | null;
};

export type WhatsAppLeadSignals = {
  budgetEur: number | null;
  areas: string[];
  bedrooms: number | null;
  timeline: string | null;
  propertyRefs: string[];
  intent: "GENERAL" | "PROPERTY_INTEREST" | "VIEWING" | "NEGOTIATION" | "NOT_INTERESTED";
  hotSignal: boolean;
};

export type WhatsAppAutoReplyDecision = {
  allowed: boolean;
  mode: "ACKNOWLEDGE" | "HANDOFF" | "NONE";
  reason: string;
  suggestedReply: string | null;
};

function normalizePhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseBudget(text: string) {
  const matches = [...text.matchAll(/(?:€|eur\s*)?([1-9][0-9]{2,6})(?:\s?k)?/gi)];
  const candidates = matches.map((match) => {
    const raw = Number(match[1]);
    const token = match[0].toLowerCase();
    return token.includes("k") ? raw * 1000 : raw;
  }).filter((value) => value >= 50_000 && value <= 10_000_000);
  return candidates.length ? Math.max(...candidates) : null;
}

function parseBedrooms(text: string) {
  const match = text.match(/\b([1-9])\s*(?:bed|beds|bedroom|bedrooms|soverom|dormitorio|dormitorios|hab(?:itaciones?)?)\b/i);
  return match ? Number(match[1]) : null;
}

function parseAreas(text: string) {
  const known = [
    "altea", "albir", "alfaz del pi", "l'alfas del pi", "benidorm", "finestrat", "villajoyosa", "la nucia", "polop",
    "calpe", "moraira", "javea", "xabia", "denia", "alicante", "pinoso", "biar", "villena", "sax", "aspe", "novelda",
  ];
  const lower = text.toLowerCase();
  return known.filter((area) => lower.includes(area));
}

function parsePropertyRefs(text: string) {
  const refs = [...text.matchAll(/\b(?:ref(?:erence)?[:#\s-]*)?([A-Z]{1,5}[-_]?[0-9]{2,8})\b/g)].map((match) => match[1]);
  return unique(refs);
}

function parseTimeline(text: string) {
  const lower = text.toLowerCase();
  if (/\b(asap|now|immediately|denne uken|this week|esta semana|ahora)\b/.test(lower)) return "ASAP";
  if (/\b(1|one|en|una?)\s*(?:month|mnd|måned|mes)\b/.test(lower)) return "WITHIN_1_MONTH";
  if (/\b(2|3|two|three|to|tre|dos|tres)\s*(?:months|mnd|måneder|meses)\b/.test(lower)) return "WITHIN_3_MONTHS";
  if (/\b(this year|i år|este año)\b/.test(lower)) return "THIS_YEAR";
  return null;
}

export function extractWhatsAppLeadSignals(text: string): WhatsAppLeadSignals {
  const lower = String(text || "").toLowerCase();
  const propertyRefs = parsePropertyRefs(text);
  const areas = parseAreas(text);
  const budgetEur = parseBudget(text);
  const bedrooms = parseBedrooms(text);
  const timeline = parseTimeline(text);

  let intent: WhatsAppLeadSignals["intent"] = "GENERAL";
  if (/not interested|ikke interessert|no me interesa|deja de escribir|stop/.test(lower)) intent = "NOT_INTERESTED";
  else if (/offer|tilbud|oferta|reserve|reservation|reservasjon|negotiat|forhandl/.test(lower)) intent = "NEGOTIATION";
  else if (/viewing|visning|visita|ver la vivienda|see the property/.test(lower)) intent = "VIEWING";
  else if (propertyRefs.length || /property|bolig|villa|apartment|apartamento|casa|chalet/.test(lower)) intent = "PROPERTY_INTEREST";

  const hotSignal = intent === "VIEWING" || intent === "NEGOTIATION" || timeline === "ASAP" || Boolean(budgetEur && propertyRefs.length);

  return { budgetEur, areas, bedrooms, timeline, propertyRefs, intent, hotSignal };
}

export function decideWhatsAppAutoReply(input: {
  signals: WhatsAppLeadSignals;
  isKnownContact: boolean;
  outsideBusinessHours?: boolean;
}): WhatsAppAutoReplyDecision {
  if (input.signals.intent === "NOT_INTERESTED") {
    return { allowed: false, mode: "NONE", reason: "Customer expressed negative intent; do not continue automated sales messaging.", suggestedReply: null };
  }

  if (input.signals.intent === "NEGOTIATION" || input.signals.intent === "VIEWING") {
    return {
      allowed: true,
      mode: "HANDOFF",
      reason: "High-intent message should be acknowledged immediately and escalated to sales.",
      suggestedReply: "Thanks — I’ve received this. I’m checking it now and we’ll come back to you shortly with the next concrete step.",
    };
  }

  return {
    allowed: true,
    mode: "ACKNOWLEDGE",
    reason: input.outsideBusinessHours ? "Acknowledge outside business hours so the lead knows the message is received." : "Fast acknowledgement reduces lead loss while sales automation processes the request.",
    suggestedReply: "Thanks for your message. We’ve received it and are checking the details now. We’ll get back to you shortly.",
  };
}

export function buildWhatsAppLeadMemory(message: WhatsAppInboundMessage) {
  const signals = extractWhatsAppLeadSignals(message.text);
  return {
    identity: {
      phone: normalizePhone(message.from),
      name: String(message.profileName || "").trim() || null,
    },
    dedupeKey: `whatsapp:${message.messageId}`,
    source: "whatsapp",
    sourceType: "customer_message",
    occurredAt: message.timestamp || new Date().toISOString(),
    rawText: message.text,
    signals,
    recommendedPriority: signals.hotSignal ? "HIGH" : "MEDIUM",
    recommendedNextAction: signals.intent === "VIEWING"
      ? "Confirm viewing preferences and propose a concrete time."
      : signals.intent === "NEGOTIATION"
        ? "Review deal context and respond with the next concrete negotiation step."
        : "Complete buyer profile and continue the sales conversation.",
  };
}
