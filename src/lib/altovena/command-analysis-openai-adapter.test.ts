import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { requestReadOnlyAnalysisCandidate, type AnalysisAdmissionRepository } from "./command-analysis-openai-adapter";
const sha=(text:string)=>createHash("sha256").update(text,"utf8").digest("hex");
const goal="Review the verified farm irrigation record without performing any actions.";
const passage="A verified inspection dated 2026-10-16 reported water flow 8.5 cubic meters and operational irrigation equipment.";
const scope=()=>({
  tenantId:"c69ae56e-3b7e-4cdd-af7e-fc9ebcf95eb2",
  missionId:"118b6bc7-39f0-4056-867b-dab0ed3dcc93",
  verifiedActorId:"40b13ad7-702e-4380-9020-5bea2c82f4c5",
  agentId:"ceo",goalDigest:sha(goal),routingDigest:"b".repeat(64),
});
const sources=()=>[{
  id:"inspection-1",tenantId:scope().tenantId,
  sourceRef:"private:inspection/2026-10-16",capturedAt:"2026-10-16T12:00:00Z",
  excerpt:passage,excerptDigest:sha(passage),
}];
const permit=()=>({
  permitId:"6f5b3c18-762d-4a8b-b6bb-d8bce987ed53",
  ...scope(),model:"gpt-5.6",expiresAt:"2026-10-17T09:05:00Z",
  maxOutputTokens:650,maxInputTokens:1200,reservedCostCents:10,
  status:"approved_for_read_only_analysis" as const,
});
const candidate=()=>({
  schemaVersion:1,mode:"ANALYSIS_DRAFT_ONLY",
  tenantId:scope().tenantId,missionId:scope().missionId,
  agentId:scope().agentId,goalDigest:scope().goalDigest,routingDigest:scope().routingDigest,
  findings:[{claim:"The inspection records an irrigation water flow measurement.",
    evidence:[{sourceId:"inspection-1",quote:"water flow 8.5 cubic meters"}]}],
  limitations:["Inspection requires independent human source review."],
  controls:{approvedForExecution:false,permittedExternalActions:false,toolsUsed:[]},
});
const providerOutput=(value:unknown=candidate())=>({
  status:"completed",output:[{type:"message",role:"assistant",
    content:[{type:"output_text",text:JSON.stringify(value)}]}],
  usage:{input_tokens:320,output_tokens:250,total_tokens:570},
});
const env=()=>{
  process.env.ALTOVENA_ANALYSIS_PROVIDER_ENABLED="true";
  process.env.ALTOVENA_ANALYSIS_MODEL="gpt-5.6";
  process.env.ALTOVENA_ANALYSIS_API_KEY="test-only-provider-key";
};
const makeStore=()=>{
  const calls:{reserve:number;settle:unknown[]}={reserve:0,settle:[]};
  const repository:AnalysisAdmissionRepository={
    async reserve(){calls.reserve++;return {kind:"reserved",
      reservationId:"9f27560b-435d-4698-a6f8-64b6ea4e2b45"};},
    async settle(value){calls.settle.push(value);},
  };
  return {calls,repository};
};
const run=(args:Partial<Parameters<typeof requestReadOnlyAnalysisCandidate>[0]> = {})=>{
  const st=makeStore();
  const input={
    scope:scope(),permit:permit(),sources:sources(),goal,
    now:"2026-10-17T09:00:00Z",repository:st.repository,
    fetcher:async (_url:RequestInfo|URL,_init?:RequestInit)=>
      new Response(JSON.stringify(providerOutput()),{status:200}),
    ...args,
  };
  return {st,run:()=>requestReadOnlyAnalysisCandidate(input)};
};
const saved={...process.env};
test.beforeEach(()=>env());
test.afterEach(()=>{process.env={...saved};});

test("real-provider request shape has no tools, no storage and fixed output ceiling",async()=>{
  let request:Record<string,unknown>={};
  const {st,run:go}=run({
    fetcher:async (url,init)=>{
      assert.equal(url,"https://api.openai.com/v1/responses");
      assert.equal(init?.method,"POST");
      assert.equal((init?.headers as Record<string,string>).Authorization,
        "Bearer test-only-provider-key");
      request=JSON.parse(String(init?.body));
      return new Response(JSON.stringify(providerOutput()),{status:200});
    },
  });
  const packet=await go();
  assert.equal(packet.reviewPacket.status,"awaiting_human_review");
  assert.equal(packet.reviewPacket.approvedForExecution,false);
  assert.equal(packet.externalActionsPerformed,0);
  assert.equal(packet.modelCallCount,1);
  assert.equal(request.model,"gpt-5.6");
  assert.deepEqual(request.tools,[]);
  assert.equal(request.tool_choice,"none");
  assert.equal(request.store,false);
  assert.equal(request.truncation,"disabled");
  assert.equal(request.max_output_tokens,650);
  assert.deepEqual((request.text as Record<string,unknown>).format &&
    ((request.text as Record<string,unknown>).format as Record<string,unknown>).name,
    "altovena_analysis_draft_v1");
  assert.equal(st.calls.reserve,1);
  assert.equal(st.calls.settle.length,1);
  assert.equal((st.calls.settle[0] as Record<string,unknown>).state,"completed");
});
test("disabled provider cannot reserve, spend or call network",async()=>{
  process.env.ALTOVENA_ANALYSIS_PROVIDER_ENABLED="false";
  let fetches=0;
  const {st,run:go}=run({fetcher:async()=>{fetches++;throw Error("must never fetch");}});
  await assert.rejects(go(),/provider_disabled/);
  assert.equal(fetches,0);
  assert.equal(st.calls.reserve,0);
});
test("scope, expired permit, token budget and configured model are checked before reservation",async()=>{
  for(const p of [
    {...permit(),tenantId:"a9c9928c-4c4e-4921-a9bc-7fe0d973cd50"},
    {...permit(),expiresAt:"2026-10-17T08:59:59Z"},
    {...permit(),maxInputTokens:1201},
    {...permit(),maxOutputTokens:701},
    {...permit(),reservedCostCents:21},
    {...permit(),model:"gpt-4o-mini"},
  ]){
    const {st,run:go}=run({permit:p});
    await assert.rejects(go());
    assert.equal(st.calls.reserve,0);
  }
  const invalidGoal=run({goal:"Modified goal"});
  await assert.rejects(invalidGoal.run(),/permit_scope_or_budget_invalid/);
  assert.equal(invalidGoal.st.calls.reserve,0);
});
test("denied or duplicate transaction cannot trigger model",async()=>{
  for(const k of ["denied","duplicate"] as const){
    let fetches=0;
    const repository:AnalysisAdmissionRepository={
      async reserve(){return {kind:k};},
      async settle(){throw Error("settle cannot run");},
    };
    const {run:go}=run({repository,fetcher:async()=>{fetches++;throw Error("no fetch");}});
    await assert.rejects(go(),/analysis_reservation_denied/);
    assert.equal(fetches,0);
  }
});
test("unsupported quote or tool use is not returned as reviewed fact and settles uncertain",async()=>{
  for(const bad of [
    {...candidate(),controls:{...candidate().controls,toolsUsed:["email"]}},
    {...candidate(),findings:[{claim:"Unsupported claim.",evidence:[{
      sourceId:"inspection-1",quote:"a made-up source quote",
    }]}]},
  ]){
    const {st,run:go}=run({fetcher:async()=>new Response(
      JSON.stringify(providerOutput(bad)),{status:200})});
    await assert.rejects(go());
    assert.equal(st.calls.reserve,1);
    assert.equal((st.calls.settle[0] as Record<string,unknown>).state,"uncertain");
  }
});
test("provider outage, incomplete output and usage overrun settle uncertain without retries",async()=>{
  for(const fetcher of [
    async()=>new Response("not available",{status:429}),
    async()=>new Response(JSON.stringify({...providerOutput(),status:"incomplete"}),{status:200}),
    async()=>new Response(JSON.stringify({...providerOutput(),
      usage:{input_tokens:1201,output_tokens:250,total_tokens:1451}}),{status:200}),
  ]){
    let calls=0;
    const {st,run:go}=run({fetcher:async()=>{calls++;return fetcher();}});
    await assert.rejects(go());
    assert.equal(calls,1);
    assert.equal((st.calls.settle[0] as Record<string,unknown>).state,"uncertain");
  }
});
test("cross-tenant sources fail before spending",async()=>{
  const {st,run:go}=run({sources:sources().map(s=>({...s,tenantId:
    "a9c9928c-4c4e-4921-a9bc-7fe0d973cd50"}))});
  await assert.rejects(go());
  assert.equal(st.calls.reserve,0);
});
