export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/nurture/overview
 * Admin-only (middleware setter x-admin-authenticated etter verifisert cookie).
 * Returnerer aggregater + siste hendelser for nurture-oversiktssiden.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get("x-admin-authenticated") !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const countBy = async (status: string) => {
    const { count } = await supabase
      .from("lead_nurture_events")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count || 0;
  };

  const [sent, dryRun, failed, enrolled, paused] = await Promise.all([
    countBy("sent"),
    countBy("dry_run"),
    countBy("failed"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).not("nurture_enrolled_at", "is", null),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("nurture_status", "paused"),
  ]);

  const { data: events, error } = await supabase
    .from("lead_nurture_events")
    .select(
      "id, brand_id, sequence_id, step_id, status, subject, dry_run, error, created_at, sent_at, contacts(name, email)"
    )
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    counts: {
      sent,
      dryRun,
      failed,
      enrolled: enrolled.count || 0,
      pausedSpam: paused.count || 0,
    },
    events: events || [],
  });
}
