/** Human visual attestation is not permission to merge, execute or publish. */
export const VISIBILITY_VISUAL_REVIEW_ACTION = "visibility_visual_review";
export const VISUAL_CHECKS = [
  "desktop", "mobile", "adminNoindex", "singleH1AfterHydration", "noVisualRegression",
] as const;
export type VisualCheck = (typeof VISUAL_CHECKS)[number];
export type VisualReviewInput = {
  workItemId:string; commitSha:string; outcome:"VISUALLY_PASSED"|"ISSUES_FOUND";
  checks:Record<VisualCheck,boolean>; notes:string;
};
export type VisualReviewRecord = {
  workItemId:string;commitSha:string;recordedAt:string;
  outcome:"VISUALLY_PASSED"|"ISSUES_FOUND";
  checks:Record<VisualCheck,boolean>;notes:string;
  publishingApproved:false;mergingApproved:false;
};
export function parseVisualReviewInput(value:unknown):VisualReviewInput|null{
  if(!value || typeof value!=="object" || Array.isArray(value))return null;
  const b=value as Record<string,unknown>;
  if(typeof b.workItemId!=="string" ||
     !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(b.workItemId) ||
     typeof b.commitSha!=="string" || !/^[0-9a-f]{40}$/.test(b.commitSha) ||
     !["VISUALLY_PASSED","ISSUES_FOUND"].includes(String(b.outcome)) ||
     typeof b.notes!=="string" || b.notes.trim().length<10 || b.notes.length>1000 ||
     !b.checks || typeof b.checks!=="object" || Array.isArray(b.checks))return null;
  const raw=b.checks as Record<string,unknown>;
  if(Object.keys(raw).length!==VISUAL_CHECKS.length ||
     VISUAL_CHECKS.some(name=>typeof raw[name]!=="boolean"))return null;
  const checks=Object.fromEntries(VISUAL_CHECKS.map(k=>[k,raw[k]])) as Record<VisualCheck,boolean>;
  if(b.outcome==="VISUALLY_PASSED" && VISUAL_CHECKS.some(k=>checks[k]!==true))return null;
  return {workItemId:b.workItemId,commitSha:b.commitSha,
   outcome:b.outcome as VisualReviewInput["outcome"],checks,notes:b.notes.trim()};
}
export function latestVisualReviewForCandidate(
  workItemId:string,sha:string,
  rows:Array<{created_at?:unknown;details?:unknown}>,
):VisualReviewRecord|null{
  for(const row of rows){
    const d=row.details;
    if(!d || typeof d!=="object" || Array.isArray(d) ||
       typeof row.created_at!=="string" || !Number.isFinite(Date.parse(row.created_at)))continue;
    const r=d as Record<string,unknown>;
    if(r.work_item_id!==workItemId || r.commit_sha!==sha ||
       r.review_kind!=="manual_visual_review_only" ||
       r.approval_granted!==false || r.merge_authorized!==false ||
       r.publication_authorized!==false || r.execution_started!==false)continue;
    const parsed=parseVisualReviewInput({
      workItemId:r.work_item_id,commitSha:r.commit_sha,
      outcome:r.outcome,checks:r.checks,notes:r.notes,
    });
    if(!parsed)return null; // Newest malformed record cannot be treated as approved.
    return {workItemId,commitSha:sha,recordedAt:row.created_at,
      outcome:parsed.outcome,checks:parsed.checks,notes:parsed.notes,
      publishingApproved:false,mergingApproved:false};
  }
  return null;
}
