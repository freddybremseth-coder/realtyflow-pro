import type { SupabaseClient } from "@supabase/supabase-js";
import { runAccountDeepResearch, runCorporateWatch } from "@/lib/corporate-intelligence";

export const CORPORATE_INTELLIGENCE_ACCOUNT_PATH = "/api/cron/corporate-intelligence-accounts";
export const CORPORATE_INTELLIGENCE_WATCH_PATH = "/api/cron/corporate-intelligence-watch";
export const CORPORATE_INTELLIGENCE_ACCOUNT_BATCH = 3;
const ACCOUNT_TTL_MS = 7 * 86_400_000;

function websiteFor(row: Record<string, any>) {
  const direct = String(row.website_url || "").trim();
  if (direct) return direct;
  return String(row.domain || "").trim();
}

async function logRun(
  supabase: SupabaseClient,
  action: string,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  await supabase.from("automation_logs").insert({
    action,
    agent_name: "Zen bedriftsinnsikt",
    status,
    details,
    created_at: new Date().toISOString(),
  });
}

export async function runCorporateIntelligenceAccountBatch(
  supabase: SupabaseClient,
  options: { trigger?: "cron" | "manual"; batchSize?: number } = {},
) {
  const trigger = options.trigger || "cron";
  const batchSize = Math.min(
    CORPORATE_INTELLIGENCE_ACCOUNT_BATCH,
    Math.max(1, Math.round(options.batchSize ?? CORPORATE_INTELLIGENCE_ACCOUNT_BATCH)),
  );

  try {
    const { data: candidates, error } = await supabase
      .from("corporate_prospects")
      .select("id,company_name,website_url,domain,fit_tier,fit_score,status,updated_at")
      .eq("brand_id", "zeneco")
      .in("fit_tier", ["A", "B"])
      .neq("status", "DISQUALIFIED")
      .order("fit_score", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(150);
    if (error) throw error;

    const ids = (candidates || []).map((row: any) => String(row.id));
    const cutoff = new Date(Date.now() - ACCOUNT_TTL_MS).toISOString();
    const { data: recentRuns, error: recentError } = ids.length
      ? await supabase
          .from("corporate_intelligence_runs")
          .select("prospect_id,started_at")
          .eq("scope", "ACCOUNT")
          .eq("status", "SUCCESS")
          .in("prospect_id", ids)
          .gte("started_at", cutoff)
      : { data: [], error: null };
    if (recentError) throw recentError;

    const recentlyChecked = new Set((recentRuns || []).map((row: any) => String(row.prospect_id)));
    const selected = (candidates || [])
      .filter((row: any) => Boolean(websiteFor(row)))
      .filter((row: any) => !recentlyChecked.has(String(row.id)))
      .slice(0, batchSize);

    const results: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];
    for (const row of selected as any[]) {
      try {
        const result = await runAccountDeepResearch(supabase, String(row.id), { trigger });
        results.push({
          prospectId: row.id,
          companyName: row.company_name,
          fitTier: row.fit_tier,
          findingCount: result.findingCount,
          newCount: result.newCount,
          changedCount: result.changedCount,
          sourceCount: result.sourceCount,
        });
        warnings.push(...result.warnings.map((warning) => String(row.company_name) + ": " + warning));
      } catch (cause) {
        warnings.push(
          String(row.company_name) + ": " +
          (cause instanceof Error ? cause.message : "Bedriftsinnsikten feilet."),
        );
      }
    }

    const output = {
      success: true,
      trigger,
      selected: selected.length,
      completed: results.length,
      dailyBatchCap: CORPORATE_INTELLIGENCE_ACCOUNT_BATCH,
      accountTtlDays: ACCOUNT_TTL_MS / 86_400_000,
      results,
      warnings: [...new Set(warnings)].slice(0, 20),
      personalDataCollected: false,
      personalContactEnrichment: false,
      outreachStarted: false,
      pipelineMoved: false,
    };
    await logRun(supabase, "corporate_intelligence_accounts", "success", output);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batchkjøring for bedriftsinnsikt feilet";
    await logRun(supabase, "corporate_intelligence_accounts", "error", { error: message });
    throw error;
  }
}

export async function runCorporateIntelligenceWatch(
  supabase: SupabaseClient,
  options: { trigger?: "cron" | "manual" } = {},
) {
  const trigger = options.trigger || "cron";
  try {
    const market = await runCorporateWatch(supabase, "MARKET", { trigger });
    const regulatory = await runCorporateWatch(supabase, "REGULATORY", { trigger });
    const output = {
      success: true,
      trigger,
      market: {
        findingCount: market.findingCount,
        newCount: market.newCount,
        changedCount: market.changedCount,
        sourceCount: market.sourceCount,
      },
      regulatory: {
        findingCount: regulatory.findingCount,
        newCount: regulatory.newCount,
        changedCount: regulatory.changedCount,
        sourceCount: regulatory.sourceCount,
      },
      externalAction: false,
      outreachStarted: false,
      pipelineMoved: false,
    };
    await logRun(supabase, "corporate_intelligence_watch", "success", output);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Overvåking for bedriftsinnsikt feilet";
    await logRun(supabase, "corporate_intelligence_watch", "error", { error: message });
    throw error;
  }
}
