/** Live, bounded, read-only GitHub CI evidence for the exact reviewed commit. */
import type { VisibilityCodeCandidate } from "./visibility-code-candidate";
import type { VisibilityPullStatus } from "./visibility-github-pr-status";

export type VisibilityCiState =
  | "PASSED" | "FAILED" | "PENDING" | "UNVERIFIED" | "COMMIT_CHANGED";
export type VisibilityCiEvidence = {
  state: VisibilityCiState;
  checkedAt: string;
  reviewedSha: string;
  requiredJob: string;
  observedJobs: number;
  publicationAuthorized: false;
  mergeAuthorized: false;
  visualReviewCompleted: false;
};
const REQUIRED_JOBS: Record<string,string> = {
  "freddybremseth-coder/remasterfreddy": "build-test",
};
const MAX_CHECK_RUNS = 30;
const MAX_GITHUB_RESPONSE_BYTES = 300_000;
type Run = {name?:unknown;head_sha?:unknown;status?:unknown;conclusion?:unknown};
type CheckRuns = {total_count?:unknown;check_runs?:unknown};

function outcome(state: VisibilityCiState, now: Date,
  sha: string, requiredJob: string, observedJobs = 0): VisibilityCiEvidence {
  return { state, checkedAt: now.toISOString(), reviewedSha: sha,
    requiredJob, observedJobs, publicationAuthorized:false,
    mergeAuthorized:false, visualReviewCompleted:false };
}
/**
 * Does not use user-supplied URLs or tokens. A green status proves only GitHub
 * check-run completion, not a tested browser UI, a merge grant or a deployment.
 */
export async function checkVisibilityPullCi(
  candidate:VisibilityCodeCandidate, status:VisibilityPullStatus,
  transport:typeof fetch=fetch, now=new Date(),
):Promise<VisibilityCiEvidence>{
  const job=REQUIRED_JOBS[candidate.repo]??"unknown";
  const fail=(state:VisibilityCiState, n=0)=>outcome(state,now,candidate.commitSha,job,n);
  if(!REQUIRED_JOBS[candidate.repo] || !/^[0-9a-f]{40}$/.test(candidate.commitSha) ||
    candidate.url!=="https://github.com/"+candidate.repo+"/pull/"+candidate.pullNumber ||
    !Number.isSafeInteger(candidate.pullNumber) ||
    candidate.reviewOnly!==true || candidate.executionStarted!==false ||
    candidate.publicationAuthorized!==false) return fail("UNVERIFIED");
  if(status.state==="COMMIT_CHANGED" || status.currentHeadSha && status.currentHeadSha!==candidate.commitSha)
    return fail("COMMIT_CHANGED");
  if(!["OPEN_SAME_COMMIT","DRAFT_SAME_COMMIT"].includes(status.state) ||
     status.codeUnchanged!==true)return fail("UNVERIFIED");

  const endpoint="https://api.github.com/repos/"+candidate.repo+
    "/commits/"+candidate.commitSha+"/check-runs?per_page="+MAX_CHECK_RUNS;
  try{
    const response=await transport(endpoint,{
      method:"GET",cache:"no-store",redirect:"error",
      signal:AbortSignal.timeout(5000),
      headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
    });
    if(!response.ok || Number(response.headers.get("content-length")||0)>MAX_GITHUB_RESPONSE_BYTES)
      return fail("UNVERIFIED");
    // JSON from a fixed public GitHub API endpoint is bounded as well.
    if(!response.body)return fail("UNVERIFIED");
    const reader=response.body.getReader();
    let size=0;
    const chunks:Uint8Array[]=[];
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>MAX_GITHUB_RESPONSE_BYTES){
          await reader.cancel().catch(()=>{});
          return fail("UNVERIFIED");
        }
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder().decode(bytes)) as CheckRuns;
    if(!data || !Array.isArray(data.check_runs) ||
      typeof data.total_count!=="number" || !Number.isSafeInteger(data.total_count) ||
      data.total_count<1 || data.total_count>MAX_CHECK_RUNS ||
      data.check_runs.length!==data.total_count)return fail("UNVERIFIED");
    const runs=data.check_runs as Run[];
    if(runs.some(x=>!x || typeof x.name!=="string" ||
      x.head_sha!==candidate.commitSha ||
      !["queued","in_progress","completed","waiting","pending","requested"].includes(String(x.status))))
      return fail("UNVERIFIED",runs.length);
    const required=runs.filter(x=>x.name===job);
    if(required.length!==1)return fail("UNVERIFIED",runs.length);
    if(runs.some(x=>x.status!=="completed"))return fail("PENDING",runs.length);
    const failures=new Set(["failure","cancelled","timed_out","action_required","startup_failure"]);
    if(runs.some(x=>failures.has(String(x.conclusion))))return fail("FAILED",runs.length);
    // Required build must have an unambiguous success. Other skipped/neutral
    // checks do not make missing required tests green.
    if(required[0].conclusion!=="success")return fail("UNVERIFIED",runs.length);
    if(runs.some(x=>!["success","neutral","skipped"].includes(String(x.conclusion))))
      return fail("UNVERIFIED",runs.length);
    return fail("PASSED",runs.length);
  }catch{return fail("UNVERIFIED");}
}
