import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { createVisibilityDesignProposal, DESIGN_REQUEST_ACTION, type VisibilityInvestigationEvidence } from "@/services/agents/visibility-design-proposal";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Owner may request a scoped DESIGN only. This route cannot approve, execute or publish. */
export async function POST(request: NextRequest){
 const ctx=await getRequestAccessContext(request);
 if(ctx?.role!=="OWNER" || ctx.source!=="owner-session")
  return NextResponse.json({error:"Direct owner session required"},{status:403});
 const origin=request.headers.get("origin");
 if((origin&&origin!==request.nextUrl.origin)||
    request.headers.get("sec-fetch-site")==="cross-site")
  return NextResponse.json({error:"Invalid request origin"},{status:403});
 let body:unknown;
 try{body=await request.json();}catch{return NextResponse.json({error:"Invalid request"},{status:400});}
 const b=body as {workItemId?:unknown;fingerprint?:unknown}|null;
 const workItemId=typeof b?.workItemId==="string"?b.workItemId:"";
 const fingerprint=typeof b?.fingerprint==="string"?b.fingerprint:"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workItemId)||
    !/^[0-9a-f]{64}$/.test(fingerprint))
  return NextResponse.json({error:"Invalid task/proposal reference"},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Database unavailable"},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:task,error:taskError}=await db.from("work_items")
  .select("id,brand_id,source_id,status,metadata")
  .eq("id",workItemId).eq("source_type","ai_agent").maybeSingle();
 if(taskError||!task)return NextResponse.json({error:"Visibility task not found"},{status:404});
 const {data:logs,error:logError}=await db.from("automation_logs")
  .select("created_at,details").eq("action","visibility_independent_investigation")
  .order("created_at",{ascending:false}).limit(200);
 if(logError)return NextResponse.json({error:"Evidence log unavailable"},{status:503});
 const evidence=(logs||[]).map(x=>x.details as VisibilityInvestigationEvidence)
  .find(x=>x?.work_item_id===workItemId&&x.read_only===true&&
    x.publication_authorized===false&&x.resolution_verified===false)??null;
 const proposal=createVisibilityDesignProposal(task,evidence);
 if(!proposal.canRequestDraft||proposal.fingerprint!==fingerprint)
  return NextResponse.json({error:"Proposal is unavailable, stale, or changed. Rerun independent investigation."},{status:409});
 const {data:existing,error:existingError}=await db.from("automation_logs")
  .select("id,details").eq("action",DESIGN_REQUEST_ACTION)
  .order("created_at",{ascending:false}).limit(200);
 if(existingError)return NextResponse.json({error:"Request history unavailable"},{status:503});
 if((existing||[]).some(x=>x.details?.proposal_fingerprint===proposal.fingerprint))
  return NextResponse.json({requested:true,alreadyRequested:true,executionStarted:false,publicationAuthorized:false},
    {headers:{"Cache-Control":"private, no-store"}});
 const {error:insertError}=await db.from("automation_logs").insert({
  action:DESIGN_REQUEST_ACTION,agent_name:"Altovena Visibility",
  status:"success",
  details:{
   work_item_id:workItemId,source_id:task.source_id,brand_id:task.brand_id,
   requested_by:ctx.email,proposal_fingerprint:proposal.fingerprint,
   target:proposal.target,issue_code:proposal.issueCode,
   proposed_change:proposal.change,verification:proposal.verification,
   rollback:proposal.rollback,source_evidence_checked_at:proposal.evidenceAt,
   intent:"design_review_only",approval_granted:false,publication_authorized:false,
   execution_started:false,read_only:true,
  },
 });
 if(insertError)return NextResponse.json({error:"Could not record design request"},{status:503});
 return NextResponse.json({requested:true,alreadyRequested:false,executionStarted:false,publicationAuthorized:false},
  {headers:{"Cache-Control":"private, no-store"}});
}
