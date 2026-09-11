import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import { withLeadIntelligenceTransaction } from "@/services/lead-intelligence/server-runtime";

const ACTOR = "nexus-email-autopilot@system";
const MIN_REVISION_CONFIDENCE = 0.92;
const AUTO_REVISION_KEYS = new Set([
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

type EvidenceCriterion =
  | ExtractedLead["hardRequirements"][number]
  | ExtractedLead["preferences"][number]
  | ExtractedLead["exclusions"][number];

type VerifiedCriterion = {
  criterionType: "hard_requirement" | "preference" | "exclusion";
  item: EvidenceCriterion;
};

export type InboundBuyerProfileRevisionResult =
  | {
      status: "revised";
      buyerProfileId: string;
      buyerProfileStatus: "APPROVED";
      version: number;
      changedKeys: string[];
    }
  | {
      status: "review_required";
      reason: string;
      changedKeys: string[];
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

function candidateCriteria(analysis: ExtractedLead) {
  const groups: Array<{
    criterionType: VerifiedCriterion["criterionType"];
    items: EvidenceCriterion[];
  }> = [
    { criterionType: "hard_requirement", items: analysis.hardRequirements },
    { criterionType: "preference", items: analysis.preferences },
    { criterionType: "exclusion", items: analysis.exclusions },
  ];

  return groups.flatMap((group) => group.items
    .filter((item) => AUTO_REVISION_KEYS.has(item.key))
    .map((item) => ({ criterionType: group.criterionType, item })));
}

function verifiedCriteria(analysis: ExtractedLead, rawText: string) {
  return candidateCriteria(analysis).filter(({ item }) =>
    (item.confidence ?? 0) >= MIN_REVISION_CONFIDENCE
    && evidenceIsExplicit(rawText, item.sourceText));
}

function persistenceValues(criterion: VerifiedCriterion) {
  const { item, criterionType } = criterion;
  return {
    criterionType,
    key: item.key,
    otherKey: item.key === "other" ? item.otherKey || null : null,
    operator: item.operator,
    value: JSON.stringify(item.value ?? null),
    weight: criterionType === "preference" ? ("weight" in item ? item.weight : 0.7) : null,
    severity: criterionType === "exclusion" ? ("severity" in item ? item.severity : "major_penalty") : null,
    appliesToPropertyTypes: item.appliesToPropertyTypes || [],
    sourceText: item.sourceText || null,
    confidence: item.confidence ?? null,
  };
}

function explicitBudget(criteria: VerifiedCriterion[]) {
  for (const { item } of criteria) {
    if (!["total_budget", "purchase_price", "estimated_total_cost"].includes(item.key)) continue;
    if (typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0) {
      return item.value;
    }
  }
  return null;
}

export async function autoReviseBuyerProfileFromInboundEvidence(input: {
  brandId: string;
  contactId: string;
  buyerProfileId: string;
  emailMessageId: string;
  rawText: string;
  analysis: ExtractedLead;
}): Promise<InboundBuyerProfileRevisionResult> {
  const candidates = candidateCriteria(input.analysis);
  const verified = verifiedCriteria(input.analysis, input.rawText);
  const changedKeys = [...new Set(verified.map(({ item }) => item.key))];

  if (candidates.length === 0) {
    return { status: "review_required", reason: "no_supported_explicit_change", changedKeys: [] };
  }
  if (verified.length === 0) {
    return { status: "review_required", reason: "no_high_confidence_explicit_change", changedKeys: [] };
  }
  if (verified.length !== candidates.length) {
    return { status: "review_required", reason: "partial_or_uncertain_change_set", changedKeys };
  }
  if (changedKeys.length > 6) {
    return { status: "review_required", reason: "too_many_changes_for_auto_revision", changedKeys };
  }

  const revisionActor = `nexus-email-revision:${input.emailMessageId}`.slice(0, 120);
  const approvedAt = new Date().toISOString();
  const budgetAmount = explicitBudget(verified);
  const locationChanged = changedKeys.includes("location");

  return withLeadIntelligenceTransaction(input.brandId, async (client) => {
    const currentResult = await client.query<{
      id: string;
      brand: string;
      contact_id: string;
      intake_id: string;
      version: number;
      status: string;
      purchase_readiness: string;
      budget_amount: number | null;
      budget_currency: string | null;
      budget_includes_costs: boolean | null;
      budget_approximate: boolean;
      location_flexible: boolean;
      summary: string | null;
      created_by: string | null;
    }>(
      `select id::text, brand, contact_id::text, intake_id::text, version, status,
              purchase_readiness, budget_amount, budget_currency, budget_includes_costs,
              budget_approximate, location_flexible, summary, created_by
         from public.buyer_profiles
        where id = $1::uuid and contact_id = $2::uuid and brand = $3
        for update`,
      [input.buyerProfileId, input.contactId, input.brandId],
    );
    const current = currentResult.rows[0];
    if (!current || current.status !== "approved") {
      return { status: "review_required" as const, reason: "profile_not_current_approved", changedKeys };
    }

    if (current.created_by === revisionActor) {
      return {
        status: "revised" as const,
        buyerProfileId: current.id,
        buyerProfileStatus: "APPROVED" as const,
        version: current.version,
        changedKeys,
      };
    }

    const latestResult = await client.query<{ id: string; version: number; created_by: string | null }>(
      `select id::text, version, created_by
         from public.buyer_profiles
        where contact_id = $1::uuid and brand = $2 and status = 'approved'
        order by version desc limit 1
        for update`,
      [input.contactId, input.brandId],
    );
    const latest = latestResult.rows[0];
    if (!latest || latest.id !== current.id) {
      if (latest?.created_by === revisionActor) {
        return {
          status: "revised" as const,
          buyerProfileId: latest.id,
          buyerProfileStatus: "APPROVED" as const,
          version: latest.version,
          changedKeys,
        };
      }
      return { status: "review_required" as const, reason: "profile_changed_during_revision", changedKeys };
    }

    const nextVersionResult = await client.query<{ next_version: number }>(
      `select coalesce(max(version), 0)::int + 1 as next_version
         from public.buyer_profiles
        where brand = $1 and intake_id = $2::uuid`,
      [input.brandId, current.intake_id],
    );
    const nextVersion = nextVersionResult.rows[0]?.next_version || current.version + 1;

    const createdResult = await client.query<{ id: string; version: number }>(
      `insert into public.buyer_profiles (
          brand, contact_id, intake_id, version, status, purchase_readiness,
          budget_amount, budget_currency, budget_includes_costs, budget_approximate,
          location_flexible, summary, created_by, approved_by, approved_at
       ) values (
          $1, $2::uuid, $3::uuid, $4, 'approved', $5,
          $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz
       ) returning id::text, version`,
      [
        input.brandId,
        input.contactId,
        current.intake_id,
        nextVersion,
        current.purchase_readiness,
        budgetAmount ?? current.budget_amount,
        budgetAmount ? (input.analysis.budget.currency || current.budget_currency || "EUR") : current.budget_currency,
        budgetAmount ? input.analysis.budget.includesCosts : current.budget_includes_costs,
        budgetAmount ? input.analysis.budget.approximate : current.budget_approximate,
        locationChanged ? input.analysis.locations.flexible : current.location_flexible,
        current.summary || input.analysis.summary,
        revisionActor,
        ACTOR,
        approvedAt,
      ],
    );
    const created = createdResult.rows[0];
    if (!created) {
      return { status: "review_required" as const, reason: "revision_insert_failed", changedKeys };
    }

    await client.query(
      `insert into public.buyer_profile_criteria (
          buyer_profile_id, criterion_type, key, other_key, operator, value, weight, severity,
          applies_to_property_types, source, source_text, confidence, customer_confirmed,
          approval_status, approved_by, approved_at, active
       )
       select $1::uuid, criterion_type, key, other_key, operator, value, weight, severity,
              applies_to_property_types, source, source_text, confidence, customer_confirmed,
              approval_status, approved_by, approved_at, active
         from public.buyer_profile_criteria
        where buyer_profile_id = $2::uuid
          and active is true
          and not (key = any($3::text[]))`,
      [created.id, current.id, changedKeys],
    );

    for (const criterion of verified) {
      const value = persistenceValues(criterion);
      await client.query(
        `insert into public.buyer_profile_criteria (
            buyer_profile_id, criterion_type, key, other_key, operator, value, weight, severity,
            applies_to_property_types, source, source_text, confidence, customer_confirmed,
            approval_status, approved_by, approved_at, active
         ) values (
            $1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::text[],
            'customer_confirmed', $10, $11, true, 'approved', $12, $13::timestamptz, true
         )`,
        [
          created.id,
          value.criterionType,
          value.key,
          value.otherKey,
          value.operator,
          value.value,
          value.weight,
          value.severity,
          value.appliesToPropertyTypes,
          value.sourceText,
          value.confidence,
          ACTOR,
          approvedAt,
        ],
      );
    }

    await client.query(
      `update public.buyer_profiles set status = 'superseded' where id = $1::uuid and status = 'approved'`,
      [current.id],
    );

    return {
      status: "revised" as const,
      buyerProfileId: created.id,
      buyerProfileStatus: "APPROVED" as const,
      version: created.version,
      changedKeys,
    };
  });
}
