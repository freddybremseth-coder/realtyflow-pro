import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdminApi(req, { errors: [] });
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("automation_logs")
    .select("id, action, agent_name, details, created_at")
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message, errors: [] }, { status: 500 });
  return NextResponse.json({ errors: data || [] });
}
