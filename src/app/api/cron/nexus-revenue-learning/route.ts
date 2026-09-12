export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { measureRevenueBrainOutcomes, NEXUS_OUTCOME_EVENT_TYPES } from "@/lib/nexus/outcome-measurement";
import { buildRevenueLearningProfile, NEXUS_REVENUE_LEARNING_SETTINGS_KEY } from "@/lib/nexus/revenue-learning";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-revenue-learning";
const LOOKBACK_DAYS = 90;
const ATTRIBUTION_DAYS = 30;
const MIN_SAMPLES = 8;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const eventTypes = ["automation_recommended", ...NEXUS_OUTCOME_EVENT_TYPES];
  const { data, error } = await supabase
    .from("revenue_events")
    .select("id,event_type,contact_id,brand_id,source_system,source_type,source_id,revenue_impact_eur,occurred_at,created_at,metadata")
    .in("event_type", eventTypes)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const measurement = measureRevenueBrainOutcomes(data || [], { now, attributionWindowDays: ATTRIBUTION_DAYS });
  const profile = buildRevenueLearningProfile(measurement, {
    lookbackDays: LOOKBACK_DAYS,
    minSamples: MIN_SAMPLES,
    generatedAt: now,
  });

  const save = await supabase.from("brand_settings").upsert({
    brand_id: NEXUS_REVENUE_LEARNING_SETTINGS_KEY,
    settings: profile,
    updated_at: now.toISOString(),
  }, { onConflict: "brand_id" });
  if (save.error) return NextResponse.json({ error: save.error.message }, { status: 500 });

  const adjustedSignals = profile.signals.filter((signal) => signal.scoreAdjustment !== 0).length;
  await supabase.from("automation_logs").insert({
    action: "nexus_revenue_learning",
    agent_name: "nexus_revenue_brain",
    status: "success",
    details: {
      recommendations: measurement.summary.recommendations,
      measured_outcomes: measurement.summary.withOutcome,
      baseline_outcome_rate: profile.baselineOutcomeRate,
      signals: profile.signals.length,
      adjusted_signals: adjustedSignals,
      min_samples: profile.minSamples,
      max_absolute_score_adjustment: profile.safety.maxAbsoluteScoreAdjustment,
      ranking_only: true,
      policy_mutation_allowed: false,
      autonomy_expansion_allowed: false,
      runtime_control: `cron:${PATH}`,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: true,
    measurement: measurement.summary,
    learning: {
      generatedAt: profile.generatedAt,
      baselineOutcomeRate: profile.baselineOutcomeRate,
      signals: profile.signals,
      adjustedSignals,
    },
    safety: profile.safety,
  });
}
