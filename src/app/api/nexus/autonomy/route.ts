import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { data, error } = await supabase.from("nexus_autonomy_policies").select("*").order("action_class");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  const summary = rows.reduce((acc: Record<string, number>, row: any) => {
    acc[row.mode] = (acc[row.mode] ?? 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({ summary, policies: rows });
}
