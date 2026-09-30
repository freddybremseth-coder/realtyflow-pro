import type { SupabaseClient } from "@supabase/supabase-js";
import { researchGenericCompanyContactChannel } from "@/lib/corporate-generic-contact-channel";

export const CORPORATE_GENERIC_CONTACT_ACTION = "corporate_homes_generic_contacts";
export const CORPORATE_GENERIC_CONTACT_PATH = "/api/cron/corporate-homes-generic-contacts";
export const CORPORATE_GENERIC_CONTACT_DAILY_BATCH = 10;
const CONTACT_TTL_MS = 30 * 86_400_000;

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function websiteFor(row: Record<string, any>) {
  const direct = String(row.website_url || "").trim();
  if (direct) return /^https?:\/\//i.test(direct) ? direct : "https://" + direct;
  const domain = String(row.domain || "").trim();
  if (!domain) return "";
  return /^https?:\/\//i.test(domain) ? domain : "https://" + domain;
}

function researchDue(evidence: unknown, now: number) {
  const existing = objectValue(objectValue(evidence).generic_company_contact);
  const checked = Date.parse(String(existing.checked_at || ""));
  return !Number.isFinite(checked) || now - checked >= CONTACT_TTL_MS;
}

function hasDocumentedOutboundBasis(row: Record<string, any>) {
  if (String(row.fit_tier || "").toUpperCase() === "A") return true;
  if (row.queue === "partner" && String(row.referral_angle || "").trim()) return true;
  const signalResearch = objectValue(objectValue(row.evidence).company_signal_research);
  const signals = objectValue(signalResearch.signals);
  return Object.keys(signals).length > 0;
}

async function logRun(
  supabase: SupabaseClient,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  await supabase.from("automation_logs").insert({
    action: CORPORATE_GENERIC_CONTACT_ACTION,
    agent_name: "Zen Corporate Homes",
    status,
    details,
    created_at: new Date().toISOString(),
  });
}

export async function runCorporateGenericContactResearch(
  supabase: SupabaseClient,
  options: { trigger?: "cron" | "manual"; batchSize?: number } = {},
) {
  const trigger = options.trigger || "cron";
  const batchSize = Math.min(
    CORPORATE_GENERIC_CONTACT_DAILY_BATCH,
    Math.max(1, Math.round(options.batchSize ?? CORPORATE_GENERIC_CONTACT_DAILY_BATCH)),
  );
  const now = Date.now();

  try {
    const [
      { data: partners, error: partnerError },
      { data: prospects, error: prospectError },
    ] = await Promise.all([
      supabase
        .from("corporate_partner_prospects")
        .select("id,company_name,domain,website_url,evidence,fit_score,fit_tier,status,updated_at,referral_angle")
        .eq("brand_id", "zeneco")
        .in("fit_tier", ["A", "B"])
        .neq("status", "DISQUALIFIED")
        .order("fit_score", { ascending: false })
        .limit(250),
      supabase
        .from("corporate_prospects")
        .select("id,company_name,domain,website_url,evidence,fit_score,fit_tier,status,updated_at")
        .eq("brand_id", "zeneco")
        .in("fit_tier", ["A", "B"])
        .neq("status", "DISQUALIFIED")
        .order("fit_score", { ascending: false })
        .limit(500),
    ]);

    if (partnerError) throw partnerError;
    if (prospectError) throw prospectError;

    const candidates = [
      ...(partners || []).map((row: any) => ({ ...row, queue: "partner" as const })),
      ...(prospects || []).map((row: any) => ({ ...row, queue: "prospect" as const })),
    ]
      .filter((row: any) => Boolean(websiteFor(row)))
      .filter((row: any) => researchDue(row.evidence, now))
      .sort((a: any, b: any) => {
        const basisDelta = Number(hasDocumentedOutboundBasis(b)) - Number(hasDocumentedOutboundBasis(a));
        if (basisDelta) return basisDelta;
        const tierRank = (value: string) => value === "A" ? 2 : value === "B" ? 1 : 0;
        const tierDelta = tierRank(String(b.fit_tier || "").toUpperCase()) - tierRank(String(a.fit_tier || "").toUpperCase());
        if (tierDelta) return tierDelta;
        if (a.queue !== b.queue) return a.queue === "partner" ? -1 : 1;
        return Number(b.fit_score || 0) - Number(a.fit_score || 0);
      })
      .slice(0, batchSize);

    const results: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];
    let genericEmailsFound = 0;
    let contactPagesFound = 0;

    for (const row of candidates as any[]) {
      const website = websiteFor(row);
      try {
        const contact = await researchGenericCompanyContactChannel(website);
        const existingEvidence = objectValue(row.evidence);
        const table = row.queue === "partner"
          ? "corporate_partner_prospects"
          : "corporate_prospects";

        const { error: updateError } = await supabase
          .from(table)
          .update({
            evidence: {
              ...existingEvidence,
              generic_company_contact: contact,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("brand_id", "zeneco");

        if (updateError) throw updateError;

        if (contact.generic_email) genericEmailsFound += 1;
        if (contact.contact_page_url) contactPagesFound += 1;
        warnings.push(...contact.warnings.map((warning) => row.company_name + ": " + warning));
        results.push({
          id: row.id,
          queue: row.queue,
          company_name: row.company_name,
          generic_email_found: Boolean(contact.generic_email),
          contact_page_found: Boolean(contact.contact_page_url),
          pages_checked: contact.pages_checked.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generic company contact research failed";
        warnings.push(row.company_name + ": " + message);
      }
    }

    const result = {
      success: true,
      trigger,
      selected: candidates.length,
      researched: results.length,
      generic_emails_found: genericEmailsFound,
      contact_pages_found: contactPagesFound,
      daily_batch_cap: CORPORATE_GENERIC_CONTACT_DAILY_BATCH,
      company_level_only: true,
      personal_data_collected: false,
      personal_contact_enrichment: false,
      outreach_started: false,
      warnings: [...new Set(warnings)].slice(0, 20),
      results,
    };
    await logRun(supabase, "success", result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate generic contact research failed";
    await logRun(supabase, "error", {
      error: message,
      trigger,
      company_level_only: true,
      personal_data_collected: false,
      personal_contact_enrichment: false,
      outreach_started: false,
    });
    throw error;
  }
}
