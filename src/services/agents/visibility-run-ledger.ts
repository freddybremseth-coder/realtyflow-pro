/**
 * Operational ledger for the independently read-only Visibility follow-up.
 *
 * This is NOT evidence of a repaired website. Only individual
 * visibility_independent_investigation records contain remeasured evidence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const VISIBILITY_RUN_ACTION = "visibility_investigation_run";
export type VisibilityRunSource = "cron" | "owner";
export type VisibilityRunOutcome = "COMPLETED" | "SKIPPED" | "FAILED";
export type VisibilityRunReason =
  | "SAFE_MODE" | "MISSING_DATABASE" | "SOURCE_REPORT_UNAVAILABLE"
  | "SOURCE_REPORT_STALE" | "NO_ELIGIBLE_TASKS" | "INVESTIGATION_ERROR"
  | "NONE";
export type VisibilityRunEntry = {
  source: VisibilityRunSource;
  outcome: VisibilityRunOutcome;
  reason: VisibilityRunReason;
  investigated: number;
  failed: number;
  skipped: number;
  readOnly: true;
  executionStarted: false;
  publicationAuthorized: false;
  resolutionVerified: false;
};
export type VisibilityRunStatus = VisibilityRunEntry & { recordedAt: string };

export function makeVisibilityRunEntry(
  source: VisibilityRunSource,
  outcome: VisibilityRunOutcome,
  reason: VisibilityRunReason,
  counts: { investigated?: number; failed?: number; skipped?: number } = {},
): VisibilityRunEntry {
  const count = (n: number | undefined): number =>
    Number.isSafeInteger(n) && n! >= 0 ? n! : 0;
  return {
    source, outcome, reason,
    investigated: count(counts.investigated),
    failed: count(counts.failed),
    skipped: count(counts.skipped),
    readOnly: true, executionStarted: false,
    publicationAuthorized: false, resolutionVerified: false,
  };
}

export async function recordVisibilityRun(
  db: SupabaseClient,
  entry: VisibilityRunEntry,
): Promise<boolean> {
  try {
  const { error } = await db.from("automation_logs").insert({
    action: VISIBILITY_RUN_ACTION,
    agent_name: "Sam SEO Expert",
    status: entry.outcome === "COMPLETED" ? "success" : "partial",
    details: {
      source: entry.source,
      outcome: entry.outcome,
      reason: entry.reason,
      investigated: entry.investigated,
      failed: entry.failed,
      skipped: entry.skipped,
      read_only: true,
      execution_started: false,
      publication_authorized: false,
      resolution_verified: false,
    },
  });
  return !error;
  } catch {
    return false;
  }
}

export function parseVisibilityRunStatus(
  row: { created_at?: unknown; details?: unknown } | null | undefined,
): VisibilityRunStatus | null {
  if (!row || typeof row.created_at !== "string" ||
      !Number.isFinite(Date.parse(row.created_at))) return null;
  const d = row.details as (Partial<VisibilityRunEntry> & {
    read_only?: unknown; execution_started?: unknown;
    publication_authorized?: unknown; resolution_verified?: unknown;
  }) | null;
  if (!d || (d.source !== "cron" && d.source !== "owner") ||
      !["COMPLETED", "SKIPPED", "FAILED"].includes(String(d.outcome)) ||
      !["SAFE_MODE", "MISSING_DATABASE", "SOURCE_REPORT_UNAVAILABLE",
        "SOURCE_REPORT_STALE", "NO_ELIGIBLE_TASKS", "INVESTIGATION_ERROR",
        "NONE"].includes(String(d.reason)) ||
      d.read_only !== true || d.publication_authorized !== false ||
      d.resolution_verified !== false || d.execution_started !== false) return null;
  const n = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {
    source: d.source, outcome: d.outcome as VisibilityRunOutcome,
    reason: d.reason as VisibilityRunReason,
    investigated: n(d.investigated), failed: n(d.failed), skipped: n(d.skipped),
    readOnly: true, executionStarted: false,
    publicationAuthorized: false, resolutionVerified: false,
    recordedAt: row.created_at,
  };
}
