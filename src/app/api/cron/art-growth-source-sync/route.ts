import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Read the published ART gallery only. New/unpublished originals never
 * enter the marketing source queue or a creative agent's prompt context.
 */
export async function GET(request: NextRequest) {
  const denied = await requireNexusSchedulerApi(request);
  if (denied) return denied;
  const safe = await evaluateCronSafeMode("/api/cron/art-growth-source-sync");
  if (safe.skip) return NextResponse.json({skipped:true,reason:safe.reason});
  const db = getServiceSupabase();
  if (!db) return NextResponse.json({error:"SUPABASE_UNAVAILABLE"},{status:503});
  const {data,error} = await db.rpc("sync_freddy_art_growth_sources");
  if (error) return NextResponse.json({error:"ART_GROWTH_SOURCE_SYNC_FAILED",details:error.message},{status:503});
  return NextResponse.json({success:true,eligibleUpserts:data,brandId:"freddyart",published:false});
}
