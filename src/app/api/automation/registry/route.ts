import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildAutomationRegistry } from "@/lib/automation/registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, {
    ...buildAutomationRegistry(),
    synthetic: true,
  });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      ...buildAutomationRegistry(),
      synthetic: true,
      tableWarnings: {
        runs: "Supabase not configured",
        logs: "Supabase not configured",
      },
    });
  }

  const [runsRes, logsRes] = await Promise.all([
    supabase
      .from("automation_runs")
      .select("id,status,input,output,error,started_at,finished_at")
      .order("started_at", { ascending: false })
      .limit(100),
    supabase
      .from("automation_logs")
      .select("id,action,status,details,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const tableWarnings = {
    runs: runsRes.error?.message || null,
    logs: logsRes.error?.message || null,
  };

  return NextResponse.json({
    ...buildAutomationRegistry(
      (runsRes.data || []) as any[],
      (logsRes.data || []) as any[],
    ),
    synthetic: false,
    tableWarnings,
  });
}
