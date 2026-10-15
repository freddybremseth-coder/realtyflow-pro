export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getVisibilityApproval, recordVisibilityApproval, visibilityApprovalScope } from "@/services/agents/visibility-owner-approval";

const privateHeaders = { "Cache-Control":"private, no-store" };
function database(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
async function owner(request:NextRequest){
  const ctx=await getRequestAccessContext(request);
  // Explicitly deny workspace preview, remaster proxy, and non-owner sessions.
  return ctx?.role==="OWNER" && ctx.source==="owner-session" ? ctx : null;
}
export async function GET(request:NextRequest){
  if(!await owner(request))return NextResponse.json({error:"Owner session required"},{status:403,headers:privateHeaders});
  const db=database();if(!db)return NextResponse.json({error:"Service unavailable"},{status:503,headers:privateHeaders});
  try{
    const approval=await getVisibilityApproval(db);
    return NextResponse.json({brandId:"donaanna",scope:visibilityApprovalScope(),...approval,
      execution:"Owner approval is a necessary but not sufficient gate; daily cron independently checks live/source agreement, GSC evidence, CI and deployment."},
      {headers:privateHeaders});
  }catch{return NextResponse.json({error:"Cannot read approval status"},{status:503,headers:privateHeaders});}
}
export async function POST(request:NextRequest){
  const ctx=await owner(request);
  if(!ctx)return NextResponse.json({error:"Owner session required"},{status:403,headers:privateHeaders});
  const origin=request.headers.get("origin");
  if((origin&&origin!==request.nextUrl.origin)||request.headers.get("sec-fetch-site")==="cross-site"||
     !request.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({error:"Invalid origin or content type"},{status:403,headers:privateHeaders});
  const input=await request.json().catch(()=>null);
  if(!input||input.brandId!=="donaanna"||input.version!=="v1"||
      !["approve","revoke"].includes(input.action)||typeof input.expectedFingerprint!=="string")
    return NextResponse.json({error:"Exact homepage metadata scope required"},{status:400,headers:privateHeaders});
  if(input.expectedFingerprint!==visibilityApprovalScope().fingerprint)
    return NextResponse.json({error:"Metadata variant changed. Reload before consenting."},{status:409,headers:privateHeaders});
  const db=database();if(!db)return NextResponse.json({error:"Service unavailable"},{status:503,headers:privateHeaders});
  try{
    const grant=await recordVisibilityApproval(db,{
      action:input.action,expectedFingerprint:input.expectedFingerprint,ownerEmail:ctx.email,
    });
    return NextResponse.json({...grant,brandId:"donaanna",version:"v1",persisted:true,
      publicationStarted:false,publicationCompleted:false,
      nextStep:input.action==="approve"
        ?"Sam vurderer saken i neste daglige SEO-syklus. Kildeavvik, kvalitet, Google-signaler og byggkontroller må fortsatt bestå."
        :"Tillatelsen er trukket tilbake. Nye cron-steg for denne metadata-varianten blir sperret."},
      {headers:privateHeaders});
  }catch{return NextResponse.json({error:"Consent could not be stored. No publication authorized."},
    {status:503,headers:privateHeaders});}
}
