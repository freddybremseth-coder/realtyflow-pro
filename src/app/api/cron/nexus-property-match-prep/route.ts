export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { buildCustomerTasteProfile } from "@/lib/nexus/customer-taste-profile";
import { prepareInboundPropertyMatches } from "@/services/email/inbound-property-match";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-property-match-prep";
const MATCH_INTENTS = new Set(["active_interest", "property_interest", "viewing_request", "update_preferences"]);
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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
  let noMatches = 0;
  let tasteApplied = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows || []) {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const intent = String(metadata.classification || "");
    if (!MATCH_INTENTS.has(intent)) continue;
    if (metadata.property_match_prepared_at) continue;

    const buyerProfileId = metadata.buyer_profile_id ? String(metadata.buyer_profile_id) : null;
    const buyerProfileStatus = metadata.buyer_profile_status ? String(metadata.buyer_profile_status).toUpperCase() : null;
    if (!buyerProfileId || buyerProfileStatus !== "APPROVED") {
      skipped += 1;
      continue;
    }

    considered += 1;
    try {
      const contactId = metadata.contact_id ? String(metadata.contact_id) : null;
      let customerTaste = null;
      if (contactId) {
        const contactResult = await supabase
          .from("contacts")
          .select("interactions")
          .eq("id", contactId)
          .limit(1)
          .maybeSingle();
        if (!contactResult.error && contactResult.data) {
          const interactions = Array.isArray(contactResult.data.interactions) ? contactResult.data.interactions : [];
          customerTaste = buildCustomerTasteProfile(interactions);
        }
      }

      const result = await prepareInboundPropertyMatches({
        brandId: String(row.brand_id || ""),
        buyerProfileId,
        buyerProfileStatus,
        tasteProfile: customerTaste,
      });
      const now = new Date().toISOString();
      const hasMatches = result.prepared && result.properties.length > 0;
      const noMatch = result.prepared && result.properties.length === 0;
      if (result.tasteApplied) tasteApplied += 1;
      const nextMetadata = {
        ...metadata,
        property_match_prepared_at: now,
        property_match_prepared_by: "Nexus Property Match Autopilot",
        property_match_status: result.reason,
        property_match_analyzed: result.analyzed,
        property_match_count: result.properties.length,
        property_match_candidates: result.properties,
        customer_taste_profile_version: customerTaste?.version || null,
        customer_taste_feedback_events: customerTaste?.feedbackEvents || 0,
        customer_taste_ranking_applied: result.tasteApplied,
        customer_taste_safety: customerTaste?.safety || null,
        ...(noMatch ? {
          no_match_followup_required: true,
          no_match_followup_status: null,
          no_match_review_required: false,
        } : {}),
      };
      const nextAction = hasMatches
        ? result.tasteApplied
          ? `Nexus har kjørt matching og klargjort ${result.properties.length} kandidater. Godkjente Buyer Profile-kriterier styrer utvalget; observerte kundesignaler er kun brukt til sekundær rangering. Kontroller shortlist før utsending.`
          : `Nexus har kjørt matching og klargjort ${result.properties.length} kandidat${result.properties.length === 1 ? "" : "er"}. Kontroller shortlist og send bare relevante boliger til kunden.`
        : noMatch
          ? `Nexus analyserte ${result.analyzed} boliger, men fant ingen gode nok treff. Nexus avklarer nå om søkekriteriene mangler nødvendig presisjon; kriteriene endres ikke automatisk.`
          : row.next_action;

      const { error: updateError } = await supabase
        .from("work_items")
        .update({ metadata: nextMetadata, next_action: nextAction, updated_at: now })
        .eq("id", row.id);
      if (updateError) throw updateError;

      if (hasMatches) prepared += 1;
      else if (noMatch) noMatches += 1;
      else skipped += 1;
    } catch (workerError) {
      failed += 1;
      console.warn("[nexus-property-match-prep] work item failed", {
        workItemId: row.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_property_match_prep",
    agent_name: "nexus_property_match_autopilot",
    status: failed ? (prepared || noMatches ? "partial" : "failed") : "success",
    details: { considered, prepared, no_matches: noMatches, taste_applied: tasteApplied, skipped, failed, runtime_control: `cron:${PATH}` },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, considered, prepared, noMatches, tasteApplied, skipped, failed });
}
