export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runCorporateHomesDiscovery } from "@/lib/corporate-homes-discovery-runner";
import {
  CORPORATE_PARTNER_DISCOVERY_ACTION,
  runCorporatePartnerDiscovery,
} from "@/lib/corporate-partner-discovery-runner";
import {
  CORPORATE_SIGNAL_RESEARCH_ACTION,
  runCorporateCompanySignalResearch,
} from "@/lib/corporate-company-signal-runner";
import {
  CORPORATE_GENERIC_CONTACT_ACTION,
  runCorporateGenericContactResearch,
} from "@/lib/corporate-generic-contact-runner";

export const maxDuration = 120;

const PATH = "/api/cron/corporate-homes-bootstrap";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

async function hasSuccessfulRun(supabase: ReturnType<typeof getSupabase>, action: string) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("automation_logs")
    .select("id")
    .eq("action", action)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

/**
 * First-run bootstrap for the Corporate Homes growth chain.
 *
 * The route already runs every five minutes. It performs at most one bounded
 * stage per invocation and becomes a cheap no-op after each stage has one
 * successful run:
 *   1) buyer-company discovery when the queue is empty,
 *   2) referral-partner discovery,
 *   3) company-level signal research,
 *   4) company-level generic contact channel research.
 *
 * Person enrichment, cold outreach and external publishing are never started
 * here. Normal daily crons own ongoing work after bootstrap.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
      personal_enrichment_started: false,
      outreach_started: false,
    });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const { count, error } = await supabase
      .from("corporate_prospects")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", "zeneco");

    if (error) throw error;

    const current = Number(count || 0);
    if (current === 0) {
      const result = await runCorporateHomesDiscovery(supabase, {
        trigger: "cron",
        batchSize: 25,
        minEmployees: 15,
        maxEmployees: 500,
        profile: "core",
        sourceType: "brreg_open_data_bootstrap",
      });
      return NextResponse.json({
        ...result,
        bootstrap: true,
        bootstrap_stage: "prospects",
      });
    }

    const partnerBootstrapped = await hasSuccessfulRun(supabase, CORPORATE_PARTNER_DISCOVERY_ACTION);
    if (!partnerBootstrapped) {
      const result = await runCorporatePartnerDiscovery(supabase, {
        trigger: "cron",
        batchSize: 5,
      });
      return NextResponse.json({
        ...result,
        bootstrap: true,
        bootstrap_stage: "partners",
      });
    }

    const signalsBootstrapped = await hasSuccessfulRun(supabase, CORPORATE_SIGNAL_RESEARCH_ACTION);
    if (!signalsBootstrapped) {
      const result = await runCorporateCompanySignalResearch(supabase, {
        trigger: "cron",
        batchSize: 2,
      });
      return NextResponse.json({
        ...result,
        bootstrap: true,
        bootstrap_stage: "company_signals",
      });
    }

    const contactsBootstrapped = await hasSuccessfulRun(supabase, CORPORATE_GENERIC_CONTACT_ACTION);
    if (!contactsBootstrapped) {
      const result = await runCorporateGenericContactResearch(supabase, {
        trigger: "cron",
        batchSize: 3,
      });
      return NextResponse.json({
        ...result,
        bootstrap: true,
        bootstrap_stage: "generic_company_contacts",
      });
    }

    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "bootstrap_complete",
      current_prospects: current,
      partner_bootstrap_complete: true,
      signal_bootstrap_complete: true,
      company_contact_bootstrap_complete: true,
      personal_enrichment_started: false,
      outreach_started: false,
    });
  } catch (runError) {
    return NextResponse.json(
      {
        error: runError instanceof Error ? runError.message : "Corporate Homes bootstrap failed",
        personal_enrichment_started: false,
        outreach_started: false,
      },
      { status: 500 },
    );
  }
}
