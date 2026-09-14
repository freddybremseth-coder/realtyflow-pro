export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { buildCustomerTasteProfile } from "@/lib/nexus/customer-taste-profile";
import { selectPropertyDeltaCandidates, type NexusPropertyHistoryItem } from "@/lib/nexus-property-delta";
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
  let noMeaningfulDelta = 0;
  let repeatSuppressed = 0;
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
      const brandId = String(row.brand_id || "");
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
        brandId,
        buyerProfileId,
        buyerProfileStatus,
        tasteProfile: customerTaste,
      });

      let propertyHistory: NexusPropertyHistoryItem[] = [];
      if (result.prepared && result.properties.length > 0) {
        const profileIds = new Set<string>([buyerProfileId]);
        if (contactId) {
          const profilesResult = await supabase
            .from("buyer_profiles")
            .select("id")
            .eq("contact_id", contactId)
            .eq("brand", brandId)
            .limit(50);
          if (profilesResult.error) throw profilesResult.error;
          for (const profile of profilesResult.data || []) {
            if (profile.id) profileIds.add(String(profile.id));
          }
        }

        const shortlistsResult = await supabase
          .from("lead_property_shortlists")
          .select("id")
          .eq("brand", brandId)
          .eq("status", "approved")
          .in("buyer_profile_id", [...profileIds])
          .order("created_at", { ascending: false })
          .limit(30);
        if (shortlistsResult.error) throw shortlistsResult.error;

        const shortlistIds = (shortlistsResult.data || []).map((item) => String(item.id || "")).filter(Boolean);
        if (shortlistIds.length > 0) {
          const historyResult = await supabase
            .from("lead_property_shortlist_items")
            .select("property_id,property_price,score,created_at")
            .in("shortlist_id", shortlistIds)
            .limit(600);
          if (historyResult.error) throw historyResult.error;
          propertyHistory = (historyResult.data || []) as NexusPropertyHistoryItem[];
        }
      }

      const delta = selectPropertyDeltaCandidates(result.properties, propertyHistory);
      const deltaProperties = delta.candidates.slice(0, 5);
      const now = new Date().toISOString();
      const hasMatches = result.prepared && deltaProperties.length > 0;
      const noMatch = result.prepared && result.properties.length === 0;
      const noDelta = result.prepared && result.properties.length > 0 && deltaProperties.length === 0;
      if (result.tasteApplied) tasteApplied += 1;
      repeatSuppressed += delta.suppressed;
      if (noDelta) noMeaningfulDelta += 1;

      const nextMetadata = {
        ...metadata,
        property_match_prepared_at: now,
        property_match_prepared_by: "Nexus Property Match Autopilot",
        property_match_status: noDelta ? "NO_MEANINGFUL_DELTA" : result.reason,
        property_match_analyzed: result.analyzed,
        property_match_raw_count: result.properties.length,
        property_match_count: noDelta ? null : deltaProperties.length,
        property_match_candidates: deltaProperties,
        property_match_delta_applied: delta.historyApplied,
        property_match_delta_history_count: delta.historicalProperties,
        property_match_repeat_suppressed: delta.suppressed,
        customer_taste_profile_version: customerTaste?.version || null,
        customer_taste_feedback_events: customerTaste?.feedbackEvents || 0,
        customer_taste_ranking_applied: result.tasteApplied,
        customer_taste_safety: customerTaste?.safety || null,
        ...(noMatch ? {
          no_match_followup_required: true,
          no_match_followup_status: null,
          no_match_review_required: false,
        } : {
          no_match_followup_required: false,
          no_match_followup_status: null,
          no_match_review_required: false,
        }),
      };
      const nextAction = hasMatches
        ? delta.historyApplied
          ? `Nexus har kjørt Delta Matching og klargjort ${deltaProperties.length} ny${deltaProperties.length === 1 ? " eller vesentlig forbedret bolig" : "e eller vesentlig forbedrede boliger"}. ${delta.suppressed} tidligere gjennomgåtte, uendrede treff ble undertrykt. Kontroller shortlist før utsending.`
          : result.tasteApplied
            ? `Nexus har kjørt matching og klargjort ${deltaProperties.length} kandidater. Godkjente Buyer Profile-kriterier styrer utvalget; observerte kundesignaler er kun brukt til sekundær rangering. Kontroller shortlist før utsending.`
            : `Nexus har kjørt matching og klargjort ${deltaProperties.length} kandidat${deltaProperties.length === 1 ? "" : "er"}. Kontroller shortlist og send bare relevante boliger til kunden.`
        : noDelta
          ? `Nexus fant ${result.properties.length} tekniske treff, men ingen er nye eller vesentlig forbedret siden tidligere godkjent shortlist. Ingen ny shortlist eller kundekontakt er nødvendig; fortsett å overvåke nye, bedre eller vesentlig repriset boliger.`
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
      else if (!noDelta) skipped += 1;
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
    status: failed ? (prepared || noMatches || noMeaningfulDelta ? "partial" : "failed") : "success",
    details: {
      considered,
      prepared,
      no_matches: noMatches,
      no_meaningful_delta: noMeaningfulDelta,
      repeat_suppressed: repeatSuppressed,
      taste_applied: tasteApplied,
      skipped,
      failed,
      runtime_control: `cron:${PATH}`,
      customer_send: false,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: true,
    considered,
    prepared,
    noMatches,
    noMeaningfulDelta,
    repeatSuppressed,
    tasteApplied,
    skipped,
    failed,
  });
}
