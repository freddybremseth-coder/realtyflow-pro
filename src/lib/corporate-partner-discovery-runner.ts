import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CORPORATE_PARTNER_DAILY_BATCH,
  CORPORATE_PARTNER_TARGET,
  discoverCorporatePartnerCandidates,
} from "@/lib/corporate-partner-discovery";

export const CORPORATE_PARTNER_DISCOVERY_ACTION = "corporate_homes_partner_discovery";
export const CORPORATE_PARTNER_DISCOVERY_PATH = "/api/cron/corporate-homes-partner-discovery";

export async function runCorporatePartnerDiscovery(
  supabase: SupabaseClient,
  options: { trigger?: "cron" | "manual"; batchSize?: number } = {},
) {
  const trigger = options.trigger || "cron";
  const batchSize = Math.min(
    CORPORATE_PARTNER_DAILY_BATCH,
    Math.max(1, Math.round(options.batchSize ?? CORPORATE_PARTNER_DAILY_BATCH)),
  );

  const { count, error: countError } = await supabase
    .from("corporate_partner_prospects")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", "zeneco");

  if (countError) throw countError;

  const current = Number(count || 0);
  if (current >= CORPORATE_PARTNER_TARGET) {
    const result = {
      success: true,
      skipped: true,
      reason: "target_reached",
      trigger,
      current,
      target: CORPORATE_PARTNER_TARGET,
      created: 0,
      personal_enrichment_started: false,
      outreach_started: false,
    };
    await supabase.from("automation_logs").insert({
      action: CORPORATE_PARTNER_DISCOVERY_ACTION,
      agent_name: "Zen Corporate Homes",
      status: "success",
      details: result,
      created_at: new Date().toISOString(),
    });
    return result;
  }

  const remaining = Math.min(batchSize, CORPORATE_PARTNER_TARGET - current);
  const { data: existingRows, error: existingError } = await supabase
    .from("corporate_partner_prospects")
    .select("organization_number,domain")
    .eq("brand_id", "zeneco")
    .limit(1000);

  if (existingError) throw existingError;

  const existing = new Set(
    (existingRows || []).flatMap((row: any) => [
      row.organization_number ? `org:${String(row.organization_number)}` : null,
      row.domain ? `domain:${String(row.domain).toLowerCase()}` : null,
    ].filter(Boolean) as string[]),
  );

  const discovered = await discoverCorporatePartnerCandidates({ perProfile: 10 });
  const selected = discovered.candidates
    .filter((candidate) => {
      const orgKey = candidate.organization_number ? `org:${candidate.organization_number}` : null;
      const domainKey = candidate.domain ? `domain:${candidate.domain.toLowerCase()}` : null;
      return !(orgKey && existing.has(orgKey)) && !(domainKey && existing.has(domainKey));
    })
    .slice(0, remaining);

  let created = 0;
  const inserted: Array<{ id: string; company_name: string; partner_type: string; fit_score: number }> = [];
  for (const candidate of selected) {
    const { data, error } = await supabase
      .from("corporate_partner_prospects")
      .insert({
        brand_id: "zeneco",
        ...candidate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id,company_name,partner_type,fit_score")
      .single();

    if (error) {
      if (String(error.code || "") === "23505") continue;
      throw error;
    }
    created += 1;
    inserted.push(data as any);
  }

  const result = {
    success: true,
    skipped: false,
    trigger,
    before: current,
    target: CORPORATE_PARTNER_TARGET,
    requestedBatch: remaining,
    discovered: discovered.candidates.length,
    created,
    warnings: discovered.warnings,
    profiles: discovered.profiles,
    personal_enrichment_started: false,
    outreach_started: false,
    inserted,
  };

  await supabase.from("automation_logs").insert({
    action: CORPORATE_PARTNER_DISCOVERY_ACTION,
    agent_name: "Zen Corporate Homes",
    status: "success",
    details: result,
    created_at: new Date().toISOString(),
  });

  return result;
}
