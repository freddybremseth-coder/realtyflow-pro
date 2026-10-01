import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OutboundDraftError,
  outboundCandidateHasDocumentedBasis,
  outboundCandidateIsExistingRelationship,
  prepareOutboundDraft,
  type OutboundCandidateSource,
} from "@/lib/outbound-engagement/draft-preparation";

export const OUTBOUND_AUTO_DRAFT_ACTION = "outbound_auto_draft_prep";
export const OUTBOUND_AUTO_DRAFT_PATH = "/api/cron/outbound-draft-prep";
export const OUTBOUND_AUTO_DRAFT_BATCH = 3;


function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function officialChannelReady(row: Record<string, any>) {
  const evidence = objectValue(row.evidence);
  const contact = objectValue(evidence.generic_company_contact);
  const email = String(contact.generic_email || "").trim();
  const contactPage = String(contact.contact_page_url || "").trim();
  return Boolean(email || contactPage) &&
    contact.personal_data_collected !== true &&
    contact.company_level_only !== false;
}

function rank(row: Record<string, any>) {
  const tier = String(row.fit_tier || "").toUpperCase() === "A" ? 1000 : 0;
  return tier + Number(row.fit_score || 0);
}

function startOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function runOutboundAutoDraftPrep(
  supabase: SupabaseClient,
  options: { trigger?: "cron" | "manual"; batchSize?: number } = {},
) {
  const trigger = options.trigger || "cron";
  const requestedBatch = Math.max(1, Math.min(OUTBOUND_AUTO_DRAFT_BATCH, Math.round(options.batchSize ?? OUTBOUND_AUTO_DRAFT_BATCH)));

  const { data: policy, error: policyError } = await supabase
    .from("nexus_autonomy_policies")
    .select("action_class,mode,daily_limit")
    .eq("action_class", "outreach_draft")
    .maybeSingle();
  if (policyError) throw policyError;
  if (!policy || String(policy.mode) !== "auto") {
    return { success: true, skipped: true, reason: "outreach_draft policy is not AUTO", prepared: 0 };
  }

  const dailyLimit = Math.max(0, Number(policy.daily_limit ?? 50));
  const { count: preparedToday, error: countError } = await supabase
    .from("automation_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "outreach_draft_prepared")
    .gte("created_at", startOfUtcDayIso());
  if (countError) throw countError;

  const remainingToday = Math.max(0, dailyLimit - Number(preparedToday || 0));
  const batchSize = Math.min(requestedBatch, remainingToday);
  if (batchSize <= 0) {
    return { success: true, skipped: true, reason: "daily policy limit reached", prepared: 0, dailyLimit, preparedToday: Number(preparedToday || 0) };
  }

  const [{ data: buyers, error: buyersError }, { data: partners, error: partnersError }] = await Promise.all([
    supabase
      .from("corporate_prospects")
      .select("id,company_name,status,fit_tier,fit_score,evidence")
      .eq("brand_id", "zeneco")
      .in("fit_tier", ["A", "B"])
      .order("fit_score", { ascending: false })
      .limit(300),
    supabase
      .from("corporate_partner_prospects")
      .select("id,company_name,status,fit_tier,fit_score,evidence,referral_angle,partner_type")
      .eq("brand_id", "zeneco")
      .in("fit_tier", ["A", "B"])
      .order("fit_score", { ascending: false })
      .limit(200),
  ]);
  if (buyersError) throw buyersError;
  if (partnersError) throw partnersError;

  const candidates = [
    ...(buyers || []).map((row: any) => ({ ...row, source: "corporate_buyer" as OutboundCandidateSource })),
    ...(partners || []).map((row: any) => ({ ...row, source: "corporate_partner" as OutboundCandidateSource })),
  ]
    .filter((row: any) => !outboundCandidateIsExistingRelationship(row))
    .filter((row: any) => officialChannelReady(row))
    .filter((row: any) => outboundCandidateHasDocumentedBasis(row, row.source))
    .sort((a: any, b: any) => rank(b) - rank(a));

  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  let prepared = 0;
  let existing = 0;

  for (const candidate of candidates) {
    if (prepared >= batchSize) break;
    try {
      const result = await prepareOutboundDraft(supabase, {
        candidateId: String(candidate.id),
        source: candidate.source,
        trigger: "cron",
      });
      if (result.existing) {
        existing += 1;
        continue;
      }
      prepared += 1;
      results.push({
        candidate_id: candidate.id,
        source: candidate.source,
        company_name: candidate.company_name,
        work_item_id: result.workItem?.id || null,
      });
    } catch (error) {
      errors.push({
        candidate_id: candidate.id,
        source: candidate.source,
        company_name: candidate.company_name,
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof OutboundDraftError ? error.status : 500,
      });
    }
  }

  const details = {
    success: errors.length === 0,
    trigger,
    eligible: candidates.length,
    batch_cap: OUTBOUND_AUTO_DRAFT_BATCH,
    requested_batch: requestedBatch,
    daily_limit: dailyLimit,
    prepared_today_before_run: Number(preparedToday || 0),
    prepared,
    existing,
    errors: errors.slice(0, 10),
    results,
    send_executed: false,
    external_action_executed: false,
    cold_send_allowed: false,
  };

  await supabase.from("automation_logs").insert({
    action: OUTBOUND_AUTO_DRAFT_ACTION,
    agent_name: "nexus_outbound_draft",
    status: errors.length ? "partial" : "success",
    details,
    created_at: new Date().toISOString(),
  });

  return details;
}
