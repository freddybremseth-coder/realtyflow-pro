import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { visibilityWorkDisplayState } from "@/services/agents/visibility-work-queue";
import { createVisibilityDesignProposal, DESIGN_REQUEST_ACTION, type VisibilityInvestigationEvidence } from "@/services/agents/visibility-design-proposal";
import { VISIBILITY_RUN_ACTION, parseVisibilityRunStatus } from "@/services/agents/visibility-run-ledger";
import { VISIBILITY_CODE_CANDIDATE_ACTION, resolveVisibilityCodeCandidate } from "@/services/agents/visibility-code-candidate";
import { checkVisibilityPullStatus, MAX_GITHUB_PR_STATUS_CHECKS } from "@/services/agents/visibility-github-pr-status";
import { checkVisibilityPullCi } from "@/services/agents/visibility-github-ci";
import { VISIBILITY_VISUAL_REVIEW_ACTION,latestVisualReviewForCandidate } from "@/services/agents/visibility-visual-review";
import { summarizePrReviewReadiness } from "@/services/agents/visibility-pr-review-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function db() {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url && key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
}
export async function GET(request: NextRequest) {
 const ctx = await getRequestAccessContext(request);
 if(ctx?.role!=="OWNER" || ctx.source!=="owner-session") return NextResponse.json({error:"Owner session required"},{status:403});
 const client=db(); if(!client) return NextResponse.json({error:"Database unavailable"},{status:503});
 const {data,error}=await client.from("work_items")
  .select("id,title,brand_id,status,source_id,updated_at,assigned_agent,metadata,next_action")
  .eq("source_type","ai_agent").like("source_id","visibility:%")
  .order("updated_at",{ascending:false}).limit(150);
 if(error) return NextResponse.json({error:"Work queue unavailable"},{status:503});
 // Evidence is stored in separate service-only audit logs, not in editable
 // work-item metadata. A probe result is a fresh observation, NEVER proof of
 // a repaired website, an approval to publish, or a closed task.
 const {data:logs,error:logError}=await client.from("automation_logs")
  .select("created_at,details").eq("action","visibility_independent_investigation")
  .order("created_at",{ascending:false}).limit(200);
 if(logError) return NextResponse.json({error:"Investigation evidence unavailable"},{status:503});
 const latest=new Map<string, VisibilityInvestigationEvidence>();
 for(const log of logs||[]){
  const d=log.details;
  if(typeof d?.work_item_id!=="string" || latest.has(d.work_item_id) ||
    d.read_only!==true || d.publication_authorized!==false || d.resolution_verified!==false) continue;
  latest.set(d.work_item_id,d);
 }
 const {data:requests,error:requestError}=await client.from("automation_logs")
  .select("id,created_at,details").eq("action",DESIGN_REQUEST_ACTION)
  .order("created_at",{ascending:false}).limit(200);
 if(requestError) return NextResponse.json({error:"Design review history unavailable"},{status:503});
 // Review-only GitHub candidates have to be linked to a *real*, earlier
 // owner design request. None of these rows grants merge or publish access.
 const {data:codeLogs,error:codeError}=await client.from("automation_logs")
  .select("created_at,details").eq("action",VISIBILITY_CODE_CANDIDATE_ACTION)
  .order("created_at",{ascending:false}).limit(200);
 if(codeError)return NextResponse.json({error:"Code review provenance unavailable"},{status:503});
 const {data:visualLogs,error:visualError}=await client.from("automation_logs")
  .select("created_at,details").eq("action",VISIBILITY_VISUAL_REVIEW_ACTION)
  .order("created_at",{ascending:false}).limit(200);
 if(visualError)return NextResponse.json({error:"Visual review history unavailable"},{status:503});
 const {data:source,error:sourceError}=await client.from("automation_logs")
  .select("created_at").eq("action","seo_gsc_live_read")
  .in("status",["success","partial"]).order("created_at",{ascending:false})
  .limit(1).maybeSingle();
 if(sourceError)return NextResponse.json({error:"SEO source audit status unavailable"},{status:503});
 const latestIndependent=(logs||[]).find(x=>
  x.details?.read_only===true&&x.details?.publication_authorized===false&&
  x.details?.resolution_verified===false&&typeof x.details?.checked_at==="string");
 const {data:runLogs,error:runLogError}=await client.from("automation_logs")
  .select("created_at,details").eq("action",VISIBILITY_RUN_ACTION)
  .order("created_at",{ascending:false}).limit(40);
 if(runLogError)return NextResponse.json({error:"Visibility operation status unavailable"},{status:503});
 const acceptedRunLogs=(runLogs||[])
  .map(row=>parseVisibilityRunStatus(row)).filter((value)=>value!==null);
 const lastRun=acceptedRunLogs[0]??null;
 const lastCronRun=acceptedRunLogs.find(row=>row.source==="cron")??null;
 const requestedFingerprints=new Set((requests||[])
  .map(x=>x.details?.proposal_fingerprint).filter((x):x is string=>typeof x==="string"));
 // Only pre-existing and owner-requested, canonical review candidates
 // qualify for a live GitHub read. Strictly cap outbound requests.
 const reviewCandidates=(data||[])
  .filter(x=>x.metadata?.product==="altovena_visibility")
  .map(x=>({workId:x.id,candidate:resolveVisibilityCodeCandidate(x,requests||[],codeLogs||[])}))
  .filter((x):x is {workId:string;candidate:NonNullable<typeof x.candidate>}=>x.candidate!==null)
  .slice(0,MAX_GITHUB_PR_STATUS_CHECKS);
 const githubChecks=await Promise.all(reviewCandidates.map(async x=>{
  const status=await checkVisibilityPullStatus(x.candidate);
  const ci=await checkVisibilityPullCi(x.candidate,status);
  return {workId:x.workId,status,ci};
 }));
 const githubStatusByWork=new Map(githubChecks.map(x=>[x.workId,x.status]));
 const githubCiByWork=new Map(githubChecks.map(x=>[x.workId,x.ci]));
 return NextResponse.json({audit_status:{
  latestSourceAuditAt:source?.created_at??null,
  latestIndependentAt:latestIndependent?.details?.checked_at??null,
  independentEvidenceLogged:Boolean(latestIndependent),
  // A missing evidence record cannot distinguish a skipped cron from an
  // unexecuted route. Never show "completed" without durable evidence.
  cronOutcome:lastCronRun?.outcome??"NOT_PROVEN",
  lastRun,
  lastCronRun,
  dailyScheduleUtc:"08:15",
 },work_items:(data||[]).filter(x=>x.metadata?.product==="altovena_visibility").map(x=>{
   const plan=createVisibilityDesignProposal(x,latest.get(x.id)??null);
   const codeCandidate=resolveVisibilityCodeCandidate(x,requests||[],codeLogs||[]);
   const visualReview=codeCandidate
    ?latestVisualReviewForCandidate(x.id,codeCandidate.commitSha,visualLogs||[]):null;
   const reviewReadiness=summarizePrReviewReadiness(codeCandidate,
     githubStatusByWork.get(x.id)??null,githubCiByWork.get(x.id)??null,visualReview);
   return {
    ...x,visibility_state:visibilityWorkDisplayState(x.status,x.metadata),
    investigation:latest.get(x.id)??null,
    design_proposal:plan,
    design_requested:plan.fingerprint?requestedFingerprints.has(plan.fingerprint):false,
    code_candidate:codeCandidate,
    github_status:githubStatusByWork.get(x.id)??null,
    github_ci:githubCiByWork.get(x.id)??null,
    visual_review:visualReview,
    review_readiness:reviewReadiness,
   };
 })},{headers:{"Cache-Control":"private, no-store"}});
}
