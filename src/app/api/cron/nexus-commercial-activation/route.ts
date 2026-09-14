import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { buildBuyerProfileEvidencePreview } from "@/lib/nexus/buyer-profile-evidence";
import { decideBuyerProfileEvidenceDraft } from "@/lib/nexus/buyer-profile-evidence-draft";
import { stableLeadIntelligenceIdempotencyKey } from "@/services/lead-intelligence/review";
import {
  createLeadIntelligenceRepository,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/cron/nexus-commercial-activation";
const MAX_PER_RUN = 10;
const ACTIVE_STAGES = new Set(["VIEWING", "QUALIFIED"]);
const SYSTEM_ACTOR = "nexus-commercial-activation@system.local";

type ContactRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  property_interest?: string | null;
  next_followup?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  source?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  interactions?: unknown[] | null;
  email_suppressed?: boolean | null;
  do_not_contact?: boolean | null;
  updated_at?: string | null;
};

function normalizedBrand(contact: ContactRow) {
  const parsed = LeadIntelligenceRealEstateBrandSchema.safeParse(
    String(contact.brand_id || contact.brand || "").trim().toLowerCase(),
  );
  return parsed.success ? parsed.data : null;
}

function interactions(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>
    : [];
}

function evidenceDecision(contact: ContactRow) {
  const preview = buildBuyerProfileEvidencePreview({
    email: contact.email,
    phone: contact.phone,
    property_interest: contact.property_interest,
    next_followup: contact.next_followup,
    notes: contact.notes,
    interactions: interactions(contact.interactions),
  });
  const decision = decideBuyerProfileEvidenceDraft({
    candidates: preview.candidates,
    conflictCount: preview.conflicts.length,
  });
  return { preview, decision };
}

function stageRank(stage: unknown) {
  return String(stage || "").toUpperCase() === "VIEWING" ? 0 : 1;
}

function evidenceRank(contact: ContactRow) {
  const { preview, decision } = evidenceDecision(contact);
  if (decision.eligible) return 100 + preview.candidates.length;
  if (preview.conflicts.length) return 50 + preview.conflicts.length;
  return preview.candidates.length;
}

async function ensureWorkItem(
  client: { query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  input: {
    contactId: string;
    brandId: string;
    sourceId: string;
    title: string;
    description: string;
    nextAction: string;
    priority: "HIGH" | "MEDIUM";
    aiScore: number;
    metadata: Record<string, unknown>;
  },
) {
  const existing = await client.query(
    `select id::text from public.work_items where source_type='ai_agent' and source_id=$1 limit 1`,
    [input.sourceId],
  );
  if (existing.rows[0]?.id) return { id: String(existing.rows[0].id), duplicate: true };

  const inserted = await client.query(
    `insert into public.work_items
      (title,description,status,priority,brand_id,source_type,source_id,assigned_agent,next_action,ai_score,metadata)
     values ($1,$2,'TO_DO',$3,$4,'ai_agent',$5,'nexus_buyer_intelligence',$6,$7,$8::jsonb)
     returning id::text`,
    [
      input.title,
      input.description,
      input.priority,
      input.brandId,
      input.sourceId,
      input.nextAction,
      input.aiScore,
      JSON.stringify(input.metadata),
    ],
  );
  return { id: String(inserted.rows[0]?.id || ""), duplicate: false };
}

async function activateContact(contact: ContactRow) {
  const brand = normalizedBrand(contact);
  if (!brand) return { status: "skipped_brand" as const };

  return withLeadIntelligenceTransaction(brand, async (client) => {
    const locked = await client.query<ContactRow>(
      `select id::text,name,email,phone,notes,property_interest,next_followup,pipeline_status,pipeline_value,
              source,brand_id,brand,interactions,email_suppressed,do_not_contact,updated_at
         from public.contacts
        where id=$1::uuid
        for update`,
      [contact.id],
    );
    const current = locked.rows[0];
    if (!current) return { status: "skipped_missing" as const };

    const currentStage = String(current.pipeline_status || "").trim().toUpperCase();
    const currentBrand = normalizedBrand(current);
    if (!ACTIVE_STAGES.has(currentStage) || currentBrand !== brand) {
      return { status: "skipped_stale" as const };
    }
    if (current.do_not_contact || current.email_suppressed) {
      return { status: "skipped_suppressed" as const };
    }

    const existing = await client.query<{ id: string; status: string }>(
      `select id::text,status
         from public.buyer_profiles
        where contact_id=$1::uuid and status in ('approved','draft')
        order by case when status='approved' then 0 else 1 end, version desc, created_at desc
        limit 1`,
      [current.id],
    );
    if (existing.rows[0]) {
      return {
        status: existing.rows[0].status === "approved" ? "existing_approved" as const : "existing_draft" as const,
        buyerProfileId: existing.rows[0].id,
      };
    }

    const { preview, decision } = evidenceDecision(current);
    if (!decision.eligible) {
      const hasConflict = preview.conflicts.length > 0;
      const work = await ensureWorkItem(client, {
        contactId: current.id,
        brandId: brand,
        sourceId: `commercial-activation:${current.id}:discovery-v1`,
        title: hasConflict ? "Avklar motstridende kjøperkriterier" : "Kompletter Buyer Profile-grunnlag",
        description: hasConflict
          ? "Nexus fant motstridende eksplisitt CRM-evidens. Ingen Buyer Profile er opprettet eller endret."
          : "Kunden er i aktiv kjøpsfase, men eksisterende CRM-evidens er ikke presis nok til et trygt Buyer Profile-utkast.",
        nextAction: hasConflict
          ? "Kontroller CRM-evidensen med kunden og avklar kriteriene før matching."
          : "Avklar manglende kjøpskriterier med kunden eller legg dokumentert korrespondanse/PDF/bilde i Customer 360.",
        priority: currentStage === "VIEWING" ? "HIGH" : "MEDIUM",
        aiScore: currentStage === "VIEWING" ? 95 : 80,
        metadata: {
          kind: hasConflict ? "buyer_profile_evidence_conflict" : "buyer_profile_discovery",
          domain: "real_estate",
          contact_id: current.id,
          pipeline_stage: currentStage,
          evidence_candidate_count: preview.candidates.length,
          evidence_conflict_count: preview.conflicts.length,
          reason: decision.reason,
          performed_by: "Nexus Commercial Activation",
          customer_send: false,
          buyer_profile_mutated: false,
        },
      });
      return {
        status: hasConflict ? "conflict_task" as const : "discovery_task" as const,
        duplicate: work.duplicate,
      };
    }

    const repository = createLeadIntelligenceRepository(client, { email: SYSTEM_ACTOR });
    const idempotencyKey = stableLeadIntelligenceIdempotencyKey("buyer-profile-commercial-activation-v1", {
      contactId: current.id,
      brand,
      criteria: decision.criteria.map((criterion) => ({
        key: criterion.key,
        otherKey: criterion.otherKey,
        operator: criterion.operator,
        value: criterion.value,
        confidence: criterion.confidence,
      })),
    });
    const intake = await repository.createIntake({
      brand,
      source: "other",
      rawTextRestricted: null,
      rawTextRetentionUntil: null,
      language: null,
      status: "analyzed",
      createdBy: SYSTEM_ACTOR,
      correlationId: `commercial-activation:${current.id}`,
      idempotencyKey,
    });
    const profile = await repository.createBuyerProfile({
      brand,
      contactId: current.id,
      intakeId: intake.id,
      version: 1,
      status: "draft",
      purchaseReadiness: "unknown",
      budgetAmount: null,
      budgetCurrency: "EUR",
      budgetIncludesCosts: null,
      budgetApproximate: false,
      locationFlexible: false,
      summary: `Nexus Commercial Activation prepared ${decision.criteria.length} explicit CRM evidence criterion${decision.criteria.length === 1 ? "" : "a"}. Pending item-level review; no matching or customer action is authorized by this draft.`,
      createdBy: SYSTEM_ACTOR,
      approvedBy: null,
      approvedAt: null,
      criteria: decision.criteria,
    });

    await ensureWorkItem(client, {
      contactId: current.id,
      brandId: brand,
      sourceId: `commercial-activation:${current.id}:profile:${profile.id}`,
      title: "Review Buyer Profile-utkast",
      description: "Nexus har forberedt et Buyer Profile-utkast kun fra eksplisitt CRM-evidens. Alle kriterier er pending og må kvalitetssikres før matching.",
      nextAction: "Kontroller de foreslåtte kriteriene og godkjenn bare dokumentert kundeevidens før matching aktiveres.",
      priority: currentStage === "VIEWING" ? "HIGH" : "MEDIUM",
      aiScore: currentStage === "VIEWING" ? 98 : 88,
      metadata: {
        kind: "buyer_profile_commercial_activation_review",
        domain: "real_estate",
        contact_id: current.id,
        buyer_profile_id: profile.id,
        pipeline_stage: currentStage,
        evidence_criteria_count: decision.criteria.length,
        minimum_confidence: decision.minimumConfidence,
        performed_by: "Nexus Commercial Activation",
        buyer_profile_status: "draft",
        criteria_approval_status: "pending",
        customer_send: false,
        auto_approved: false,
      },
    });

    return {
      status: "draft_created" as const,
      buyerProfileId: profile.id,
      duplicate: Boolean(profile.duplicate),
      criteriaCount: profile.criterionCount,
    };
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const contactsR = await supabase
    .from("contacts")
    .select("id,name,email,phone,notes,property_interest,next_followup,pipeline_status,pipeline_value,source,brand_id,brand,interactions,email_suppressed,do_not_contact,updated_at")
    .in("pipeline_status", ["VIEWING", "QUALIFIED"])
    .eq("do_not_contact", false)
    .eq("email_suppressed", false)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (contactsR.error) return NextResponse.json({ error: contactsR.error.message }, { status: 500 });

  const eligibleContacts = (contactsR.data || [])
    .filter((contact) => Boolean(normalizedBrand(contact as ContactRow))) as ContactRow[];
  const contactIds = eligibleContacts.map((contact) => contact.id);
  const profilesR = contactIds.length
    ? await supabase
        .from("buyer_profiles")
        .select("contact_id,status")
        .in("contact_id", contactIds)
        .in("status", ["approved", "draft"])
    : { data: [], error: null };
  if (profilesR.error) return NextResponse.json({ error: profilesR.error.message }, { status: 500 });

  const contactsWithProfile = new Set((profilesR.data || []).map((row) => String(row.contact_id || "")));
  const missing = eligibleContacts
    .filter((contact) => !contactsWithProfile.has(contact.id))
    .sort((a, b) =>
      stageRank(a.pipeline_status) - stageRank(b.pipeline_status)
      || evidenceRank(b) - evidenceRank(a)
      || new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
    );
  const batch = missing.slice(0, MAX_PER_RUN);

  const counts = {
    considered: batch.length,
    draft_created: 0,
    discovery_task: 0,
    conflict_task: 0,
    existing_profile: 0,
    skipped: 0,
    failed: 0,
  };

  for (const contact of batch) {
    try {
      const result = await activateContact(contact);
      if (result.status === "draft_created") counts.draft_created += result.duplicate ? 0 : 1;
      else if (result.status === "discovery_task") counts.discovery_task += result.duplicate ? 0 : 1;
      else if (result.status === "conflict_task") counts.conflict_task += result.duplicate ? 0 : 1;
      else if (result.status === "existing_approved" || result.status === "existing_draft") counts.existing_profile += 1;
      else counts.skipped += 1;
    } catch (error) {
      counts.failed += 1;
      console.warn("[nexus-commercial-activation] contact activation failed", {
        contactId: contact.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const progressed = counts.draft_created + counts.discovery_task + counts.conflict_task + counts.existing_profile;
  const status = counts.failed
    ? (progressed > 0 ? "partial" : "failed")
    : "success";
  const { error: logError } = await supabase.from("automation_logs").insert({
    action: "nexus_commercial_activation",
    agent_name: "nexus_buyer_intelligence",
    status,
    details: {
      scanned: eligibleContacts.length,
      missing_profile: missing.length,
      ...counts,
      max_per_run: MAX_PER_RUN,
      stages: ["VIEWING", "QUALIFIED"],
      auto_approved: false,
      matching_triggered: false,
      customer_send: false,
      pipeline_value_used_as_criterion: false,
      runtime_control: `cron:${PATH}`,
    },
  });
  if (logError) console.error("[nexus-commercial-activation] automation log failed", logError.message);

  return NextResponse.json({
    success: counts.failed === 0,
    status,
    scanned: eligibleContacts.length,
    missingProfile: missing.length,
    ...counts,
    safety: {
      maxPerRun: MAX_PER_RUN,
      autoApproved: false,
      matchingTriggered: false,
      customerSend: false,
      pipelineMutation: false,
      pipelineValueUsedAsCriterion: false,
    },
  }, { status: counts.failed > 0 ? 207 : 200 });
}
