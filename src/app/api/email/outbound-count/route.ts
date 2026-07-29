import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since") || new Date().toISOString().slice(0, 10);
  const supabase = createServerClient();

  const { count, error } = await supabase
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound")
    .gte("created_at", since);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
