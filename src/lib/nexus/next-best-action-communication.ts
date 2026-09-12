import type { RevenueBrainAction, RevenueBrainSnapshot } from "@/lib/nexus/revenue-brain";

export interface CommunicationLearningRule {
  id?: string;
  brand_id?: string | null;
  dimension?: string | null;
  value?: string | null;
  sample?: number | null;
  reply_rate?: number | null;
  evidence?: string | null;
  verdict?: string | null;
  finding?: string | null;
  status?: string | null;
}

export interface NexusCommunicationAdvice {
  brand: string | null;
  recommendationOnly: true;
  evidence: "none" | "moderate" | "strong";
  timing: {
    preferredHourUtc: number | null;
    preferredWeekdayUtc: string | null;
    avoidHourUtc: number[];
    avoidWeekdayUtc: string[];
  };
  message: {
    preferredTone: string | null;
    preferredLanguage: string | null;
    preferredIntent: string | null;
    preferredLength: string | null;
    avoidTone: string[];
    avoidIntent: string[];
    avoidLength: string[];
  };
  reasons: string[];
}

export type RevenueBrainActionWithCommunication = RevenueBrainAction & {
  communicationAdvice: NexusCommunicationAdvice;
};

export type RevenueBrainWithCommunication = Omit<RevenueBrainSnapshot, "actions"> & {
  actions: RevenueBrainActionWithCommunication[];
  communicationLearning: {
    recommendationOnly: true;
    policyCanBeChanged: false;
    customerSendEnabled: false;
    advisedActions: number;
  };
};

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function usable(rule: CommunicationLearningRule) {
  return normalized(rule.status || "active") === "active"
    && ["moderate", "strong"].includes(normalized(rule.evidence))
    && ["prefer", "avoid"].includes(normalized(rule.verdict))
    && Number(rule.sample || 0) >= 10;
}

function contactBrand(contact: any) {
  return normalized(contact?.brand_id || contact?.brand) || null;
}

function bestPreferred(rules: CommunicationLearningRule[], dimension: string) {
  return rules
    .filter((rule) => normalized(rule.dimension) === dimension && normalized(rule.verdict) === "prefer")
    .sort((a, b) => {
      const evidenceDiff = (normalized(b.evidence) === "strong" ? 1 : 0) - (normalized(a.evidence) === "strong" ? 1 : 0);
      if (evidenceDiff) return evidenceDiff;
      const replyDiff = Number(b.reply_rate || 0) - Number(a.reply_rate || 0);
      if (replyDiff) return replyDiff;
      return Number(b.sample || 0) - Number(a.sample || 0);
    })[0] || null;
}

function avoided(rules: CommunicationLearningRule[], dimension: string) {
  return rules
    .filter((rule) => normalized(rule.dimension) === dimension && normalized(rule.verdict) === "avoid")
    .sort((a, b) => Number(b.sample || 0) - Number(a.sample || 0))
    .map((rule) => String(rule.value || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function adviceForBrand(brand: string | null, rules: CommunicationLearningRule[]): NexusCommunicationAdvice {
  const brandRules = brand
    ? rules.filter((rule) => normalized(rule.brand_id) === brand && usable(rule))
    : [];
  const hour = bestPreferred(brandRules, "send_hour_utc");
  const weekday = bestPreferred(brandRules, "weekday_utc");
  const tone = bestPreferred(brandRules, "tone");
  const language = bestPreferred(brandRules, "language");
  const intent = bestPreferred(brandRules, "intent");
  const length = bestPreferred(brandRules, "message_length");
  const preferred = [hour, weekday, tone, language, intent, length].filter(Boolean) as CommunicationLearningRule[];
  const strongest = preferred.some((rule) => normalized(rule.evidence) === "strong")
    ? "strong"
    : preferred.length || brandRules.length ? "moderate" : "none";
  const reasons = preferred
    .map((rule) => String(rule.finding || "").trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    brand,
    recommendationOnly: true,
    evidence: strongest,
    timing: {
      preferredHourUtc: hour && /^\d{1,2}$/.test(String(hour.value || "")) ? Number(hour.value) : null,
      preferredWeekdayUtc: weekday ? String(weekday.value || "").trim() || null : null,
      avoidHourUtc: avoided(brandRules, "send_hour_utc").map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 23),
      avoidWeekdayUtc: avoided(brandRules, "weekday_utc"),
    },
    message: {
      preferredTone: tone ? String(tone.value || "").trim() || null : null,
      preferredLanguage: language ? String(language.value || "").trim() || null : null,
      preferredIntent: intent ? String(intent.value || "").trim() || null : null,
      preferredLength: length ? String(length.value || "").trim() || null : null,
      avoidTone: avoided(brandRules, "tone"),
      avoidIntent: avoided(brandRules, "intent"),
      avoidLength: avoided(brandRules, "message_length"),
    },
    reasons,
  };
}

export function attachCommunicationLearningToRevenueBrain(input: {
  brain: RevenueBrainSnapshot;
  contacts: any[];
  rules: CommunicationLearningRule[];
}): RevenueBrainWithCommunication {
  const contactsById = new Map((input.contacts || []).map((contact) => [String(contact?.id || ""), contact]));
  const actions = input.brain.actions.map((action): RevenueBrainActionWithCommunication => {
    const contact = action.contactId ? contactsById.get(String(action.contactId)) : null;
    return {
      ...action,
      communicationAdvice: adviceForBrand(contactBrand(contact), input.rules || []),
    };
  });

  return {
    ...input.brain,
    actions,
    communicationLearning: {
      recommendationOnly: true,
      policyCanBeChanged: false,
      customerSendEnabled: false,
      advisedActions: actions.filter((action) => action.communicationAdvice.evidence !== "none").length,
    },
  };
}
