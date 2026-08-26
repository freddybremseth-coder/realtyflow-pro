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

function ideaForBrand(plan: any, channel: string, guidance: string) {
  const role = String(plan?.metadata?.brand_role ?? "");
  const sources = Array.isArray(plan?.source_types) ? plan.source_types.join(", ") : "approved brand sources";
  if (role === "real_estate") return `Presenter én aktuell bolig fra RealtyFlow Inventory på en troverdig, nyttig og salgsutløsende måte. Bruk kun verifiserte Inventory-fakta og brandets godkjente tone, CTA og rolle.${guidance}`;
  if (role === "food_agriculture") return `Lag nyttig og visuelt merkevareinnhold basert på verifiserte kilder (${sources}). Prioriter gård, oliven, høsting, opprinnelse, EVOO, matbruk eller oppskrifter. Ikke fremsett helse- eller sykdomspåstander uten uavhengig dokumentasjon/review.${guidance}`;
  if (role === "saas_b2b") return `Lag konkret B2B-innhold basert på verifiserte produktkilder (${sources}). Ikke finn på funksjoner, priser, kundetall eller resultater. Bruk en tydelig nytteverdi og relevant CTA.${guidance}`;
  if (role === "personal_author") return `Lag forfatter- og bokinnhold basert på verifisert bokkatalog, bokutdrag, covers, artikler og nettsider. Ikke finn på anmeldelser, salgstall eller bokinnhold.${guidance}`;
  if (role === "creator_media") return `Lag creator/media-innhold kun fra originalt eller autorisert materiale (${sources}). Ikke bruk eller antyd rettigheter til tredjepartsinnhold.${guidance}`;
  return `Lag nyttig merkevareinnhold fra verifiserte brandkilder (${sources}). Ikke finn på fakta, priser, resultater eller claims.${guidance}`;
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

  const { data: plans, error } = await supabase.from("marketing_brand_growth_plans").select("brand_id,status,autonomy_mode,metadata,source_types").eq("status", "active").eq("autonomy_mode", "controlled_auto");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const plan of plans ?? []) {
    const brandId = String(plan.brand_id ?? "").trim().toLowerCase();
    if (!brandId || EXCLUDED_BRANDS.has(brandId)) continue;
    const channels = configuredChannels((plan.metadata ?? {}) as Record<string, unknown>);
    if (!channels.length) { results.push({ brandId, skipped: true, reason: "No preapproved autopilot channels" }); continue; }

    for (const channel of channels) {
      if (await hasRecentAutoPublication(supabase, brandId, channel)) { results.push({ brandId, channel, skipped: true, reason: "recent_auto_publication_exists" }); continue; }
      const recommendation = await recommendForGeneration(supabase as any, { scope: channelLearningScope(brandId, channel) }).catch(() => undefined);
      const learnedHour = parseLearnedHour(recommendation?.favor?.publishHour?.value);
      if (!shouldRunAtThisSlot(localHour, dayIndex, learnedHour)) { results.push({ brandId, channel, skipped: true, reason: learnedHour == null ? "exploration_time_slot_not_due" : "learned_time_slot_not_due", localHour, learnedHour }); continue; }

      try {
        const guidance = recommendation ? ` Bruk dokumentert læring når den finnes. Favoriserte signaler: ${JSON.stringify(recommendation.favor)}. Unngå: ${JSON.stringify(recommendation.avoid)}.` : "";
        const role = String(plan?.metadata?.brand_role ?? "");
        const run = await createCampaignDraft(supabase as any, {
          brandId,
          channel,
          useInventoryProperty: role === "real_estate",
          masterIdea: ideaForBrand(plan, channel, guidance),
          goal: { kind: role === "real_estate" ? "qualified_leads" : "awareness", target: 10, horizonDays: 30 },
          publishingCapacityPerWeek: 4,
        });
        results.push({ brandId, channel, marketingRunId: run.marketingRunId, localHour, learnedHour, recommendation: recommendation?.favor ?? {}, publications: run.results.map((item) => ({ publicationId: item.publicationId, state: item.state, mode: item.mode, qualityScore: item.qualityScore, error: item.error ?? null })) });
      } catch (err) { results.push({ brandId, channel, error: err instanceof Error ? err.message : String(err) }); }
    }
  }
  return NextResponse.json({ success: true, brands: Array.from(new Set(results.map((r) => String(r.brandId ?? "")).filter(Boolean))), localHour, timeZone, results });
}
