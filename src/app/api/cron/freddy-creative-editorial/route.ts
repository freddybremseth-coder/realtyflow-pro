import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Two PERSONAL umbrella story candidates per week from verified Art and
 * alternating Music/Books. Never publishes externally or bypasses approval.
 */
export async function GET(request:NextRequest) {
  const denied=await requireNexusSchedulerApi(request);
  if (denied) return denied;
  const safe=await evaluateCronSafeMode("/api/cron/freddy-creative-editorial");
  if (safe.skip) return NextResponse.json({skipped:true,reason:safe.reason});
  const db=getServiceSupabase();
  if (!db) return NextResponse.json({error:"SUPABASE_UNAVAILABLE"},{status:503});
  const {data:plan,error:planError}=await db.from("marketing_brand_growth_plans")
    .select("status,autonomy_mode").eq("brand_id","freddyb").maybeSingle();
  if (planError || plan?.status!=="active" || plan?.autonomy_mode!=="approval_required")
    return NextResponse.json({skipped:true,reason:"UMBRELLA_REQUIRES_APPROVAL_MODE"});
  const {data,error}=await db.rpc("curate_freddy_creative_editorial_sources");
  if (error) return NextResponse.json({error:"EDITORIAL_CURATION_FAILED",details:error.message},{status:503});
  return NextResponse.json({success:true,brandId:"freddyb",newCandidates:data,externalPosts:0,approvalRequired:true});
}
