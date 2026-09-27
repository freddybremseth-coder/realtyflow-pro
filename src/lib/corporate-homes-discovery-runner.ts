import type { SupabaseClient } from "@supabase/supabase-js";
import { discoverBrregCandidates, type BrregIndustryProfile } from "@/lib/corporate-brreg";
import { CORPORATE_PROSPECT_TARGET } from "@/lib/corporate-prospects";

export const CORPORATE_DISCOVERY_ACTION = "corporate_homes_discovery";
export const CORPORATE_DISCOVERY_PATH = "/api/cron/corporate-homes-discovery";
export const CORPORATE_DISCOVERY_DAILY_BATCH = 25;

function identity(row: Record<string, any>) {
  const org = String(row.organization_number || "").trim();
  if (org) return `org:${org}`;
  const domain = String(row.domain || "").trim().toLowerCase();
  if (domain) return `domain:${domain}`;
  return `name:${String(row.company_name || "").trim().toLowerCase()}`;
}

async function logRun(
  supabase: SupabaseClient,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  await supabase.from("automation_logs").insert({
    action: CORPORATE_DISCOVERY_ACTION,
    agent_name: "Zen Corporate Homes",
    status,
    details,
    created_at: new Date().toISOString(),
  });
}

export type CorporateDiscoveryRunOptions = {
  batchSize?: number;
  minEmployees?: number;
  maxEmployees?: number;
  profile?: BrregIndustryProfile;
  sourceType?: string;
  trigger?: "cron" | "manual";
};

export async function runCorporateHomesDiscovery(
  supabase: SupabaseClient,
  options: CorporateDiscoveryRunOptions = {},
) {
  const batchSize = Math.min(100, Math.max(1, Math.round(options.batchSize ?? CORPORATE_DISCOVERY_DAILY_BATCH)));
  const minEmployees = Math.max(5, Math.round(options.minEmployees ?? 15));
  const maxEmployees = Math.max(minEmployees, Math.round(options.maxEmployees ?? 500));
  const profile = options.profile ?? "core";
  const sourceType = options.sourceType || (options.trigger === "manual" ? "brreg_open_data_manual" : "brreg_open_data_daily");
  const trigger = options.trigger || "cron";

  try {
    const { count, error: countError } = await supabase
      .from("corporate_prospects")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", "zeneco");

    if (countError) throw countError;

    const current = Number(count || 0);
    if (current >= CORPORATE_PROSPECT_TARGET) {
      const result = {
        success: true,
        skipped: true,
        reason: "target_reached",
        trigger,
        current_before: current,
        current_after: current,
        target: CORPORATE_PROSPECT_TARGET,
        imported: 0,
        discovered: 0,
        warnings: [] as string[],
        source: "Brønnøysundregistrene · Enhetsregisteret åpne data",
        personal_contact_enrichment: false,
        outreach_started: false,
      };
      await logRun(supabase, "success", result);
      return result;
    }

    const wanted = Math.min(batchSize, CORPORATE_PROSPECT_TARGET - current);
    const discovery = await discoverBrregCandidates({
      minEmployees,
      maxEmployees,
      profile,
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
    const batchSeen = new Set<string>();

    const selected = discovery.candidates
      .filter((row: any) => ["A", "B"].includes(String(row.fit_tier || "").toUpperCase()))
      .filter((row: any) => {
        const key = identity(row);
        if (known.has(key) || batchSeen.has(key)) return false;
        batchSeen.add(key);
        return true;
      })
      .slice(0, wanted)
      .map((row: any) => ({
        ...row,
        status: "RESEARCHED",
        source_type: sourceType,
        next_action: row.next_action || "Åpne beslutningsgrunnlaget, bekreft target-account fit og kvalifiser menneskelig før CRM-promotering.",
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
      success: true,
      skipped: false,
      trigger,
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
      auto_stage: "RESEARCHED",
      human_qualification_required: true,
      filters: { minEmployees, maxEmployees, profile },
    };

    await logRun(supabase, "success", result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate Homes discovery failed";
    await logRun(supabase, "error", {
      error: message,
      trigger,
      personal_contact_enrichment: false,
      outreach_started: false,
    });
    throw error;
  }
}
