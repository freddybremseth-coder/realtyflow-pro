export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import { recommendForGeneration } from "@/services/marketing/learning-adapter";
import { createCampaignDraft, getServiceSupabase } from "@/services/marketing/campaign-production";

const SUPPORTED_CHANNELS = new Set(["instagram", "facebook"]);
const EXCLUDED_BRANDS = new Set(["soleada"]);
const EXPLORATION_HOURS = [9, 12, 16, 20];

type RunRequest = { id: string; brand_ids: string[] | null; channels: string[] | null };

function configuredChannels(metadata: Record<string, unknown> | null | undefined): Array<"instagram" | "facebook"> {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter((v): v is "instagram" | "facebook" => SUPPORTED_CHANNELS.has(v))));
}

function localHourAndWeekday(timeZone = "Europe/Madrid") {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const weekday = String(parts.find((p) => p.type === "weekday")?.value ?? "Mon").toLowerCase();
  const dayIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekday);
  return { hour, dayIndex: dayIndex >= 0 ? dayIndex : 1 };
}

function parseLearnedHour(value: string | undefined): number | null {
  const m = String(value ?? "").match(/^h_(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function shouldRunAtThisSlot(currentHour: number, dayIndex: number, learnedHour: number | null) {
  if (learnedHour != null) return Math.abs(currentHour - learnedHour) <= 1;
  const explorationHour = EXPLORATION_HOURS[dayIndex % EXPLORATION_HOURS.length];
  return Math.abs(currentHour - explorationHour) <= 1;
}

async function hasRecentAutoPublication(supabase: any, brandId: string, channel: string) {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("marketing_publications").select("publication_id").eq("brand_id", brandId).eq("channel", channel).eq("source_type", "generated").in("state", ["published", "scheduled"]).gte("updated_at", since).limit(1);
  return !!data?.length;
}

async function claimRunRequest(supabase: any): Promise<RunRequest | null> {
  const now = new Date().toISOString();
  await supabase.from("marketing_autopilot_run_requests").update({ status: "expired", completed_at: now }).eq("status", "pending").lt("expires_at", now);
  const { data } = await supabase.from("marketing_autopilot_run_requests").select("id,brand_ids,channels").eq("status", "pending").gt("expires_at", now).order("requested_at", { ascending: true }).limit(1).maybeSingle();
  if (!data?.id) return null;
  const { data: claimed } = await supabase.from("marketing_autopilot_run_requests").update({ status: "claimed", claimed_at: now }).eq("id", data.id).eq("status", "pending").select("id,brand_ids,channels").maybeSingle();
  return claimed?.id ? claimed as RunRequest : null;
}

function ideaForBrand(plan: any, guidance: string) {
  const role = String(plan?.metadata?.brand_role ?? "");
  const sources = Array.isArray(plan?.source_types) ? plan.source_types.join(", ") : "approved brand sources";
  const channelSafety = " Ikke skriv ‘lenke i bio’, ‘link in bio’, ‘se lenken i profilen’ eller tilsvarende med mindre en slik kanal-lenke er eksplisitt verifisert i brand-data. Bruk heller en direkte, sann CTA som ‘send oss en melding’ eller ‘kontakt oss’.";
  if (role === "real_estate") return `Presenter én aktuell bolig fra RealtyFlow Inventory på en troverdig, nyttig og salgsutløsende måte. Bruk kun verifiserte Inventory-fakta og brandets godkjente tone, CTA og rolle.${channelSafety}${guidance}`;
  if (role === "food_agriculture") return `Lag nyttig og visuelt merkevareinnhold basert på verifiserte kilder (${sources}). Prioriter gård, oliven, høsting, opprinnelse, EVOO, matbruk eller oppskrifter. Ikke fremsett helse- eller sykdomspåstander uten uavhengig dokumentasjon/review.${channelSafety}${guidance}`;
  if (role === "saas_b2b") return `Lag konkret B2B-innhold basert på verifiserte produktkilder (${sources}). Ikke finn på funksjoner, priser, kundetall eller resultater. Bruk en tydelig nytteverdi og relevant CTA.${channelSafety}${guidance}`;
  if (role === "personal_author") return `Lag forfatter- og bokinnhold basert på verifisert bokkatalog, bokutdrag, covers, artikler og nettsider. Ikke finn på anmeldelser, salgstall eller bokinnhold.${channelSafety}${guidance}`;
  if (role === "creator_media") return `Lag creator/media-innhold kun fra originalt eller autorisert materiale (${sources}). Ikke bruk eller antyd rettigheter til tredjepartsinnhold.${channelSafety}${guidance}`;
  return `Lag nyttig merkevareinnhold fra verifiserte brandkilder (${sources}). Ikke finn på fakta, priser, resultater eller claims.${channelSafety}${guidance}`;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode("/api/cron/marketing-autopilot");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const timeZone = process.env.MARKETING_LEARNING_TIMEZONE || "Europe/Madrid";
  const { hour: localHour, dayIndex } = localHourAndWeekday(timeZone);
  const runRequest = await claimRunRequest(supabase).catch(() => null);
  const requestedBrands = new Set((runRequest?.brand_ids ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean));
  const requestedChannels = new Set((runRequest?.channels ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean));
  const manualRun = !!runRequest;

  try {
    const { data: plans, error } = await supabase.from("marketing_brand_growth_plans").select("brand_id,status,autonomy_mode,metadata,source_types").eq("status", "active").eq("autonomy_mode", "controlled_auto");
    if (error) throw new Error(error.message);
    const results: Array<Record<string, unknown>> = [];
    for (const plan of plans ?? []) {
      const brandId = String(plan.brand_id ?? "").trim().toLowerCase();
      if (!brandId || EXCLUDED_BRANDS.has(brandId)) continue;
      if (manualRun && requestedBrands.size && !requestedBrands.has(brandId)) continue;
      const channels = configuredChannels((plan.metadata ?? {}) as Record<string, unknown>).filter((channel) => !manualRun || !requestedChannels.size || requestedChannels.has(channel));
      if (!channels.length) { results.push({ brandId, skipped: true, reason: "No requested/preapproved autopilot channels" }); continue; }

      for (const channel of channels) {
        if (await hasRecentAutoPublication(supabase, brandId, channel)) { results.push({ brandId, channel, skipped: true, reason: "recent_auto_publication_exists" }); continue; }
        const recommendation = await recommendForGeneration(supabase as any, { scope: channelLearningScope(brandId, channel) }).catch(() => undefined);
        const learnedHour = parseLearnedHour(recommendation?.favor?.publishHour?.value);
        if (!manualRun && !shouldRunAtThisSlot(localHour, dayIndex, learnedHour)) { results.push({ brandId, channel, skipped: true, reason: learnedHour == null ? "exploration_time_slot_not_due" : "learned_time_slot_not_due", localHour, learnedHour }); continue; }

        try {
          const guidance = recommendation ? ` Bruk dokumentert læring når den finnes. Favoriserte signaler: ${JSON.stringify(recommendation.favor)}. Unngå: ${JSON.stringify(recommendation.avoid)}.` : "";
          const role = String(plan?.metadata?.brand_role ?? "");
          const run = await createCampaignDraft(supabase as any, {
            brandId, channel, useInventoryProperty: role === "real_estate", masterIdea: ideaForBrand(plan, guidance),
            goal: { kind: role === "real_estate" ? "qualified_leads" : "awareness", target: 10, horizonDays: 30 }, publishingCapacityPerWeek: 4,
          });
          results.push({ brandId, channel, marketingRunId: run.marketingRunId, manualRun, localHour, learnedHour, recommendation: recommendation?.favor ?? {}, publications: run.results.map((item) => ({ publicationId: item.publicationId, state: item.state, mode: item.mode, qualityScore: item.qualityScore, error: item.error ?? null })) });
        } catch (err) { results.push({ brandId, channel, error: err instanceof Error ? err.message : String(err) }); }
      }
    }

    const payload = { success: true, manualRun, runRequestId: runRequest?.id ?? null, brands: Array.from(new Set(results.map((r) => String(r.brandId ?? "")).filter(Boolean))), localHour, timeZone, results };
    if (runRequest?.id) await supabase.from("marketing_autopilot_run_requests").update({ status: "completed", completed_at: new Date().toISOString(), result: payload }).eq("id", runRequest.id);
    return NextResponse.json(payload);
  } catch (error) {
    if (runRequest?.id) await supabase.from("marketing_autopilot_run_requests").update({ status: "failed", completed_at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }).eq("id", runRequest.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketing autopilot failed", manualRun, runRequestId: runRequest?.id ?? null }, { status: 500 });
  }
}
