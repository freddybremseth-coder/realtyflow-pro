import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit") || 12)));
  const { data, error } = await supabase
    .from("agentic_approvals")
    .select("id,title,gated_action_class,subject_ref,reason,risk,decision_mode,confidence,status,created_at,resolved_at,executed_at,execution_detail")
    .eq("gated_action_class", "publish_social")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row: any) => ({
    id: String(row.id),
    title: String(row.title || "Publisering"),
    publicationId: row.subject_ref ? String(row.subject_ref) : null,
    status: String(row.status || "pending"),
    risk: row.risk ? String(row.risk) : null,
    decisionMode: row.decision_mode ? String(row.decision_mode) : null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    reason: row.reason ? String(row.reason) : null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    executedAt: row.executed_at,
    executionDetail: row.execution_detail ? String(row.execution_detail) : null,
    approvalHref: `/approvals?approvalId=${encodeURIComponent(String(row.id))}#agentic-approval-${encodeURIComponent(String(row.id))}`,
  }));

  return NextResponse.json({
    summary: {
      total: rows.length,
      pending: rows.filter((row) => row.status === "pending").length,
      approved: rows.filter((row) => row.status === "approved").length,
      executed: rows.filter((row) => row.status === "executed").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
    },
    rows,
  });
}
