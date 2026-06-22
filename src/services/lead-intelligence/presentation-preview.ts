import { LEAD_INTELLIGENCE_LIMITS } from "./contracts";

export interface LeadCustomerPresentationPreviewProperty {
  propertyId: string | null;
  reference: string | null;
  title: string;
  location: string | null;
  imageUrl: string | null;
  publicUrl: string | null;
  facts: string[];
  decision: string | null;
  systemEligibility: string | null;
  score: number | null;
  dataQualityScore: number | null;
  reasons: string[];
  concerns: string[];
  questionsToVerify: string[];
}

export interface LeadCustomerPresentationPreview {
  summary: string | null;
  budget: {
    amount: number | null;
    currency: string | null;
    includesCosts: boolean | null;
    approximate: boolean | null;
  } | null;
  needs: string[];
  verification: string[];
  properties: LeadCustomerPresentationPreviewProperty[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeText(value: unknown, limit: number = LEAD_INTELLIGENCE_LIMITS.mediumText) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function safeUrl(value: unknown) {
  const text = safeText(value, LEAD_INTELLIGENCE_LIMITS.longText);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeTextArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => safeText(item))
        .filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, limit);
}

function findSection(sections: unknown, type: string) {
  if (!Array.isArray(sections)) return null;
  return sections.map(asRecord).find((section) => section?.type === type) || null;
}

export function buildLeadCustomerPresentationPreview(value: unknown): LeadCustomerPresentationPreview {
  const root = asRecord(value);
  const budget = asRecord(root?.budget);
  const needsSection = findSection(root?.sections, "needs_summary");
  const propertiesSection = findSection(root?.sections, "properties");
  const verificationSection = findSection(root?.sections, "verification");
  const propertyItems = Array.isArray(propertiesSection?.items)
    ? propertiesSection.items
    : Array.isArray(root?.properties)
      ? root.properties
      : [];

  return {
    summary: safeText(root?.summary),
    budget: budget
      ? {
          amount: safeNumber(budget.amount),
          currency: safeText(budget.currency, 12),
          includesCosts: safeBoolean(budget.includesCosts),
          approximate: safeBoolean(budget.approximate),
        }
      : null,
    needs: safeTextArray(needsSection?.bullets, 8),
    verification: safeTextArray(verificationSection?.bullets, 10),
    properties: propertyItems
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .slice(0, LEAD_INTELLIGENCE_LIMITS.draftProperties)
      .map((item) => ({
        propertyId: safeText(item.propertyId, LEAD_INTELLIGENCE_LIMITS.id),
        reference: safeText(item.reference, LEAD_INTELLIGENCE_LIMITS.shortText),
        title: safeText(item.title) || safeText(item.reference) || "Uten tittel",
        location: safeText(item.location),
        imageUrl: safeUrl(item.imageUrl),
        publicUrl: safeUrl(item.publicUrl),
        facts: safeTextArray(item.facts, 8),
        decision: safeText(item.decision, LEAD_INTELLIGENCE_LIMITS.shortText),
        systemEligibility: safeText(item.systemEligibility, LEAD_INTELLIGENCE_LIMITS.shortText),
        score: safeNumber(item.score),
        dataQualityScore: safeNumber(item.dataQualityScore),
        reasons: safeTextArray(item.reasons, 5),
        concerns: safeTextArray(item.concerns, 5),
        questionsToVerify: safeTextArray(item.questionsToVerify, 5),
      })),
  };
}
