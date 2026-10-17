import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import type { SEOControlReport } from "@/services/agents/seo-control-report";
import { visibilityEvidenceAge } from "@/services/agents/visibility-evidence-age";
import { syncVisibilityReviewQueue } from "@/services/agents/visibility-queue-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Canonical, server-side ingestion. This only creates PROPOSED investigation
 * tasks in existing Nexus work_items. It NEVER performs repairs, grants
 * approval, starts GitHub/Vercel deployments, or trusts client findings.
 */
export async function POST(request: NextRequest) {
 const ctx=await getRequestAccessContext(request);
 if(ctx?.role!=="OWNER" || ctx.source!=="owner-session")return NextResponse.json({error:"Owner session required"},{status:403});
 const origin=request.headers.get("origin");
 if((origin && origin!==request.nextUrl.origin) || request.headers.get("sec-fetch-site")==="cross-site")return NextResponse.json({error:"Invalid request origin"},{status:403});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Database not configured"},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Fetch latest actually persisted control report, rather than a caller-provided one.
 const {data,error}=await db.from("automation_logs").select("created_at,details")
  .eq("action","seo_gsc_live_read").in("status",["success","partial"])
  .order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(error)return NextResponse.json({error:"SEO report unavailable"},{status:503});
 const raw=(data?.details as {controlReport?:SEOControlReport}|null)?.controlReport;
 if(!raw||!Array.isArray(raw.sites))return NextResponse.json({error:"No stored canonical SEO report"},{status:409});
 // Never create active remediation proposals from aged/unknown evidence.
 const checkedAt=visibilityEvidenceAge(raw.checkedAt);
 if(checkedAt!=="RECENT")return NextResponse.json({error:"Stored SEO report requires refresh",evidenceAge:checkedAt},{status:409});
 const synced=await syncVisibilityReviewQueue(db, raw);
 return NextResponse.json({
  accepted:synced.accepted, work_item_ids:synced.workItemIds,
  errors:synced.errors, rejected:synced.rejected,
  state:"PROPOSED",execution_started:false,publication_authorized:false,
  source:"stored_seo_gsc_live_read",incomplete:synced.truncated || synced.errors>0 || synced.rejected>0,
 }, {status:synced.errors?503:200,headers:{"Cache-Control":"no-store"}});
}
