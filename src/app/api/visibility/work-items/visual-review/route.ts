import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { DESIGN_REQUEST_ACTION } from "@/services/agents/visibility-design-proposal";
import { VISIBILITY_CODE_CANDIDATE_ACTION,resolveVisibilityCodeCandidate } from "@/services/agents/visibility-code-candidate";
import { checkVisibilityPullStatus } from "@/services/agents/visibility-github-pr-status";
import { parseVisualReviewInput,VISIBILITY_VISUAL_REVIEW_ACTION } from "@/services/agents/visibility-visual-review";

export const dynamic="force-dynamic";
export const maxDuration=30;

/** Direct owner session may journal observations for one exact PR commit.
 * No GitHub writer or website publishing capability is imported.
 */
export async function POST(request:NextRequest){
 const ctx=await getRequestAccessContext(request);
 if(ctx?.role!=="OWNER" || ctx.source!=="owner-session")
  return NextResponse.json({error:"Direct owner session required"},{status:403});
 const origin=request.headers.get("origin");
 if((origin&&origin!==request.nextUrl.origin)||
  request.headers.get("sec-fetch-site")==="cross-site")
  return NextResponse.json({error:"Invalid origin"},{status:403});
 let body:unknown;
 try{body=await request.json()}catch{return NextResponse.json({error:"Invalid request"},{status:400})}
 const input=parseVisualReviewInput(body);
 if(!input)return NextResponse.json({error:"Incomplete or invalid visual review. Include observations for this exact commit."},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Database unavailable"},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:work,error:workError}=await db.from("work_items")
  .select("id,brand_id,source_id,status,metadata")
  .eq("id",input.workItemId).eq("source_type","ai_agent").maybeSingle();
 if(workError||!work||work.metadata?.product!=="altovena_visibility"||
    work.status==="DONE"||work.status==="CANCELLED")
   return NextResponse.json({error:"Active Visibility work item not found"},{status:404});
 const [requests,codeLogs]=await Promise.all([
  db.from("automation_logs").select("id,created_at,details")
   .eq("action",DESIGN_REQUEST_ACTION).order("created_at",{ascending:false}).limit(200),
  db.from("automation_logs").select("created_at,details")
   .eq("action",VISIBILITY_CODE_CANDIDATE_ACTION).order("created_at",{ascending:false}).limit(200),
 ]);
 if(requests.error||codeLogs.error)return NextResponse.json({error:"Review provenance unavailable"},{status:503});
 const candidate=resolveVisibilityCodeCandidate(work,requests.data||[],codeLogs.data||[]);
 if(!candidate||candidate.commitSha!==input.commitSha)
  return NextResponse.json({error:"Review commit has changed or is not linked to the owner request"},{status:409});
 const live=await checkVisibilityPullStatus(candidate);
 if(live.state!=="OPEN_SAME_COMMIT" || live.currentHeadSha!==input.commitSha)
  return NextResponse.json({error:"GitHub PR is unavailable or no longer at the reviewed commit"},{status:409});

 // Owner input is human attestation, never a screenshot or independently
 // validated browser result. No visual checks are inferred from GitHub CI.
 const {error:insertError}=await db.from("automation_logs").insert({
  action:VISIBILITY_VISUAL_REVIEW_ACTION,
  agent_name:"Altovena Visibility",
  status:input.outcome==="VISUALLY_PASSED"?"success":"partial",
  details:{
   work_item_id:work.id,brand_id:work.brand_id,source_id:work.source_id,
   commit_sha:candidate.commitSha,repo:candidate.repo,pull_number:candidate.pullNumber,
   candidate_url:candidate.url,
   review_kind:"manual_visual_review_only",
   recorded_by:ctx.email,outcome:input.outcome,
   checks:input.checks,notes:input.notes,
   approval_granted:false,merge_authorized:false,
   publication_authorized:false,execution_started:false,
  },
 });
 if(insertError)return NextResponse.json({error:"Could not journal visual review"},{status:503});
 return NextResponse.json({recorded:true,reviewOnly:true,commitSha:candidate.commitSha,
  mergingApproved:false,publishingApproved:false},
  {headers:{"Cache-Control":"private, no-store"}});
}
