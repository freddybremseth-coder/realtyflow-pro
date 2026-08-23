import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { listApprovalQueue } from "@/lib/agentic/approval-gateway";
import { makeApprovalGatewayStore } from "@/services/agentic/adapters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ approvals: [], warning: "Supabase not configured" });

  try {
    const approvals = await listApprovalQueue({ store: makeApprovalGatewayStore(supabase) });
    return NextResponse.json({ approvals });
  } catch (err) {
    return NextResponse.json({ approvals: [], error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
