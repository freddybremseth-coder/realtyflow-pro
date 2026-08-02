// ─── POST /api/ad-campaigns/:id/retry-failed ───────────────────────────
// Resets failed creatives and rescues stale generating rows. Provider job
// identifiers are cleared so an explicit retry starts a fresh paid job only
// after the user requests it.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient();

  const reset = {
    status: "pending",
    error: null,
    provider_job_id: null,
    replicate_prediction_id: null,
    source_url: null,
  };

  const { count: resetFailed, error: failedError } = await supabase
    .from("ad_creatives")
    .update(reset, { count: "exact" })
    .eq("campaign_id", params.id)
    .eq("status", "failed");
  if (failedError) return NextResponse.json({ error: failedError.message }, { status: 500 });

  const stuckThreshold = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: rescued, error: rescueError } = await supabase
    .from("ad_creatives")
    .update(reset, { count: "exact" })
    .eq("campaign_id", params.id)
    .eq("status", "generating")
    .lt("updated_at", stuckThreshold);
  if (rescueError) return NextResponse.json({ error: rescueError.message }, { status: 500 });

  await supabase
    .from("ad_campaigns")
    .update({ status: "matrix_pending", error: null })
    .eq("id", params.id)
    .in("status", ["failed", "generating", "completed"]);

  return NextResponse.json({
    reset_failed: resetFailed ?? 0,
    rescued_stuck: rescued ?? 0,
  });
}
