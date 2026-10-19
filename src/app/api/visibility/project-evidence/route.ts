import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { PROJECT_EVIDENCE_ACTION } from "@/services/agents/visibility-project-evidence-log";

export const dynamic = "force-dynamic";

/**
 * Owner-only evidence ledger inspection. No client-supplied brand/URL filters,
 * service credentials or sensitive document contents leave this endpoint.
 * This is not approval and not verification of external sources.
 */
export async function GET(request: NextRequest) {
  const ctx = await getRequestAccessContext(request);
  if (ctx?.role !== "OWNER" || ctx.source !== "owner-session")
    return NextResponse.json({error:"Direct owner session required"}, {status:403});
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({error:"Database unavailable"}, {status:503});
  const db = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await db.from("automation_logs")
    .select("created_at,details").eq("action",PROJECT_EVIDENCE_ACTION)
    .order("created_at",{ascending:false}).limit(100);
  if(error) return NextResponse.json({error:"Evidence log unavailable"},{status:503});
  const events = (data ?? []).filter(item=>item.details?.brand_id==="zeneco").map(item=>({
    recordedAt:item.created_at,
    brandId:"zeneco",
    event:item.details?.event,
    projectUrl:item.details?.project_url,
    claimKey:item.details?.claim_key,
    eventId:item.details?.event_id,
    independentlyVerified:false,
    publicationAuthorized:false,
  }));
  return NextResponse.json({events,sampled:true,limit:100,verificationStatus:"NOT_INDEPENDENTLY_VERIFIED",
    publicationEligible:false},{headers:{"Cache-Control":"private, no-store"}});
}
