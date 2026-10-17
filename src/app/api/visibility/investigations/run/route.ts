export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { investigateVisibilityTasks } from "@/services/agents/visibility-investigation";
import type { SEOControlReport } from "@/services/agents/seo-control-report";

export async function POST(request: NextRequest) {
 const ctx = await getRequestAccessContext(request);
 if(ctx?.role!=="OWNER" || ctx.source!=="owner-session")
   return NextResponse.json({error:"Owner session required"},{status:403});
 const origin=request.headers.get("origin");
 if((origin && origin!==request.nextUrl.origin) ||
    request.headers.get("sec-fetch-site")==="cross-site")
   return NextResponse.json({error:"Invalid origin"},{status:403});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Service unavailable"},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from("automation_logs").select("details")
   .eq("action","seo_gsc_live_read").in("status",["success","partial"])
   .order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(error)return NextResponse.json({error:"Could not read source controls"},{status:503});
 const report=(data?.details as {controlReport?:SEOControlReport}|null)?.controlReport??null;
 try {
  const result=await investigateVisibilityTasks(db,report);
  return NextResponse.json({
    ...result,readOnly:true,publicationAuthorized:false,resolutionVerified:false,
   },{status:result.failed?503:200,headers:{"Cache-Control":"private, no-store"}});
 }catch{
   return NextResponse.json({error:"Investigation unavailable"},{status:503});
 }
}
