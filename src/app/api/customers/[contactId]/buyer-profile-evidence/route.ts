import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { BUYER_CRITERION_KEYS, BUYER_PROPERTY_TYPES } from "@/lib/customers/sales-assistant-note";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { assertLeadIntelligenceActionRateLimit, withLeadIntelligenceTransaction } from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({ contactId: z.string().uuid() });
const CriterionSchema = z.object({
  criterionType: z.enum(["hard_requirement", "preference", "exclusion"]),
  key: z.enum(BUYER_CRITERION_KEYS),
  otherKey: z.string().trim().min(1).max(120).nullable(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "exists", "unknown"]),
  value: z.union([z.string().max(500), z.number().finite(), z.boolean()]),
  weight: z.number().min(0).max(1).nullable(),
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]).nullable(),
  appliesToPropertyTypes: z.array(z.enum(BUYER_PROPERTY_TYPES)).max(20),
  sourceText: z.string().trim().min(1).max(300),
  confidence: z.number().min(0.9).max(1),
}).strict().superRefine((criterion, ctx) => {
  if (criterion.key === "other" && !criterion.otherKey) {
    ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is required for other criteria" });
  }
  if (criterion.key !== "other" && criterion.otherKey) {
    ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is only allowed for other criteria" });
  }
  if (criterion.criterionType === "preference" && criterion.weight === null) {
    ctx.addIssue({ code: "custom", path: ["weight"], message: "weight is required for preferences" });
  }
  if (criterion.criterionType === "exclusion" && criterion.severity === null) {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "severity is required for exclusions" });
  }
});
const RequestSchema = z.object({
  brand: LeadIntelligenceRealEstateBrandSchema,
  interactionId: z.string().uuid(),
  criteria: z.array(CriterionSchema).min(1).max(30),
}).strict();

type ReviewedCriterion = z.infer<typeof CriterionSchema>;

type DbClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function criterionSignature(value: Record<string, any>) {
  return JSON.stringify([
    String(value.criterionType || ""),
    String(value.key || ""),
    value.otherKey ? String(value.otherKey) : null,
    String(value.operator || ""),
    value.value,
    String(value.sourceText || "").trim(),
  ]);
}

function selectedBudget(criteria: ReviewedCriterion[]) {
  for (const criterion of criteria) {
    if (!["total_budget", "purchase_price", "estimated_total_cost"].includes(criterion.key)) continue;
    if (typeof criterion.value === "number" && criterion.value > 0) return criterion.value;
  }
  return null;
}

async function insertReviewedCriteria(client: DbClient, buyerProfileId: string, criteria: ReviewedCriterion[], actor: string, approvedAt: string) {
  const slots = [...new Set(criteria.map((criterion) => `${criterion.key}\u0000${criterion.otherKey || ""}`))];
  for (const slot of slots) {
    const [key, otherKey] = slot.split("\u0000");
    await client.query(
      `delete from public.buyer_profile_criteria
        where buyer_profile_id = $1::uuid
          and key = $2
          and coalesce(other_key, '') = $3`,
      [buyerProfileId, key, otherKey],
    );
  }

  for (const criterion of criteria) {
    const weight = criterion.criterionType === "preference" ? criterion.weight ?? 0.7 : null;
    const severity = criterion.criterionType === "exclusion" ? criterion.severity || "major_penalty" : null;
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
        buyerProfileId,
        criterion.criterionType,
        criterion.key,
        criterion.key === "other" ? criterion.otherKey : null,
        criterion.operator,
        JSON.stringify(criterion.value),
        weight,
        severity,
        criterion.appliesToPropertyTypes,
        criterion.sourceText,
        criterion.confidence,
        actor,
        approvedAt,
      ],
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { contactId: string } }) {
  const access = await getRequestAccessContext(request);
  if (!access) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (access.role !== "OWNER" && !hasPermission(access.role, "customers.write")) {
    return NextResponse.json({ ok: false, error: "Access permission required", requiredPermission: "customers.write" }, { status: 403 });
  }

  const parsedParams = ParamsSchema.safeParse(params);
  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) {
    return NextResponse.json({ ok: false, error: "Invalid Buyer Profile evidence review request" }, { status: 400 });
  }
  assertLeadIntelligenceActionRateLimit(access.email, "crm-buyer-profile-evidence-review");

  try {
    const result = await withLeadIntelligenceTransaction(parsedBody.data.brand, async (client) => {
      const contactResult = await client.query<{
        id: string;
        name: string | null;
        email: string | null;
        brand_id: string | null;
        brand: string | null;
        property_interest: string | null;
        interactions: unknown;
      }>(
        `select id::text, name, email, brand_id, brand, property_interest, interactions
           from public.contacts
          where id = $1::uuid
          for update`,
        [parsedParams.data.contactId],
      );
      const contact = contactResult.rows[0];
      if (!contact) throw new Error("CONTACT_NOT_FOUND");
      const contactBrand = String(contact.brand_id || contact.brand || "").trim().toLowerCase();
      if (contactBrand !== parsedBody.data.brand) throw new Error("BRAND_MISMATCH");

      const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
      const sourceInteraction = interactions
        .filter((item) => item && typeof item === "object")
        .map((item) => item as Record<string, any>)
        .find((item) => String(item.id || "") === parsedBody.data.interactionId);
      const metadata = asRecord(sourceInteraction?.metadata);
      if (!sourceInteraction || metadata.source !== "crm-sales-assistant") throw new Error("SOURCE_INTERACTION_NOT_FOUND");
      if (String(metadata.buyer_profile_evidence_brand || "") !== parsedBody.data.brand) throw new Error("SOURCE_BRAND_MISMATCH");

      const allowedCandidates = Array.isArray(metadata.buyer_profile_evidence_candidates)
        ? metadata.buyer_profile_evidence_candidates.filter((item: unknown) => item && typeof item === "object") as Array<Record<string, any>>
        : [];
      const allowed = new Set(allowedCandidates.map(criterionSignature));
      for (const criterion of parsedBody.data.criteria) {
        if (!allowed.has(criterionSignature(criterion))) throw new Error("UNVERIFIED_CRITERION");
      }

      const marker = `crm-evidence:${parsedBody.data.interactionId}`.slice(0, 120);
      const currentResult = await client.query<{
        id: string;
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
        `select id::text, intake_id::text, version, status, purchase_readiness, budget_amount,
                budget_currency, budget_includes_costs, budget_approximate, location_flexible,
                summary, created_by
           from public.buyer_profiles
          where contact_id = $1::uuid
            and brand = $2
            and status in ('approved', 'draft')
          order by case when status = 'approved' then 0 else 1 end, version desc
          limit 1
          for update`,
        [contact.id, parsedBody.data.brand],
      );
      const current = currentResult.rows[0] || null;
      if (current?.created_by === marker && current.status === "approved") {
        return {
          buyerProfileId: current.id,
          version: current.version,
          status: "approved" as const,
          alreadyApplied: true,
          criteriaApplied: parsedBody.data.criteria.length,
        };
      }

      const approvedAt = new Date().toISOString();
      let intakeId = current?.intake_id || null;
      let nextVersion = 1;
      if (!intakeId) {
        const intakeKey = marker.length >= 12 ? marker : `crm-evidence-${parsedBody.data.interactionId}`;
        const intakeResult = await client.query<{ id: string }>(
          `insert into public.lead_intake_messages (
             brand, source, raw_text_restricted, raw_text_retention_until, language, status,
             created_by, correlation_id, idempotency_key
           ) values ($1, 'other', null, null, null, 'approved', $2, $3, $4)
           on conflict (brand, idempotency_key)
           do update set updated_at = now()
           returning id::text`,
          [parsedBody.data.brand, access.email, parsedBody.data.interactionId, intakeKey],
        );
        intakeId = intakeResult.rows[0]?.id || null;
        if (!intakeId) throw new Error("INTAKE_CREATE_FAILED");
      } else {
        const versionResult = await client.query<{ next_version: number }>(
          `select coalesce(max(version), 0)::int + 1 as next_version
             from public.buyer_profiles
            where brand = $1 and intake_id = $2::uuid`,
          [parsedBody.data.brand, intakeId],
        );
        nextVersion = versionResult.rows[0]?.next_version || (current?.version || 0) + 1;
      }

      const explicitBudget = selectedBudget(parsedBody.data.criteria);
      const summary = current?.summary || [
        `CRM-approved Buyer Profile evidence for ${contact.name || contact.email || "customer"}.`,
        contact.property_interest ? `Interesse: ${contact.property_interest}.` : "",
      ].filter(Boolean).join(" ");

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
          parsedBody.data.brand,
          contact.id,
          intakeId,
          nextVersion,
          current?.purchase_readiness || "unknown",
          explicitBudget ?? current?.budget_amount ?? null,
          current?.budget_currency || "EUR",
          current?.budget_includes_costs ?? null,
          current?.budget_approximate ?? false,
          current?.location_flexible ?? false,
          summary,
          marker,
          access.email,
          approvedAt,
        ],
      );
      const created = createdResult.rows[0];
      if (!created) throw new Error("BUYER_PROFILE_CREATE_FAILED");

      if (current?.id) {
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
              and approval_status = 'approved'`,
          [created.id, current.id],
        );
      }

      await insertReviewedCriteria(client, created.id, parsedBody.data.criteria, access.email, approvedAt);

      await client.query(
        `update public.buyer_profiles
            set status = 'superseded'
          where contact_id = $1::uuid
            and brand = $2
            and id <> $3::uuid
            and status in ('approved', 'draft')`,
        [contact.id, parsedBody.data.brand, created.id],
      );

      return {
        buyerProfileId: created.id,
        version: created.version,
        status: "approved" as const,
        alreadyApplied: false,
        criteriaApplied: parsedBody.data.criteria.length,
      };
    });

    return NextResponse.json({
      ok: true,
      result,
      safety: {
        itemLevelHumanApproval: true,
        sourceInteractionVerified: true,
        customerContactSent: false,
        pipelineChanged: false,
        matchingTriggered: false,
        shortlistCreated: false,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BUYER_PROFILE_EVIDENCE_APPLY_FAILED";
    const expected = new Set([
      "CONTACT_NOT_FOUND", "BRAND_MISMATCH", "SOURCE_INTERACTION_NOT_FOUND", "SOURCE_BRAND_MISMATCH",
      "UNVERIFIED_CRITERION", "INTAKE_CREATE_FAILED", "BUYER_PROFILE_CREATE_FAILED",
    ]);
    return NextResponse.json({
      ok: false,
      error: expected.has(code) ? code : "BUYER_PROFILE_EVIDENCE_APPLY_FAILED",
    }, { status: expected.has(code) ? 409 : 500 });
  }
}
