// ─── POST /api/ad-campaigns/:id/retry-failed ───────────────────────────
// Resets all 'failed' creatives back to 'pending' and any stuck
// 'generating' rows older than 90s. The client's batch loop will then
// pick them up on the next /generate call.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();

  // Reset failed rows
  const { count: resetFailed } = await supabase
    .from("ad_creatives")
    .update({ status: "pending", error: null, replicate_prediction_id: null }, { count: "exact" })
    .eq("campaign_id", params.id)
    .eq("status", "failed");

  // Rescue stuck rows
  const stuckThreshold = new Date(Date.now() - 90_000).toISOString();
  const { count: rescued } = await supabase
    .from("ad_creatives")
    .update({ status: "pending", replicate_prediction_id: null }, { count: "exact" })
    .eq("campaign_id", params.id)
    .eq("status", "generating")
    .lt("updated_at", stuckThreshold);

  // Reset campaign status if currently 'failed'
  await supabase
    .from("ad_campaigns")
    .update({ status: "matrix_pending", error: null })
    .eq("id", params.id)
    .eq("status", "failed");

  return NextResponse.json({
    reset_failed: resetFailed ?? 0,
    rescued_stuck: rescued ?? 0,
  });
}
