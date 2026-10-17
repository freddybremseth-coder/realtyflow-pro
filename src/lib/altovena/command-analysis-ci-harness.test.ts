import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { runCommandAnalysisTestHarness } from "./command-analysis-ci-harness";

const sha=(text:string)=>createHash("sha256").update(text,"utf8").digest("hex");
const goal="Inspect farm water flow records before recommending further checks.";
const scope=()=>({
  tenantId:"dcc65a7f-d4c4-490d-b4da-8ed6f1b2a0b9",
  missionId:"b8ce3e82-f928-4db1-b532-716980699805",
  verifiedActorId:"5db6a674-823a-4c48-9d39-e7bea29b967a",
  agentId:"ceo",goalDigest:sha(goal),routingDigest:"b".repeat(64),
});
const passage="Official inspection from 2026-10-16 confirms water flow 8.5 cubic meters and equipment status is operational.";
const sources=()=>[{
  id:"evidence-1",tenantId:scope().tenantId,
  sourceRef:"internal:inspection/2026-10-16",
  capturedAt:"2026-10-16T15:00:00Z",
  excerpt:passage,excerptDigest:sha(passage),
}];
const candidate=()=>({
  schemaVersion:1,mode:"ANALYSIS_DRAFT_ONLY",
  tenantId:scope().tenantId,missionId:scope().missionId,
  agentId:scope().agentId,goalDigest:scope().goalDigest,
  routingDigest:scope().routingDigest,
  findings:[{
    claim:"Inspection record lists a water flow reading.",
    evidence:[{sourceId:"evidence-1",quote:"water flow 8.5 cubic meters"}],
  }],
  limitations:["Independent assessment required."],
  controls:{approvedForExecution:false,permittedExternalActions:false,toolsUsed:[] as string[]},
});
const request=(model:(request:any)=>Promise<any>)=>({
  scope:scope(),sources:sources(),goal,now:"2026-10-17T01:00:00Z",
  preparedState:"prepared" as const,model,
});
const good=async()=>({candidate:candidate(),
  usage:{inputTokens:400,outputTokens:230,estimatedCostCents:2}});
test("CI-only mock analysis returns cited draft requiring human review, never an approval",async()=>{
  let calls=0;
  const result=await runCommandAnalysisTestHarness(request(async modelRequest=>{
    calls++;
    assert.equal(modelRequest.mode,"READ_ONLY_ANALYSIS_CI");
    assert.deepEqual(modelRequest.allowedTools,[]);
    assert.equal(Object.isFrozen(modelRequest.allowedTools),true);
    assert.equal(modelRequest.maxInputTokens,1200);
    assert.equal(modelRequest.maxOutputTokens,700);
    assert.equal(modelRequest.evidence[0].id,"evidence-1");
    return good();
  }));
  assert.equal(calls,1);
  assert.equal(result.modelCalls,1);
  assert.equal(result.reviewPacket.status,"awaiting_human_review");
  assert.equal(result.reviewPacket.approvedForExecution,false);
  assert.equal(result.externalActionsPerformed,0);
});
test("bad source bundle and modified goal are denied before the model callback",async()=>{
  let calls=0;
  const model=async()=>{calls++;return good()};
  await assert.rejects(
    runCommandAnalysisTestHarness({...request(model),sources:sources().map(x=>({...x,tenantId:"cf886ca2-245d-495b-95f1-7164c1d4b902"}))}),
    /unverified_or_foreign_evidence/);
  await assert.rejects(
    runCommandAnalysisTestHarness({...request(model),goal:"different goal"}),
    /mission_goal_digest_mismatch/);
  assert.equal(calls,0);
});
test("model cannot declare executed tools or invent citations",async()=>{
  const tampered=candidate();
  tampered.controls.toolsUsed.push("email.send");
  await assert.rejects(runCommandAnalysisTestHarness(request(async()=>({
    candidate:tampered,usage:{inputTokens:30,outputTokens:20,estimatedCostCents:1}
  }))),/candidate_action_permission_spoofing/);
  const unknown=candidate();
  unknown.findings[0].evidence[0].sourceId="source-not-read";
  await assert.rejects(runCommandAnalysisTestHarness(request(async()=>({
    candidate:unknown,usage:{inputTokens:30,outputTokens:20,estimatedCostCents:1}
  }))),/citation_not_in_trusted_source/);
});
test("reported usage above 20 cents or 1200/700 tokens is denied",async()=>{
  for(const usage of [
    {inputTokens:1201,outputTokens:5,estimatedCostCents:1},
    {inputTokens:10,outputTokens:701,estimatedCostCents:1},
    {inputTokens:10,outputTokens:20,estimatedCostCents:21},
    {inputTokens:-1,outputTokens:20,estimatedCostCents:0},
  ]){
    await assert.rejects(
      runCommandAnalysisTestHarness(request(async()=>({candidate:candidate(),usage}))),
      /reported_usage_exceeds_ci_ceiling/);
  }
});
test("disabled harness never calls the model",async()=>{
  const previous=process.env.ALTOVENA_ANALYSIS_TEST_HARNESS;
  process.env.ALTOVENA_ANALYSIS_TEST_HARNESS="false";
  let calls=0;
  try{
    await assert.rejects(runCommandAnalysisTestHarness(request(async()=>{
      calls++;return good();
    })),/ci_harness_disabled/);
    assert.equal(calls,0);
  }finally{
    if(previous===undefined) delete process.env.ALTOVENA_ANALYSIS_TEST_HARNESS;
    else process.env.ALTOVENA_ANALYSIS_TEST_HARNESS=previous;
  }
});
