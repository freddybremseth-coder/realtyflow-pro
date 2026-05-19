import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ runs: [], error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("automation_logs")
    .select("id,action,status,details,created_at")
    .eq("action", "publishing_autopilot_v1")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) {
    if (/automation_logs|schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({ runs: [], tableNotReady: true, error: error.message });
    }
    return NextResponse.json({ runs: [], error: error.message }, { status: 500 });
  }

  const runs = (data || []).map((row) => {
    const details = (row.details || {}) as Record<string, any>;
    return {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      processed: Number(details.processed || 0),
      moved_to_review: Number(details.moved_to_review || 0),
      suggestions_created: Number(details.suggestions_created || 0),
      created_draft_ids: Array.isArray(details.created_draft_ids) ? details.created_draft_ids : [],
      items: Array.isArray(details.items) ? details.items : [],
      error: details.error || null,
    };
  });

  return NextResponse.json({ runs });
}

