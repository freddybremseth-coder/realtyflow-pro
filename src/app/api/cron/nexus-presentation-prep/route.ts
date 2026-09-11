export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { saveLeadCustomerPresentationDraft } from "@/services/lead-intelligence/presentation";
import {
  createLeadIntelligenceRepository,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";
import { isLeadIntelligenceRealEstateBrand } from "@/services/lead-intelligence/brand-allowlist";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-presentation-prep";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const ACTOR = "Nexus Presentation Autopilot";

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

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

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
  let waitingForReview = 0;
  let prepared = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows || []) {
    const metadata = record(row.metadata);
    if (!metadata.shortlist_id || !metadata.shortlist_prepared_at) continue;
    if (metadata.presentation_prepared_at) continue;

    const brandId = String(row.brand_id || "");
    const buyerProfileId = String(metadata.buyer_profile_id || "");
    const buyerProfileStatus = String(metadata.buyer_profile_status || "").toUpperCase();
    const shortlistId = String(metadata.shortlist_id || "");

    if (!isLeadIntelligenceRealEstateBrand(brandId) || !buyerProfileId || buyerProfileStatus !== "APPROVED" || !shortlistId) {
      skipped += 1;
      continue;
    }

    considered += 1;
    try {
      if (metadata.shortlist_human_review_complete !== true) {
        waitingForReview += 1;
        continue;
      }

      const readiness = await supabase
        .from("lead_property_shortlist_items")
        .select("id,quality_review_status")
        .eq("brand", brandId)
        .eq("shortlist_id", shortlistId);
      if (readiness.error) throw readiness.error;

      const clientReadyCount = (readiness.data || []).filter((item) => item.quality_review_status === "client_ready").length;
      if (clientReadyCount === 0) {
        waitingForReview += 1;
        continue;
      }

      const result = await withLeadIntelligenceTransaction(brandId, (client) =>
        saveLeadCustomerPresentationDraft({
          request: {
            brand: brandId,
            buyerProfileId,
            shortlistId,
            idempotencySeed: `nexus-presentation:${row.id}:${shortlistId}`.slice(0, 120),
          },
          correlationId: `nexus-presentation:${row.id}`.slice(0, 120),
          createdBy: ACTOR,
          repository: createLeadIntelligenceRepository(client, { email: "nexus-presentation-autopilot@system" }),
        }),
      );

      const now = new Date().toISOString();
      const nextMetadata = {
        ...metadata,
        presentation_prepared_at: now,
        presentation_prepared_by: ACTOR,
        presentation_prepare_status: result.duplicate ? "DRAFT_ALREADY_EXISTS" : "DRAFT_READY_FOR_REVIEW",
        presentation_id: result.presentationId,
        presentation_message_draft_id: result.messageDraftId,
        presentation_item_count: result.itemCount,
        presentation_review_required: true,
        presentation_customer_send_allowed: false,
        shortlist_client_ready_count: clientReadyCount,
      };
      const nextAction = `Nexus har laget presentasjon og e-postutkast fra ${result.itemCount} godkjent${result.itemCount === 1 ? "" : "e"} bolig${result.itemCount === 1 ? "" : "er"}. Kontroller sluttresultatet før eventuell utsending.`;
      const update = await supabase
        .from("work_items")
        .update({ metadata: nextMetadata, next_action: nextAction, updated_at: now })
        .eq("id", row.id);
      if (update.error) throw update.error;

      if (result.duplicate) duplicates += 1;
      else prepared += 1;
    } catch (workerError) {
      failed += 1;
      console.warn("[nexus-presentation-prep] work item failed", {
        workItemId: row.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_presentation_prep",
    agent_name: "nexus_presentation_autopilot",
    status: failed ? (prepared || duplicates ? "partial" : "failed") : "success",
    details: {
      considered,
      waiting_for_review: waitingForReview,
      prepared,
      duplicates,
      skipped,
      failed,
      runtime_control: `cron:${PATH}`,
      customer_send: false,
      presentation_publish: false,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: true,
    considered,
    waitingForReview,
    prepared,
    duplicates,
    skipped,
    failed,
  });
}
