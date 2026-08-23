import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase, runApprovedPublicationProd } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 7.1B — "Run approved publication". Kjører en GODKJENT publisering gjennom
 * Agentic Executor (separat audit-hendelse). Dry-run som default uten Meta-
 * credentials; ekstern-idempotent (ingen dobbel-post ved retry).
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const ctx = await getRequestAccessContext(request);

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { approvalId?: string };
  if (!body.approvalId) return NextResponse.json({ error: "approvalId er påkrevd" }, { status: 400 });

  try {
    const execution = await runApprovedPublicationProd(supabase, { approvalId: body.approvalId, executedBy: ctx?.email ?? "system" });
    return NextResponse.json({ execution }, { status: execution.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "run-publication feilet" }, { status: 500 });
  }
}
