import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import { buildNexusSyncHealth, type NexusSyncRunLike } from "@/lib/nexus-sync-health";
import {
  buildCommercialTargetEvidence,
  commercialTargetConfigByPipeline,
  targetsFromGrowthPlanRows,
  type MarketingGrowthPlanTargetRow,
} from "@/lib/nexus-commercial-targets";
import {
  buildNexusMissionStateProjection,
  type NexusMissionApprovalRow,
  type NexusMissionRunRow,
} from "@/lib/nexus-mission-state";

export interface NexusRevenueCommandFilters {
  brand?: string | null;
  pipeline?: string | null;
}

type NexusOpportunityReadRow = NexusOpportunityStoreRow & { created_at?: string | null };

export function buildNexusRevenueCommandReadModel(
  opportunityRows: NexusOpportunityReadRow[],
  syncRun: NexusSyncRunLike | null,
  storeCount: number,
  readWarnings: string[] = [],
  targetRows: MarketingGrowthPlanTargetRow[] = [],
  now = new Date(),
) {
  const syncHealth = buildNexusSyncHealth(syncRun, storeCount, now);
  const targets = targetsFromGrowthPlanRows(targetRows);
  const commercialTargets = buildCommercialTargetEvidence(targets, opportunityRows, syncHealth, now);
  const directorConfig = commercialTargetConfigByPipeline(commercialTargets);
  const snapshot = buildNexusRevenueCommandCenter(opportunityRows, now, directorConfig);
  const snapshotWarnings = Array.isArray((snapshot as { warnings?: unknown[] }).warnings)
    ? ((snapshot as { warnings?: unknown[] }).warnings || []).map(String)
    : [];

  return {
    ...snapshot,
    syncHealth,
    commercialTargets,
    warnings: [...snapshotWarnings, ...readWarnings],
  };
}

export async function loadNexusRevenueCommandSnapshot(
  supabase: SupabaseClient,
  filters: NexusRevenueCommandFilters = {},
) {
  let opportunityQuery = supabase
    .from("nexus_business_opportunities")
    .select("contact_id,brand_id,offer_id,pipeline_id,stage_id,lifecycle_phase,opportunity_state,title,reason,next_action,priority,priority_score,value,currency,route_confidence,route_reason,source_system,source_id,source_updated_at,last_activity_at,metadata,created_at")
    .in("opportunity_state", ["active", "won"])
    .order("priority_score", { ascending: false })
    .limit(1000);

  const brand = String(filters.brand || "").trim();
  const pipeline = String(filters.pipeline || "").trim();
  if (brand) opportunityQuery = opportunityQuery.eq("brand_id", brand);
  if (pipeline) opportunityQuery = opportunityQuery.eq("pipeline_id", pipeline);

  const [opportunitiesResult, syncRunResult, storeCountResult, targetPlansResult] = await Promise.all([
    opportunityQuery,
    supabase
      .from("automation_runs")
      .select("status,input,output,error,started_at,finished_at")
      .eq("input->>path", "/api/cron/nexus-opportunity-sync")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nexus_business_opportunities")
      .select("source_id", { count: "exact", head: true })
      .in("opportunity_state", ["active", "won"]),
    supabase
      .from("marketing_brand_growth_plans")
      .select("brand_id,status,metadata")
      .eq("status", "active"),
  ]);

  if (opportunitiesResult.error) throw new Error(`Opportunity Store: ${opportunitiesResult.error.message}`);

  const warnings: string[] = [];
  if (syncRunResult.error) warnings.push(`Opportunity Sync audit kunne ikke leses: ${syncRunResult.error.message}`);
  if (storeCountResult.error) warnings.push(`Opportunity Store count kunne ikke leses: ${storeCountResult.error.message}`);
  if (targetPlansResult.error) warnings.push(`Commercial targets kunne ikke leses: ${targetPlansResult.error.message}`);

  return buildNexusRevenueCommandReadModel(
    (opportunitiesResult.data || []) as NexusOpportunityReadRow[],
    syncRunResult.error ? null : (syncRunResult.data as NexusSyncRunLike | null),
    storeCountResult.error ? (opportunitiesResult.data || []).length : Number(storeCountResult.count || 0),
    warnings,
    targetPlansResult.error ? [] : (targetPlansResult.data || []) as MarketingGrowthPlanTargetRow[],
  );
}

export function buildNexusMissionStateReadModel(
  runs: NexusMissionRunRow[],
  approvals: NexusMissionApprovalRow[] = [],
) {
  const states = buildNexusMissionStateProjection(runs, approvals);
  return {
    generatedAt: new Date().toISOString(),
    states,
    summary: states.reduce<Record<string, number>>((acc, row) => {
      acc[row.operationalState] = (acc[row.operationalState] || 0) + 1;
      return acc;
    }, {}),
    safety: { readOnly: true, source: "agent_runs+agentic_approvals" },
  };
}

export async function loadNexusMissionStateSnapshot(supabase: SupabaseClient) {
  const runResult = await supabase
    .from("agent_runs")
    .select("id,agent_id,status,outcome,steps,started_at,finished_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (runResult.error) throw new Error(`Mission runs: ${runResult.error.message}`);

  const runs = ((runResult.data || []) as NexusMissionRunRow[])
    .filter((row) => String(row.agent_id || "").startsWith("nexus_"));
  const runIds = runs.map((row) => row.id);

  let approvals: NexusMissionApprovalRow[] = [];
  if (runIds.length) {
    const approvalResult = await supabase
      .from("agentic_approvals")
      .select("id,run_id,subject_ref,status,created_at,resolved_at,executed_at")
      .in("run_id", runIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (approvalResult.error) throw new Error(`Mission approvals: ${approvalResult.error.message}`);
    approvals = (approvalResult.data || []) as NexusMissionApprovalRow[];
  }

  return buildNexusMissionStateReadModel(runs, approvals);
}
