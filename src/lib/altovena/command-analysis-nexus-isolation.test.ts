/**
 * Shared Command → analysis → Nexus boundary. This test deliberately imports
 * both codepaths from the stacked integration branch: a cited analysis draft
 * is NEVER an execution approval, task claim or tenant-to-brand grant.
 * No databases, agents, models, network or external actions are invoked.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyCommandAnalysisCandidate, AnalysisEvidenceDenied } from "./command-analysis-evidence";
import { inspectCommandNexusHandoff } from "./command-nexus-handoff";
import { claimApprovedNexusTask, NexusTaskClaimDenied } from "../nexus/task-execution-claim";

const tenantId="dcc65a7f-d4c4-490d-b4da-8ed6f1b2a0b9";
const missionId="b8ce3e82-f928-4db1-b532-716980699805";
const actorId="5db6a674-823a-4c48-9d39-e7bea29b967a";
const foreignBrandId="11111111-1111-4111-8111-111111111111";
const digest=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
const excerpt="Official inspection from 2026-10-16 confirms water flow 8.5 cubic meters and equipment status is operational.";
const scope={
  tenantId,missionId,agentId:"ceo",verifiedActorId:actorId,
  goalDigest:"a".repeat(64),routingDigest:"b".repeat(64),
};
const sources=[{
  id:"evidence-1",tenantId,sourceRef:"internal:inspection/2026-10-16",
  capturedAt:"2026-10-16T15:00:00Z",excerpt,excerptDigest:digest(excerpt),
}];
const candidate=()=>({
  schemaVersion:1,mode:"ANALYSIS_DRAFT_ONLY",tenantId,missionId,agentId:"ceo",
  goalDigest:scope.goalDigest,routingDigest:scope.routingDigest,
  findings:[{claim:"Inspection records a specific water-flow reading.",
    evidence:[{sourceId:"evidence-1",quote:"water flow 8.5 cubic meters"}]}],
  limitations:["A human must verify the meaning of this reading."],
  controls:{approvedForExecution:false,permittedExternalActions:false,toolsUsed:[] as string[]},
});
const routing=()=>({
  status:"proposed",
  plan:{
    schemaVersion:1,source:"realtyflow-nexus-agent-fleet",
    mode:"ROUTING_PROPOSAL_ONLY",missionId,goalDigest:scope.goalDigest,
    agents:[{agentId:"ceo",agentName:"Nexus advisor",
      stage:"analyse",executionStatus:"not_started"}],
    relatedAutomations:[],
    controls:{requiresHumanReview:true,approvedForExecution:false,
      permittedExternalActions:false,allowedTools:[] as string[]},
  },
});

test("valid evidence-backed Command output remains unapproved across both products",()=>{
 const analysis=verifyCommandAnalysisCandidate({
   scope,sources,candidate:candidate(),now:"2026-10-17T01:00:00Z",
 });
 const handoff=inspectCommandNexusHandoff(routing(),missionId);
 assert.equal(analysis.status,"awaiting_human_review");
 assert.equal(analysis.approvedForExecution,false);
 assert.equal(analysis.externalActionsPerformed,0);
 assert.ok(analysis.reviewReasons.includes("no_nexus_action_authorization"));
 assert.equal(handoff.kind,"routing_only");
 assert.equal(handoff.canCreateNexusTask,false);
 assert.equal(handoff.canExecute,false);
 assert.ok(handoff.blockers.includes("verified_tenant_to_brand_mapping_missing"));
});

test("model-invented permissions cannot cross from analysis into Nexus",()=>{
 const forged=candidate();
 forged.controls.approvedForExecution=true;
 assert.throws(
  ()=>verifyCommandAnalysisCandidate({scope,sources,candidate:forged,now:"2026-10-17T01:00:00Z"}),
  (e:unknown)=>e instanceof AnalysisEvidenceDenied &&
    e.reason==="candidate_action_permission_spoofing",
 );
 const tampered=routing();
 tampered.plan.controls.approvedForExecution=true;
 const handoff=inspectCommandNexusHandoff(tampered,missionId);
 assert.equal(handoff.kind,"invalid_proposal");
 assert.equal(handoff.canCreateNexusTask,false);
 assert.equal(handoff.canExecute,false);
});

test("no Nexus task lookup or claim occurs from an analysis-stage principal",async()=>{
 let reads=0,approvals=0,claims=0;
 const repository={
  async loadTask(_id:string){ reads++; return null; },
  async loadApproval(_id:string){ approvals++; return null; },
  async claimAtomically(){claims++; throw new Error("MUST_NOT_CLAIM");},
 };
 // Even if the caller mistakenly flips the application runtime flag, a
 // Command draft does not grant Nexus execute permission.
 await assert.rejects(claimApprovedNexusTask({
   repository,principal:{id:actorId,brandIds:[tenantId],canExecuteNexusTasks:false},
   taskId:missionId,now:"2026-10-17T01:00:00Z",
   executionRuntimeEnabled:true,auditTrailReady:true,
 }), (e:unknown)=>e instanceof NexusTaskClaimDenied &&
    e.reason==="execution_permission_missing");
 assert.deepEqual([reads,approvals,claims],[0,0,0]);
});

test("Command tenant ID never implicitly authorizes another Nexus brand",async()=>{
 let loaded=0,approved=0,claimed=0;
 const repository={
  async loadTask(id:string){
   loaded++;
   return {id,brandId:foreignBrandId,status:"approved" as const,
     version:1,actionType:"shortlist_draft_prepare",
     actionDigest:"sha256:"+"c".repeat(64),
     proposedBy:actorId,qualityReviewed:true,evidenceRefs:["ci:evidence"],
     preflightPassed:true,preflightCheckedAt:"2026-10-17T01:00:00Z"};
  },
  async loadApproval(){approved++; return null;},
  async claimAtomically(){claimed++;throw new Error("MUST_NOT_CLAIM");},
 };
 await assert.rejects(claimApprovedNexusTask({
   repository,principal:{id:actorId,brandIds:[tenantId],canExecuteNexusTasks:true},
   taskId:missionId,now:"2026-10-17T01:00:00Z",
   executionRuntimeEnabled:true,auditTrailReady:true,
 }), (e:unknown)=>e instanceof NexusTaskClaimDenied && e.reason==="brand_scope_denied");
 assert.deepEqual([loaded,approved,claimed],[1,0,0]);
});

test("Command API, analysis API and UI cannot directly invoke Nexus execution",()=>{
 for(const path of [
  "src/app/api/altovena/command/route.ts",
  "src/app/api/altovena/command/plan/route.ts",
  "src/app/api/altovena/command/analysis/route.ts",
  "src/app/(realty)/altovena/command/page.tsx",
 ]){
  const text=readFileSync(path,"utf8");
  assert.doesNotMatch(text,/claimApprovedNexusTask|claim_nexus_execution_task|revalidate_nexus_claim_before_dispatch|executeApproval|executeNexusTask/);
 }
});
