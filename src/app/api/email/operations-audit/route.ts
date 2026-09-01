import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import {
  EMAIL_OPERATION_AUDIT_ACTIONS,
  filterEmailOperationAuditByBrand,
  normalizeEmailOperationAuditRow,
} from "@/lib/email/operations-audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const brand = request.nextUrl.searchParams.get("brand");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("automation_logs")
    .select("id,action,agent_name,status,details,created_at")
    .in("action", [...EMAIL_OPERATION_AUDIT_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data || [])
    .map((row) => normalizeEmailOperationAuditRow(row))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const events = filterEmailOperationAuditByBrand(normalized, brand);

  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    brand: brand || null,
    readOnly: true,
    events,
    summary: {
      total: events.length,
      repair: events.filter((event) => event.action === "email_connection_health_repair").length,
      backfill: events.filter((event) => event.action === "email_history_backfill").length,
      failedOrBlocked: events.filter((event) => ["failed", "blocked"].includes(event.status)).length,
    },
  });
}
