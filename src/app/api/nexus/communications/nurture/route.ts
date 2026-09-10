import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMMAND_ACTION = "crm_safe_nurture_command";
const DAY_MS = 86_400_000;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [key, numberValue(raw)] as const)
      .filter(([, count]) => count > 0),
  );
}

function commandView(row: any) {
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  return {
    id: String(row?.id || ""),
    status: String(row?.status || "success"),
    createdAt: row?.created_at ? String(row.created_at) : null,
    mode: stringValue(details.mode),
    outcome: stringValue(details.outcome),
    brandId: stringValue(details.brand_id),
    candidateCount: numberValue(details.candidate_count),
    blockedCount: numberValue(details.blocked_count),
    blockedReasons: numberRecord(details.blocked_reasons),
    byBrand: numberRecord(details.by_brand),
    batchSize: numberValue(details.batch_size),
    attempted: numberValue(details.attempted),
    started: numberValue(details.started),
    sent: numberValue(details.sent),
    failed: numberValue(details.failed),
    notStarted: numberValue(details.not_started),
    remaining: numberValue(details.remaining),
    reason: stringValue(details.reason),
  };
}

function summarizeNurture(rows: any[], sinceMs: number) {
  const cutoff = Date.now() - sinceMs;
  const recent = rows.filter((row) => {
    const raw = row.sent_at || row.created_at;
    const time = new Date(String(raw || "")).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
  const sent = recent.filter((row) => String(row.status || "").toLowerCase() === "sent" && !row.dry_run);
  const failed = recent.filter((row) => ["failed", "error"].includes(String(row.status || "").toLowerCase()));
  const dryRun = recent.filter((row) => row.dry_run || String(row.status || "").toLowerCase() === "dry_run");
  const byBrand = sent.reduce<Record<string, number>>((acc, row) => {
    const brand = String(row.brand_id || "unknown");
    acc[brand] = (acc[brand] || 0) + 1;
    return acc;
  }, {});
  return { sent: sent.length, failed: failed.length, dryRun: dryRun.length, byBrand };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since30d = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [commandsR, nurtureR, runtimeR] = await Promise.all([
    supabase
      .from("automation_logs")
      .select("id,status,details,created_at")
      .eq("action", COMMAND_ACTION)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_nurture_events")
      .select("brand_id,status,dry_run,created_at,sent_at")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("nexus_runtime_controls")
      .select("control_key,enabled,risk_level,updated_at")
      .eq("control_key", "feature:nurture_live")
      .maybeSingle(),
  ]);

  const firstError = commandsR.error || nurtureR.error || runtimeR.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const recentCommands = (commandsR.data || []).map(commandView);
  const nurtureRows = nurtureR.data || [];

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    runtime: runtimeR.data || null,
    latestCommand: recentCommands[0] || null,
    recentCommands,
    nurture7d: summarizeNurture(nurtureRows, 7 * DAY_MS),
    nurture30d: summarizeNurture(nurtureRows, 30 * DAY_MS),
    policy: {
      readOnly: true,
      executionHref: "/customers",
      note: "Nexus viser kontroll- og resultatdata. Selve bulk-starten må fortsatt forhåndsvises og startes eksplisitt fra CRM-kommandomenyen.",
    },
  });
}
