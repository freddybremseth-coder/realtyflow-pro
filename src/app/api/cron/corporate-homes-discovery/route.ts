export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { discoverBrregCandidates } from "@/lib/corporate-brreg";
import { CORPORATE_PROSPECT_TARGET } from "@/lib/corporate-prospects";

export const maxDuration = 120;

const PATH = "/api/cron/corporate-homes-discovery";
const WEEKLY_BATCH = 25;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function identity(row: Record<string, any>) {
  const org = String(row.organization_number || "").trim();
  if (org) return `org:${org}`;
  const domain = String(row.domain || "").trim().toLowerCase();
  if (domain) return `domain:${domain}`;
  return `name:${String(row.company_name || "").trim().toLowerCase()}`;
}

async function logRun(
  supabase: ReturnType<typeof getSupabase>,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  if (!supabase) return;
  await supabase.from("automation_logs").insert({
    action: "corporate_homes_discovery",
    agent_name: "Zen Corporate Homes",
    status,
    details,
    created_at: new Date().toISOString(),
  });
}

/**
 * Weekly company-level prospect discovery.
 * Uses only Brønnøysundregistrene public entity data.
 * It never enriches people, sends outreach, or promotes prospects to CRM.
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
    });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const { count, error: countError } = await supabase
      .from("corporate_prospects")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", "zeneco");

    if (countError) throw countError;

    const current = Number(count || 0);
    if (current >= CORPORATE_PROSPECT_TARGET) {
      await logRun(supabase, "success", {
        skipped: true,
        reason: "target_reached",
        current,
        target: CORPORATE_PROSPECT_TARGET,
      });
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "target_reached",
        current,
        target: CORPORATE_PROSPECT_TARGET,
      });
    }

    const wanted = Math.min(WEEKLY_BATCH, CORPORATE_PROSPECT_TARGET - current);
    const discovery = await discoverBrregCandidates({
      minEmployees: 15,
      maxEmployees: 500,
      profile: "core",
      limit: 100,
      scanPages: 6,
    });

    const { data: existing, error: existingError } = await supabase
      .from("corporate_prospects")
      .select("organization_number,domain,company_name")
      .eq("brand_id", "zeneco")
      .limit(2000);

    if (existingError) throw existingError;

    const known = new Set((existing || []).map((row: any) => identity(row)));
    const selected = discovery.candidates
      .filter((row: any) => ["A", "B"].includes(String(row.fit_tier || "").toUpperCase()))
      .filter((row: any) => !known.has(identity(row)))
      .slice(0, wanted)
      .map((row: any) => ({
        ...row,
        source_type: "brreg_open_data_weekly",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    if (selected.length) {
      const { error: insertError } = await supabase
        .from("corporate_prospects")
        .insert(selected);
      if (insertError) throw insertError;
    }

    const result = {
      current_before: current,
      target: CORPORATE_PROSPECT_TARGET,
      requested_batch: wanted,
      discovered: discovery.candidates.length,
      imported: selected.length,
      current_after: current + selected.length,
      warnings: discovery.warnings,
      source: "Brønnøysundregistrene · Enhetsregisteret åpne data",
      personal_contact_enrichment: false,
      outreach_started: false,
    };

    await logRun(supabase, "success", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate Homes discovery failed";
    await logRun(supabase, "error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
