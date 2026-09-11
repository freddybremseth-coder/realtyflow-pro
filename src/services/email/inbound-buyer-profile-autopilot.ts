import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import {
  analyzeLeadIntake,
  LEAD_INTELLIGENCE_MODEL,
  LEAD_INTELLIGENCE_PROMPT_VERSION,
} from "@/services/lead-intelligence/extraction";
import {
  isLeadIntelligenceEnabled,
  isLeadIntelligencePersistenceEnabled,
} from "@/services/lead-intelligence/feature-flags";
import { stableLeadIntelligenceIdempotencyKey } from "@/services/lead-intelligence/review";
import {
  createLeadIntelligenceRepository,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";

const ACTOR = "nexus-email-autopilot@system";
const MIN_EXPLICIT_CONFIDENCE = 0.88;
const MATCH_DIMENSION_KEYS = new Set([
  "location",
  "property_type",
  "total_budget",
  "purchase_price",
  "estimated_total_cost",
  "bedrooms",
  "bathrooms",
  "living_area_m2",
  "plot_area_m2",
]);

export type BuyerProfileAutopilotResult =
  | {
      status: "linked_existing";
      buyerProfileId: string;
      buyerProfileStatus: "APPROVED";
      analysis: null;
      verifiedCriteriaCount: 0;
      requiresRevision: false;
    }
  | {
      status: "revision_required";
      buyerProfileId: string;
      buyerProfileStatus: "APPROVED";
      analysis: ExtractedLead;
      verifiedCriteriaCount: number;
      requiresRevision: true;
    }
  | {
      status: "created";
      buyerProfileId: string;
      buyerProfileStatus: "APPROVED";
      analysis: ExtractedLead;
      verifiedCriteriaCount: number;
      requiresRevision: false;
    }
  | {
      status: "review_required";
      buyerProfileId: null;
      buyerProfileStatus: null;
      analysis: ExtractedLead;
      verifiedCriteriaCount: number;
      requiresRevision: false;
      reason: string;
    }
  | {
      status: "disabled";
      buyerProfileId: null;
      buyerProfileStatus: null;
      analysis: null;
      verifiedCriteriaCount: 0;
      requiresRevision: false;
      reason: string;
    };

type EvidenceCriterion =
  | ExtractedLead["hardRequirements"][number]
  | ExtractedLead["preferences"][number]
  | ExtractedLead["exclusions"][number];

type VerifiedCriterion = {
  criterionType: "hard_requirement" | "preference" | "exclusion";
  item: EvidenceCriterion;
};

function normalizeEvidence(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceIsExplicit(rawText: string, sourceText: string | null | undefined) {
  const raw = normalizeEvidence(rawText);
  const source = normalizeEvidence(String(sourceText || ""));
  return source.length >= 4 && raw.includes(source);
}

function verifiedCriteria(analysis: ExtractedLead, rawText: string): VerifiedCriterion[] {
  const groups: Array<{
    criterionType: VerifiedCriterion["criterionType"];
    items: EvidenceCriterion[];
  }> = [
    { criterionType: "hard_requirement", items: analysis.hardRequirements },
    { criterionType: "preference", items: analysis.preferences },
    { criterionType: "exclusion", items: analysis.exclusions },
  ];

  const verified: VerifiedCriterion[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if ((item.confidence ?? 0) < MIN_EXPLICIT_CONFIDENCE) continue;
      if (!evidenceIsExplicit(rawText, item.sourceText)) continue;
      verified.push({ criterionType: group.criterionType, item });
    }
  }
  return verified;
}

function hasMatchingDimension(criteria: VerifiedCriterion[]) {
  return criteria.some(({ item }) => MATCH_DIMENSION_KEYS.has(item.key));
}

function numericBudget(criteria: VerifiedCriterion[]) {
  for (const { item } of criteria) {
    if (!["total_budget", "purchase_price", "estimated_total_cost"].includes(item.key)) continue;
    if (typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0) return item.value;
  }
  return null;
}

function toPersistenceCriteria(criteria: VerifiedCriterion[], approvedAt: string) {
  return criteria.map(({ criterionType, item }) => ({
    criterionType,
    key: item.key,
    otherKey: item.key === "other" ? item.otherKey || null : null,
    operator: item.operator,
    value: item.value,
    weight: criterionType === "preference" ? ("weight" in item ? item.weight : 0.7) : null,
    severity: criterionType === "exclusion" ? ("severity" in item ? item.severity : "major_penalty") : null,
    appliesToPropertyTypes: item.appliesToPropertyTypes || [],
    source: "customer_confirmed" as const,
    sourceText: item.sourceText || null,
    confidence: item.confidence ?? null,
    customerConfirmed: true,
    approvalStatus: "approved" as const,
    approvedBy: ACTOR,
    approvedAt,
    active: true,
  }));
}

export async function ensureInboundBuyerProfile(input: {
  brandId: string;
  contactId: string;
  emailMessageId: string;
  intent: string;
  subject?: string | null;
  body: string;
  language?: string | null;
}): Promise<BuyerProfileAutopilotResult> {
  if (!isLeadIntelligenceEnabled() || !isLeadIntelligencePersistenceEnabled()) {
    return {
      status: "disabled",
      buyerProfileId: null,
      buyerProfileStatus: null,
      analysis: null,
      verifiedCriteriaCount: 0,
      requiresRevision: false,
      reason: "lead_intelligence_disabled",
    };
  }

  const correlationId = `nexus-email-profile:${input.emailMessageId}`.slice(0, 120);
  const rawText = [input.subject || "", input.body || ""].filter(Boolean).join("\n").trim();
  if (rawText.length < 12) {
    return {
      status: "review_required",
      buyerProfileId: null,
      buyerProfileStatus: null,
      analysis: {
        contact: { name: null, phone: null, email: null, language: null, country: null },
        purchaseReadiness: { level: "unknown", confidence: 0, reasoning: "Insufficient text" },
        budget: { amount: null, currency: null, includesCosts: null, approximate: false, hardLimit: null },
        propertyTypes: [],
        locations: { preferred: [], excluded: [], flexible: true },
        hardRequirements: [],
        preferences: [],
        exclusions: [],
        missingInformation: [],
        summary: "Insufficient text for Buyer Profile extraction.",
        suggestedNextAction: "Review customer context manually.",
      },
      verifiedCriteriaCount: 0,
      requiresRevision: false,
      reason: "insufficient_text",
    };
  }

  const existing = await withLeadIntelligenceTransaction(input.brandId, async (client) => {
    const result = await client.query<{ id: string }>(
      `select id::text from public.buyer_profiles where contact_id = $1::uuid and status = 'approved' order by version desc limit 1`,
      [input.contactId],
    );
    return result.rows[0]?.id || null;
  });

  if (existing && input.intent !== "update_preferences") {
    return {
      status: "linked_existing",
      buyerProfileId: existing,
      buyerProfileStatus: "APPROVED",
      analysis: null,
      verifiedCriteriaCount: 0,
      requiresRevision: false,
    };
  }

  const analyzed = await analyzeLeadIntake(
    {
      source: "email",
      brand: input.brandId,
      rawText,
      language: input.language || null,
    },
    { correlationId, logger: console },
  );
  const analysis = analyzed.result;
  const verified = verifiedCriteria(analysis, rawText);

  if (existing && input.intent === "update_preferences") {
    return {
      status: "revision_required",
      buyerProfileId: existing,
      buyerProfileStatus: "APPROVED",
      analysis,
      verifiedCriteriaCount: verified.length,
      requiresRevision: true,
    };
  }

  const readinessConfidence = analysis.purchaseReadiness.confidence ?? 0;
  if (verified.length === 0 || !hasMatchingDimension(verified) || readinessConfidence < 0.75) {
    return {
      status: "review_required",
      buyerProfileId: null,
      buyerProfileStatus: null,
      analysis,
      verifiedCriteriaCount: verified.length,
      requiresRevision: false,
      reason: verified.length === 0
        ? "no_explicit_criteria"
        : !hasMatchingDimension(verified)
          ? "no_matching_dimension"
          : "low_readiness_confidence",
    };
  }

  const approvedAt = new Date().toISOString();
  const budgetAmount = numericBudget(verified);
  const hasLocationEvidence = verified.some(({ item }) => item.key === "location");

  const created = await withLeadIntelligenceTransaction(input.brandId, async (client) => {
    const already = await client.query<{ id: string }>(
      `select id::text from public.buyer_profiles where contact_id = $1::uuid and status = 'approved' order by version desc limit 1`,
      [input.contactId],
    );
    if (already.rows[0]?.id) return { id: already.rows[0].id, duplicate: true };

    const repository = createLeadIntelligenceRepository(client, { email: ACTOR });
    const intakeKey = stableLeadIntelligenceIdempotencyKey("nexus-email-intake-v1", {
      emailMessageId: input.emailMessageId,
      contactId: input.contactId,
      brand: input.brandId,
    });
    const analysisKey = stableLeadIntelligenceIdempotencyKey("nexus-email-analysis-v1", {
      emailMessageId: input.emailMessageId,
      contactId: input.contactId,
      brand: input.brandId,
      promptVersion: analyzed.meta.promptVersion || LEAD_INTELLIGENCE_PROMPT_VERSION,
    });

    const intake = await repository.createIntake({
      brand: input.brandId,
      source: "email",
      rawTextRestricted: null,
      rawTextRetentionUntil: null,
      language: input.language || analysis.contact.language || null,
      status: "approved",
      createdBy: ACTOR,
      correlationId,
      idempotencyKey: intakeKey,
    });

    await repository.recordAnalysisRun({
      intakeId: intake.id,
      idempotencyKey: analysisKey,
      promptVersion: analyzed.meta.promptVersion || LEAD_INTELLIGENCE_PROMPT_VERSION,
      model: analyzed.meta.model || LEAD_INTELLIGENCE_MODEL,
      resultJson: { analysis },
      validationStatus: "valid",
      repaired: analyzed.meta.repaired,
      durationMs: analyzed.meta.durationMs,
      approved: true,
      approvedBy: ACTOR,
      approvedAt,
    });

    const profile = await repository.createBuyerProfile({
      brand: input.brandId,
      contactId: input.contactId,
      intakeId: intake.id,
      version: 1,
      status: "approved",
      purchaseReadiness: readinessConfidence >= 0.75 ? analysis.purchaseReadiness.level : "unknown",
      budgetAmount,
      budgetCurrency: budgetAmount ? analysis.budget.currency : null,
      budgetIncludesCosts: budgetAmount ? analysis.budget.includesCosts : null,
      budgetApproximate: budgetAmount ? analysis.budget.approximate : true,
      locationFlexible: hasLocationEvidence ? analysis.locations.flexible : true,
      summary: analysis.summary,
      createdBy: ACTOR,
      approvedBy: ACTOR,
      approvedAt,
      criteria: toPersistenceCriteria(verified, approvedAt),
    });

    return { id: profile.id, duplicate: Boolean(profile.duplicate) };
  });

  return {
    status: "created",
    buyerProfileId: created.id,
    buyerProfileStatus: "APPROVED",
    analysis,
    verifiedCriteriaCount: verified.length,
    requiresRevision: false,
  };
}
