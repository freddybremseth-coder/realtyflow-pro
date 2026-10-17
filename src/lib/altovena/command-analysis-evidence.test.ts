import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { AnalysisEvidenceDenied, verifyCommandAnalysisCandidate } from "./command-analysis-evidence";

const missionId="b8ce3e82-f928-4db1-b532-716980699805";
const tenantId="dcc65a7f-d4c4-490d-b4da-8ed6f1b2a0b9";
const actorId="5db6a674-823a-4c48-9d39-e7bea29b967a";
const alternateTenant="cf886ca2-245d-495b-95f1-7164c1d4b902";
const sha=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
const excerpt="Official inspection from 2026-10-16 confirms water flow 8.5 cubic meters and equipment status is operational.";
const scope=()=>({
  tenantId,missionId,agentId:"ceo",goalDigest:"a".repeat(64),
  routingDigest:"b".repeat(64),verifiedActorId:actorId,
});
const evidence=()=>[{
  id:"evidence-1",tenantId,sourceRef:"internal:inspection/2026-10-16",
  capturedAt:"2026-10-16T15:00:00Z",excerpt,excerptDigest:sha(excerpt),
}];
const draft=()=>({
  schemaVersion:1,mode:"ANALYSIS_DRAFT_ONLY",tenantId,missionId,agentId:"ceo",
  goalDigest:"a".repeat(64),routingDigest:"b".repeat(64),
  findings:[{
    claim:"A recorded inspection states a specific water flow reading.",
    evidence:[{sourceId:"evidence-1",quote:"water flow 8.5 cubic meters"}],
  }],
  limitations:["Field observation should be independently verified."],
  controls:{approvedForExecution:false,permittedExternalActions:false,toolsUsed:[] as string[]},
});
const verify=(value:unknown, sources:unknown=evidence(), actualScope:unknown=scope())=>
  verifyCommandAnalysisCandidate({
    scope:actualScope as ReturnType<typeof scope>,
    sources:sources as ReturnType<typeof evidence>,
    candidate:value,now:"2026-10-17T01:00:00Z",
  });
const denial=(fn:()=>unknown)=>{
  assert.throws(fn,(err:unknown)=>err instanceof AnalysisEvidenceDenied);
};

test("accepted draft is review-only and citations point to server-fetched evidence",()=>{
  const packet=verify(draft());
  assert.equal(packet.status,"awaiting_human_review");
  assert.equal(packet.approvedForExecution,false);
  assert.equal(packet.externalActionsPerformed,0);
  assert.equal(packet.findings.length,1);
  assert.equal(packet.findings[0].evidence[0].sourceRef,evidence()[0].sourceRef);
  assert.ok(packet.reviewReasons.includes("independent_reviewer_required"));
});
test("model cannot grant approval, claim actions or declare tools used",()=>{
  const a=draft();a.controls.approvedForExecution=true;denial(()=>verify(a));
  const b=draft();b.controls.permittedExternalActions=true;denial(()=>verify(b));
  const c=draft();c.controls.toolsUsed.push("email.send");denial(()=>verify(c));
  denial(()=>verify({...draft(),approved:true}));
  denial(()=>verify({...draft(),status:"completed"}));
});
test("source hashes and tenant binding cannot be spoofed",()=>{
  const foreign=evidence().map(x=>({...x,tenantId:alternateTenant}));
  denial(()=>verify(draft(),foreign));
  denial(()=>verify(draft(),evidence().map(x=>({...x,excerptDigest:"f".repeat(64)}))));
  denial(()=>verify({...draft(),tenantId:alternateTenant}));
  denial(()=>verify({...draft(),routingDigest:"f".repeat(64)}));
  denial(()=>verify({...draft(),missionId:"31363464-787f-4ea4-8141-772a7db30d4b"}));
  denial(()=>verify({...draft(),goalDigest:"f".repeat(64)}));
});
test("invented citations, missing quotations and duplicate evidence are denied",()=>{
  const fabricated=draft();
  fabricated.findings[0].evidence[0].sourceId="invented-document";
  denial(()=>verify(fabricated));
  const quote=draft();quote.findings[0].evidence[0].quote="source never said this";
  denial(()=>verify(quote));
  const dupe=draft();
  dupe.findings[0].evidence.push({...dupe.findings[0].evidence[0]});
  denial(()=>verify(dupe));
});
test("reject fabricated source counts and invalid source snapshots",()=>{
  denial(()=>verify(draft(),[]));
  denial(()=>verify(draft(),Array.from({length:13},(_,i)=>({...evidence()[0],id:"s"+i}))));
  denial(()=>verify(draft(),[evidence()[0],evidence()[0]]));
  denial(()=>verify(draft(),evidence().map(x=>({...x,capturedAt:"2099-01-01T00:00:00Z"}))));
  denial(()=>verify(draft(),evidence(),"invalid"));
});
test("finding and limitation budgets reject abusive or empty model responses",()=>{
  const noFinding=draft();noFinding.findings=[];denial(()=>verify(noFinding));
  const emptyClaim=draft();emptyClaim.findings[0].claim="Hi";denial(()=>verify(emptyClaim));
  const many=draft();many.findings=Array.from({length:9},()=>draft().findings[0]);
  denial(()=>verify(many));
  const tooManyLimits=draft();tooManyLimits.limitations=Array(6).fill("Need review");
  denial(()=>verify(tooManyLimits));
});
test("unknown keys and unsupported evidence structures fail closed",()=>{
  denial(()=>verify({ ...draft(),rawToolRequest:{action:"publish"} }));
  denial(()=>verify({...draft(),controls:{...draft().controls,allowedTools:[]}}));
  const emptyEvidence=draft();emptyEvidence.findings[0].evidence=[];
  denial(()=>verify(emptyEvidence));
});
