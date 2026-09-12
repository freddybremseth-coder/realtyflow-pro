export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { buildRevenueCommandCenter } from "@/lib/revenue/command";
import { buildRevenueBrain } from "@/lib/nexus/revenue-brain";
import { recordRevenueBrainSnapshot } from "@/lib/nexus/outcome-measurement";
import { NEXUS_REVENUE_LEARNING_SETTINGS_KEY, parseRevenueLearningProfile } from "@/lib/nexus/revenue-learning";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-outcome-snapshot";

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

  const [contactsResult, profilesResult, shortlistsResult, presentationsResult, draftsResult, learningResult] = await Promise.all([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(3000),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,purchase_readiness,budget_amount,budget_currency,summary,created_at,updated_at").limit(1000),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").limit(1000),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,created_at,updated_at").limit(1000),
    supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,language,created_at,updated_at").limit(1000),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", NEXUS_REVENUE_LEARNING_SETTINGS_KEY).maybeSingle(),
  ]);

  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
  const warnings = [profilesResult, shortlistsResult, presentationsResult, draftsResult]
    .map((result) => result.error?.message)
    .filter(Boolean) as string[];
  if (learningResult.error) warnings.push(`revenue-learning: ${learningResult.error.message}`);
  const learningProfile = parseRevenueLearningProfile(learningResult.data?.settings);

  const command = buildRevenueCommandCenter({
    contacts: contactsResult.data || [],
    profiles: profilesResult.data || [],
    shortlists: shortlistsResult.data || [],
    presentations: presentationsResult.data || [],
    messageDrafts: draftsResult.data || [],
    warnings,
  }, new Date());
  const brain = buildRevenueBrain(command, 10, learningProfile);
  const snapshot = await recordRevenueBrainSnapshot(supabase, brain, { createdBy: "nexus-outcome-snapshot" });

  await supabase.from("automation_logs").insert({
    action: "nexus_outcome_snapshot",
    agent_name: "nexus_revenue_brain",
    status: snapshot.failed > 0 && snapshot.recorded === 0 ? "error" : "success",
    details: {
      attempted: snapshot.attempted,
      recorded: snapshot.recorded,
      duplicates: snapshot.duplicates,
      failed: snapshot.failed,
      learning_profile_loaded: Boolean(learningProfile),
      learning_adjusted: brain.summary.learningAdjusted,
      warnings,
      policy_mutation_allowed: false,
      autonomy_expansion_allowed: false,
      runtime_control: `cron:${PATH}`,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: snapshot.failed === 0,
    attempted: snapshot.attempted,
    recorded: snapshot.recorded,
    duplicates: snapshot.duplicates,
    failed: snapshot.failed,
    learningProfileLoaded: Boolean(learningProfile),
    learningAdjusted: brain.summary.learningAdjusted,
    warnings,
    safety: {
      measurementOnly: true,
      learningRankingOnly: true,
      policyMutationAllowed: false,
      autonomyExpansionAllowed: false,
    },
  });
}
