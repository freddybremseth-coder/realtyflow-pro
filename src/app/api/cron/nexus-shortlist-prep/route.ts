export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { applyLeadPropertyLocationGuard } from "@/services/lead-intelligence/location-guard";
import {
  LeadPropertyMatchPreviewRequestSchema,
  loadApprovedLeadMatchProfileWithDb,
  loadPropertiesByReferencesFromSupabase,
  previewLeadPropertyMatchesForProfile,
} from "@/services/lead-intelligence/property-match-preview";
import { saveLeadPropertyShortlistDraft } from "@/services/lead-intelligence/shortlist";
import {
  createLeadIntelligenceRepository,
  withLeadIntelligenceQuery,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";
import { isLeadIntelligenceRealEstateBrand } from "@/services/lead-intelligence/brand-allowlist";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-shortlist-prep";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const ACTOR = "Nexus Shortlist Autopilot";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function candidateIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => record(item).id)
    .map((id) => typeof id === "string" ? id : "")
    .filter(Boolean))].slice(0, 5);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: rows, error } = await supabase
    .from("work_items")
    .select("id,brand_id,status,source_type,source_id,next_action,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let considered = 0;
  let prepared = 0;
  let duplicates = 0;
  let noEligible = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows || []) {
    const metadata = record(row.metadata);
    if (!metadata.property_match_prepared_at || Number(metadata.property_match_count || 0) <= 0) continue;
    if (metadata.shortlist_prepared_at) continue;

    const buyerProfileId = String(metadata.buyer_profile_id || "");
    const buyerProfileStatus = String(metadata.buyer_profile_status || "").toUpperCase();
    const brandId = String(row.brand_id || "");
    const propertyIds = candidateIds(metadata.property_match_candidates);
    if (!buyerProfileId || buyerProfileStatus !== "APPROVED" || !isLeadIntelligenceRealEstateBrand(brandId) || propertyIds.length === 0) {
      skipped += 1;
      continue;
    }

    considered += 1;
    try {
      const profile = await withLeadIntelligenceQuery(brandId, (client) =>
        loadApprovedLeadMatchProfileWithDb(client, { brand: brandId, buyerProfileId }),
      );
      if (!profile) {
        skipped += 1;
        continue;
      }

      const previewRequest = LeadPropertyMatchPreviewRequestSchema.parse({
        brand: brandId,
        buyerProfileId,
        propertyIds,
        maxResults: propertyIds.length,
      });
      const recomputed = await previewLeadPropertyMatchesForProfile(
        previewRequest,
        profile,
        (brand, propertyReferences) => loadPropertiesByReferencesFromSupabase(brand, propertyReferences),
      );
      const guarded = applyLeadPropertyLocationGuard(recomputed, profile);
      const selected = guarded.matches
        .filter((match) => match.eligibility !== "rejected")
        .slice(0, 4);

      const now = new Date().toISOString();
      if (selected.length === 0) {
        const nextMetadata = {
          ...metadata,
          shortlist_prepared_at: now,
          shortlist_prepared_by: ACTOR,
          shortlist_prepare_status: "NO_ELIGIBLE_MATCHES_AFTER_REVALIDATION",
          shortlist_review_required: false,
        };
        const update = await supabase
          .from("work_items")
          .update({ metadata: nextMetadata, updated_at: now })
          .eq("id", row.id);
        if (update.error) throw update.error;
        noEligible += 1;
        continue;
      }

      const shortlist = await withLeadIntelligenceTransaction(brandId, (client) =>
        saveLeadPropertyShortlistDraft({
          request: {
            brand: brandId,
            buyerProfileId,
            title: "Nexus shortlist fra aktiv kundedialog",
            idempotencySeed: `nexus-work:${row.id}`,
            items: selected.map((match) => ({
              propertyId: match.propertyId,
              decision: "maybe" as const,
              qualityReview: {
                status: "needs_review" as const,
                note: "Nexus har klargjort kandidaten automatisk. Kontroller fakta, relevans og tilgjengelighet før kundeutsending.",
                checkedAt: now,
                checkedBy: ACTOR,
              },
            })),
          },
          correlationId: `nexus-shortlist:${row.id}`.slice(0, 120),
          createdBy: ACTOR,
          repository: createLeadIntelligenceRepository(client, { email: "nexus-shortlist-autopilot@system" }),
          matchResult: guarded,
        }),
      );

      const nextMetadata = {
        ...metadata,
        shortlist_prepared_at: now,
        shortlist_prepared_by: ACTOR,
        shortlist_prepare_status: shortlist.duplicate ? "DRAFT_ALREADY_EXISTS" : "DRAFT_READY_FOR_REVIEW",
        shortlist_id: shortlist.shortlistId,
        shortlist_item_count: shortlist.itemCount,
        shortlist_review_required: true,
      };
      const nextAction = `Nexus har klargjort en shortlist med ${shortlist.itemCount} kandidat${shortlist.itemCount === 1 ? "" : "er"}. Gjennomgå kvalitet og relevans; ingenting sendes til kunden før review.`;
      const update = await supabase
        .from("work_items")
        .update({ metadata: nextMetadata, next_action: nextAction, updated_at: now })
        .eq("id", row.id);
      if (update.error) throw update.error;

      if (shortlist.duplicate) duplicates += 1;
      else prepared += 1;
    } catch (workerError) {
      failed += 1;
      console.warn("[nexus-shortlist-prep] work item failed", {
        workItemId: row.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_shortlist_prep",
    agent_name: "nexus_shortlist_autopilot",
    status: failed ? (prepared || duplicates || noEligible ? "partial" : "failed") : "success",
    details: {
      considered,
      prepared,
      duplicates,
      no_eligible: noEligible,
      skipped,
      failed,
      runtime_control: `cron:${PATH}`,
      customer_send: false,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, considered, prepared, duplicates, noEligible, skipped, failed });
}
