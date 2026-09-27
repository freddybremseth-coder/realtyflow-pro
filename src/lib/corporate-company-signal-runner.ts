import type { SupabaseClient } from "@supabase/supabase-js";
import { researchCorporateCompanySignals, signalEvidencePatch } from "@/lib/corporate-company-signals";
import { rescoreCorporateProspect } from "@/lib/corporate-prospects";

export const CORPORATE_SIGNAL_RESEARCH_ACTION = "corporate_homes_company_signals";
export const CORPORATE_SIGNAL_RESEARCH_PATH = "/api/cron/corporate-homes-company-signals";
export const CORPORATE_SIGNAL_RESEARCH_DAILY_BATCH = 8;
const RESEARCH_TTL_MS = 30 * 86_400_000;

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function researchDue(evidence: unknown, now: number) {
  const existing = objectValue(objectValue(evidence).company_signal_research);
  const checked = Date.parse(String(existing.checked_at || ""));
  return !Number.isFinite(checked) || now - checked >= RESEARCH_TTL_MS;
}

function websiteFor(row: Record<string, any>) {
  const direct = String(row.website_url || "").trim();
  if (direct) return /^https?:\/\//i.test(direct) ? direct : `https://${direct}`;
  const domain = String(row.domain || "").trim();
  if (!domain) return "";
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

async function logRun(
  supabase: SupabaseClient,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  await supabase.from("automation_logs").insert({
    action: CORPORATE_SIGNAL_RESEARCH_ACTION,
    agent_name: "Zen Corporate Homes",
    status,
    details,
    created_at: new Date().toISOString(),
  });
}

export async function runCorporateCompanySignalResearch(
  supabase: SupabaseClient,
  options: { trigger?: "cron" | "manual"; batchSize?: number } = {},
) {
  const trigger = options.trigger || "cron";
  const batchSize = Math.min(
    CORPORATE_SIGNAL_RESEARCH_DAILY_BATCH,
    Math.max(1, Math.round(options.batchSize ?? CORPORATE_SIGNAL_RESEARCH_DAILY_BATCH)),
  );
  const now = Date.now();

  try {
    const { data: rows, error } = await supabase
      .from("corporate_prospects")
      .select("id,brand_id,company_name,organization_type,country_code,industry,employee_count,employee_band,member_count,domain,website_url,decision_roles,source_url,evidence,fit_score,fit_tier,status")
      .eq("brand_id", "zeneco")
      .neq("status", "DISQUALIFIED")
      .order("fit_score", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(500);

    if (error) throw error;

    const selected = (rows || [])
      .filter((row: any) => Boolean(websiteFor(row)))
      .filter((row: any) => researchDue(row.evidence, now))
      .slice(0, batchSize);

    let researched = 0;
    let changedToA = 0;
    let signalsFound = 0;
    const warnings: string[] = [];
    const results: Array<Record<string, unknown>> = [];

    for (const row of selected as any[]) {
      const website = websiteFor(row);
      try {
        const research = await researchCorporateCompanySignals(website);
        const signalCount = Object.keys(research.signals).length;
        const existingEvidence = objectValue(row.evidence);
        const nextEvidence = {
          ...existingEvidence,
          ...signalEvidencePatch(research),
        };
        const score = rescoreCorporateProspect({ ...row, evidence: nextEvidence });

        const { error: updateError } = await supabase
          .from("corporate_prospects")
          .update({
            evidence: nextEvidence,
            ...score,
            next_action: score.fit_tier === "A"
              ? "Gjennomgå dokumenterte selskaps-signaler og vurder menneskelig kvalifisering før eventuell kontaktperson identifiseres."
              : "Fortsett selskapsresearch. A-fit krever sterkere dokumenterte kjøpssignaler før kontaktperson identifiseres.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateError) throw updateError;

        researched += 1;
        signalsFound += signalCount;
        if (String(row.fit_tier || "").toUpperCase() !== "A" && score.fit_tier === "A") changedToA += 1;
        results.push({
          id: row.id,
          company_name: row.company_name,
          pages_checked: research.pages_checked.length,
          signal_count: signalCount,
          fit_before: row.fit_tier,
          fit_after: score.fit_tier,
          score_after: score.fit_score,
        });
        warnings.push(...research.warnings.map((warning) => `${row.company_name}: ${warning}`));
      } catch (researchError) {
        const warning = researchError instanceof Error ? researchError.message : "Signalresearch feilet.";
        const existingEvidence = objectValue(row.evidence);
        const failedResearch = {
          website_url: website,
          checked_at: new Date().toISOString(),
          pages_checked: [],
          signals: {},
          warnings: [warning],
          personal_data_collected: false,
        };
        await supabase
          .from("corporate_prospects")
          .update({
            evidence: {
              ...existingEvidence,
              company_signal_research: failedResearch,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        researched += 1;
        warnings.push(`${row.company_name}: ${warning}`);
      }
    }

    const result = {
      success: true,
      trigger,
      selected: selected.length,
      researched,
      signals_found: signalsFound,
      changed_to_a_fit: changedToA,
      daily_batch_cap: CORPORATE_SIGNAL_RESEARCH_DAILY_BATCH,
      personal_data_collected: false,
      personal_contact_enrichment: false,
      outreach_started: false,
      warnings: [...new Set(warnings)].slice(0, 20),
      results,
    };
    await logRun(supabase, "success", result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate company signal research failed";
    await logRun(supabase, "error", {
      error: message,
      trigger,
      personal_data_collected: false,
      personal_contact_enrichment: false,
      outreach_started: false,
    });
    throw error;
  }
}
