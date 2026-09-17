import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

const SUCCESSFUL_PUBLICATION_STATES = new Set(["published", "scheduled"]);

type PublicationRow = {
  marketing_run_id?: string | null;
  state?: string | null;
  updated_at?: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function marketingRunResultsAreSuccessful(results: Array<{ state?: string | null }>) {
  return results.length > 0 && results.every((row) => SUCCESSFUL_PUBLICATION_STATES.has(normalize(row.state)));
}

export function successfulMarketingRunIds(rows: PublicationRow[]) {
  const grouped = new Map<string, PublicationRow[]>();
  for (const row of rows) {
    const runId = String(row.marketing_run_id ?? "").trim();
    if (!runId) continue;
    const bucket = grouped.get(runId) ?? [];
    bucket.push(row);
    grouped.set(runId, bucket);
  }

  return [...grouped.entries()]
    .filter(([, publications]) => marketingRunResultsAreSuccessful(publications))
    .map(([runId]) => runId)
    .sort();
}

export async function finalizeSuccessfulMarketingRun(
  supabase: MarketingSupabaseLike,
  runId: string,
  at = new Date().toISOString(),
) {
  const [agentResult, marketingResult] = await Promise.all([
    supabase
      .from("agent_runs")
      .update({ status: "completed", outcome: "executed", finished_at: at, updated_at: at })
      .eq("id", runId)
      .eq("agent_id", "marketing-growth-os")
      .eq("status", "running"),
    supabase
      .from("marketing_runs")
      .update({ stage: "done", updated_at: at })
      .eq("marketing_run_id", runId),
  ]);

  return {
    runId,
    completed: !agentResult?.error && !marketingResult?.error,
    errors: [agentResult?.error?.message, marketingResult?.error?.message].filter(Boolean),
  };
}

export async function finalizeMarketingRunIfSuccessful(
  supabase: MarketingSupabaseLike,
  runId: string,
  results: Array<{ state?: string | null }>,
  at = new Date().toISOString(),
) {
  if (!marketingRunResultsAreSuccessful(results)) {
    return { runId, completed: false, skipped: true, reason: "non_terminal_or_non_success_state", errors: [] as string[] };
  }
  const finalized = await finalizeSuccessfulMarketingRun(supabase, runId, at);
  return { ...finalized, skipped: false, reason: finalized.completed ? "all_publications_successful" : "lifecycle_update_failed" };
}

export async function reconcileSuccessfulMarketingRuns(
  supabase: MarketingSupabaseLike,
  opts: { limit?: number; now?: string } = {},
) {
  const limit = Math.max(1, Math.min(opts.limit ?? 1000, 5000));
  const { data: runningRuns, error: runsError } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_id", "marketing-growth-os")
    .eq("status", "running")
    .limit(limit);

  if (runsError) {
    return { scanned: 0, candidates: 0, reconciled: 0, errors: [`RUN_SCAN_FAILED: ${runsError.message}`] };
  }

  const runIds = (runningRuns ?? []).map((row: any) => String(row.id ?? "").trim()).filter(Boolean);
  if (!runIds.length) return { scanned: 0, candidates: 0, reconciled: 0, errors: [] as string[] };

  const { data: publications, error: publicationsError } = await supabase
    .from("marketing_publications")
    .select("marketing_run_id,state,updated_at")
    .in("marketing_run_id", runIds)
    .limit(10000);

  if (publicationsError) {
    return { scanned: runIds.length, candidates: 0, reconciled: 0, errors: [`PUBLICATION_SCAN_FAILED: ${publicationsError.message}`] };
  }

  const successfulIds = successfulMarketingRunIds((publications ?? []) as PublicationRow[]);
  if (!successfulIds.length) return { scanned: runIds.length, candidates: 0, reconciled: 0, errors: [] as string[] };

  const at = opts.now ?? new Date().toISOString();
  const [agentResult, marketingResult] = await Promise.all([
    supabase
      .from("agent_runs")
      .update({ status: "completed", outcome: "executed", finished_at: at, updated_at: at })
      .in("id", successfulIds)
      .eq("agent_id", "marketing-growth-os")
      .eq("status", "running"),
    supabase
      .from("marketing_runs")
      .update({ stage: "done", updated_at: at })
      .in("marketing_run_id", successfulIds),
  ]);

  const errors = [agentResult?.error?.message, marketingResult?.error?.message].filter(Boolean) as string[];
  return {
    scanned: runIds.length,
    candidates: successfulIds.length,
    reconciled: errors.length ? 0 : successfulIds.length,
    errors,
  };
}
