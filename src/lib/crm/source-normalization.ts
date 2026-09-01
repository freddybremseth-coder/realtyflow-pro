export type CrmSourceType =
  | "legacy_crm"
  | "brand_source"
  | "manual"
  | "web_form"
  | "campaign"
  | "social"
  | "property_portal"
  | "referral"
  | "partner"
  | "email"
  | "direct"
  | "event"
  | "unknown"
  | "other";

export type SourceConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface NormalizedCrmSource {
  rawSource: string;
  sourceType: CrmSourceType;
  sourceDetail: string;
  confidence: SourceConfidence;
  acquisitionChannelKnown: boolean;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function token(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCrmSource(raw: unknown): NormalizedCrmSource {
  const rawSource = clean(raw);
  const value = token(rawSource);

  if (!value) return { rawSource, sourceType: "unknown", sourceDetail: "Unknown", confidence: "UNKNOWN", acquisitionChannelKnown: false };

  // Historical CRM provenance is not the same thing as acquisition channel.
  if (/^kommo(?:-event)?$/.test(value)) {
    return { rawSource, sourceType: "legacy_crm", sourceDetail: "Kommo", confidence: "HIGH", acquisitionChannelKnown: false };
  }
  if (["soleada", "soleada-no"].includes(value)) {
    return { rawSource, sourceType: "brand_source", sourceDetail: "Soleada.no", confidence: "HIGH", acquisitionChannelKnown: false };
  }
  if (["manual", "manuell"].includes(value)) {
    return { rawSource, sourceType: "manual", sourceDetail: "Manual entry", confidence: "HIGH", acquisitionChannelKnown: false };
  }
  if (["zenecohomes-home", "zeneco-home", "zeneco-home-form"].includes(value)) {
    return { rawSource, sourceType: "web_form", sourceDetail: "ZenEcoHomes home form", confidence: "HIGH", acquisitionChannelKnown: true };
  }

  if (/instagram|facebook|meta|youtube|tiktok/.test(value)) return { rawSource, sourceType: "social", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/idealista|fotocasa|kyero|thinkspain|rightmove|finn|portal/.test(value)) return { rawSource, sourceType: "property_portal", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/google.*ads|adwords|cpc|ppc|campaign|kampanje/.test(value)) return { rawSource, sourceType: "campaign", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/website|web|landing|form|public-lead/.test(value)) return { rawSource, sourceType: "web_form", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/referral|recommend|anbefal|friend|venn/.test(value)) return { rawSource, sourceType: "referral", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/partner|agent|megler|broker|collab|samarbeid/.test(value)) return { rawSource, sourceType: "partner", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/email|newsletter|mailchimp|brevo/.test(value)) return { rawSource, sourceType: "email", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/direct|direkte|phone|telefon|walk-in/.test(value)) return { rawSource, sourceType: "direct", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };
  if (/seminar|webinar|messe|visningstur|^event$/.test(value)) return { rawSource, sourceType: "event", sourceDetail: rawSource, confidence: "MEDIUM", acquisitionChannelKnown: true };

  return { rawSource, sourceType: "other", sourceDetail: rawSource, confidence: "LOW", acquisitionChannelKnown: false };
}
