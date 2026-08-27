import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { resolveApproval } from "@/lib/agentic/approval-gateway";
import { executeApproval } from "@/lib/agentic/executor";
import { reconcileNexusMissionRunFromApproval } from "@/lib/nexus-mission-outcome-reconcile";
import { makeApprovalGatewayStore, makeGatewayPublishEvent } from "@/services/agentic/adapters";
import { buildExecutorDeps } from "@/services/agentic/executor-runtime";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const ctx = await getRequestAccessContext(request);
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { decision?: string };
  if (body.decision !== "approve" && body.decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const res = await resolveApproval(
    { store: makeApprovalGatewayStore(supabase), publishEvent: makeGatewayPublishEvent(supabase) },
    { id: params.id, decision: body.decision, resolvedBy: ctx?.email ?? "unknown" },
  );
  if (!res.ok) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : 400 });

  // Godkjent → utfør handlingen (executor, dry-run som default). Feilet
  // utførelse lar elementet stå approved for retry — approval reverseres ikke.
  let execution: Awaited<ReturnType<typeof executeApproval>> | null = null;
  if (res.status === "approved" && !res.alreadyResolved) {
    execution = await executeApproval(buildExecutorDeps(supabase), { id: params.id, executedBy: ctx?.email ?? "system" });
  }

  // Nexus-run-state harmoniseres ETTER eksisterende gateway/executor. Denne
  // funksjonen publiserer ingen nye revenue events og ignorerer non-Nexus runs.
  const nexusRun = await reconcileNexusMissionRunFromApproval(supabase, params.id);
  return NextResponse.json({ ...res, ...(execution ? { execution } : {}), nexusRun });
}
