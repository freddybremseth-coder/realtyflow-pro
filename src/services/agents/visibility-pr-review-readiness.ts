/** Read-only PR review readiness; distinct from the existing SEO quality gate. */
import type { VisibilityCodeCandidate } from "./visibility-code-candidate";
import type { VisibilityPullStatus } from "./visibility-github-pr-status";
import type { VisibilityCiEvidence } from "./visibility-github-ci";
import type { VisualReviewRecord } from "./visibility-visual-review";
import { VISUAL_CHECKS } from "./visibility-visual-review";

export type PrReviewStage =
  | "NO_PR" | "GITHUB_UNKNOWN" | "PR_CHANGED" | "PR_CLOSED"
  | "CI_FAILED" | "CI_PENDING" | "CI_UNKNOWN"
  | "NEEDS_VISUAL" | "VISUAL_ISSUES"
  | "REVIEW_EVIDENCE_COMPLETE";
export type PrReviewReadiness = {
  stage:PrReviewStage;
  nextStep:string;
  reviewedSha:string|null;
  technicalChecksPassed:boolean;
  humanVisualReviewPassed:boolean;
  // These gates are observations, never an authorization.
  requiresSeparateReleaseApproval:true;
  mergeAuthorized:false;
  publicationAuthorized:false;
  verifiedAsPublished:false;
};
const maxCheckAge=10*60*1000;
function fresh(t:string|undefined,now:Date){
 const n=t?Date.parse(t):NaN;
 return Number.isFinite(n) && n<=now.getTime()+15_000 &&
   now.getTime()-n<=maxCheckAge;
}
export function summarizePrReviewReadiness(
 candidate:VisibilityCodeCandidate|null,
 github:VisibilityPullStatus|null,
 ci:VisibilityCiEvidence|null,
 visual:VisualReviewRecord|null,
 now=new Date(),
):PrReviewReadiness{
 const make=(stage:PrReviewStage,nextStep:string):PrReviewReadiness=>({
  stage,nextStep,reviewedSha:candidate?.commitSha??null,
  technicalChecksPassed:["NEEDS_VISUAL","VISUAL_ISSUES","REVIEW_EVIDENCE_COMPLETE"].includes(stage),
  humanVisualReviewPassed:stage==="REVIEW_EVIDENCE_COMPLETE",
  requiresSeparateReleaseApproval:true,
  mergeAuthorized:false,publicationAuthorized:false,verifiedAsPublished:false,
 });
 if(!candidate||candidate.reviewOnly!==true||
    candidate.executionStarted!==false||candidate.publicationAuthorized!==false||
    !/^[0-9a-f]{40}$/.test(candidate.commitSha))
  return make("NO_PR","Et konkret, eierforespurt PR-utkast mangler.");
 if(!github||!fresh(github.checkedAt,now)||github.state==="UNAVAILABLE")
  return make("GITHUB_UNKNOWN","Oppdater GitHub-status før vurdering.");
 if(github.state==="COMMIT_CHANGED"||github.currentHeadSha!==candidate.commitSha||
    github.codeUnchanged!==true&&["OPEN_SAME_COMMIT","DRAFT_SAME_COMMIT"].includes(github.state))
  return make("PR_CHANGED","Ny commit krever nye tester og manuell gjennomgang.");
 if(github.state==="CLOSED"||github.state==="MERGED")
  return make("PR_CLOSED","Kontroller eventuell publisert versjon separat; PR-status er ikke SEO-bevis.");
 if(!["OPEN_SAME_COMMIT","DRAFT_SAME_COMMIT"].includes(github.state))
  return make("GITHUB_UNKNOWN","PR-status er ikke verifisert.");
 if(!ci||!fresh(ci.checkedAt,now)||ci.reviewedSha!==candidate.commitSha||
    ci.publicationAuthorized!==false||ci.mergeAuthorized!==false||
    ci.visualReviewCompleted!==false)
  return make("CI_UNKNOWN","Ferske GitHub-tester for eksakt commit mangler.");
 if(ci.state==="COMMIT_CHANGED")return make("PR_CHANGED","CI gjelder en annen commit.");
 if(ci.state==="FAILED")return make("CI_FAILED","Rett feilende tester.");
 if(ci.state==="PENDING")return make("CI_PENDING","Kontroller når GitHub-testene er ferdige.");
 if(ci.state!=="PASSED")return make("CI_UNKNOWN","Testresultatet er ikke verifisert.");
 if(!visual||visual.commitSha!==candidate.commitSha||
    !Number.isFinite(Date.parse(visual.recordedAt))||
    !Number.isFinite(Date.parse(candidate.recordedAt))||
    Date.parse(visual.recordedAt)<Date.parse(candidate.recordedAt)||
    visual.mergingApproved!==false||visual.publishingApproved!==false)
  return make("NEEDS_VISUAL","Gå gjennom desktop, mobil, H1 og admin manuelt.");
 if(visual.outcome==="ISSUES_FOUND")
  return make("VISUAL_ISSUES","Undersøk og dokumenter åpne visuelle feil.");
 if(visual.outcome!=="VISUALLY_PASSED"||
    VISUAL_CHECKS.some(k=>visual.checks[k]!==true))
  return make("NEEDS_VISUAL","Den visuelle kontrollen er ufullstendig.");
 return make("REVIEW_EVIDENCE_COMPLETE",
  "Kvalitetsbevis er samlet. Separat eksplisitt release-godkjenning mangler fortsatt.");
}
