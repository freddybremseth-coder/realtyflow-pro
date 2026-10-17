import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  captureCommandAnalysisSources, SourceCaptureDenied,
  type AnalysisSourceConnector, type SourceReadGrant,
  type RetrievedSourceSnapshot,
} from "./command-analysis-source-capture";
import { assertTrustedAnalysisEvidence } from "./command-analysis-evidence";

const T="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW="2026-10-17T08:30:00.000Z";
const sha=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
const scope={
  tenantId:T,missionId:M,verifiedActorId:A,agentId:"business",
  goalDigest:sha("Research customer sector"),routingDigest:sha("Plan v1"),
};
const snapshotText="The authenticated business source identifies three opportunities for further research.";

function fixture(opts:Record<string,unknown>={}) {
 const calls:string[]=[];
 const connector:AnalysisSourceConnector={
   async authorize({sourceId,tenantId,missionId,actorId}) {
     calls.push("authorize:"+sourceId);
     if(opts.authorizationFailure) throw Error("private authorization error");
     if(opts.denyAccess) return null;
     return {
       sourceId,tenantId:opts.foreignGrant ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd" : tenantId,
       missionId,actorId,
       sourceRef:"realtyflow:document-123",
       revision:"rev.2026-10-17",
       capability:"read_analysis",
       expiresAt:opts.expired ? "2026-10-17T08:20:00.000Z" : "2026-10-17T08:38:00.000Z",
     } satisfies SourceReadGrant;
   },
   async read(grant) {
     calls.push("read:"+grant.sourceId);
     if(opts.readFailure) throw Error("private connector failure");
     return {
       sourceId:grant.sourceId,
       tenantId:opts.foreignSnapshot ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd" : grant.tenantId,
       missionId:grant.missionId,
       sourceRef:grant.sourceRef,
       revision:opts.staleRevision ? "rev.2026-10-16" : grant.revision,
       capturedAt:opts.staleTime ? "2026-10-16T06:30:00.000Z" : "2026-10-17T08:29:30.000Z",
       excerpt:opts.longText ? "word ".repeat(800) : snapshotText,
     } satisfies RetrievedSourceSnapshot;
   },
   async revalidate(grant) {
     calls.push("revalidate:"+grant.sourceId);
     if(opts.revalidationFailure) throw Error("source revoked?");
     return !opts.revoked;
   },
 };
 return {connector,calls};
}
const run=(connector:AnalysisSourceConnector,sourceIds=["record_1"])=>captureCommandAnalysisSources({
  scope,sourceIds,now:NOW,connector,
});
const denied=async(f:()=>Promise<unknown>)=>{
  await assert.rejects(f(),e=>e instanceof SourceCaptureDenied);
};

test("authorized, fresh source becomes correctly hashed legacy evidence, no actions",async()=>{
  const {connector,calls}=fixture();
  const bundle=await run(connector);
  assert.equal(bundle.status,"source_capture_only");
  assert.equal(bundle.modelCalls,0);
  assert.equal(bundle.externalActionsPerformed,0);
  assert.equal(bundle.sources.length,1);
  const one=bundle.sources[0];
  assert.equal(one.tenantId,T);
  assert.equal(one.sourceRef,"realtyflow:document-123");
  assert.equal(one.excerptDigest,sha(snapshotText));
  assert.equal(bundle.evidenceDigest,sha(JSON.stringify([{
    sourceId:"record_1",digest:sha(snapshotText),tenantId:T,
  }])));
  assert.match(bundle.provenanceDigest,/^[a-f0-9]{64}$/);
  assertTrustedAnalysisEvidence(scope,bundle.sources,NOW);
  assert.deepEqual(calls,["authorize:record_1","read:record_1","revalidate:record_1"]);
});

test("all source IDs are canonical and sorted to avoid nondeterministic permit digests",async()=>{
  const a=await run(fixture().connector,["record_2","record_1"]);
  const b=await run(fixture().connector,["record_1","record_2"]);
  assert.deepEqual(a.sources.map(s=>s.id),["record_1","record_2"]);
  assert.equal(a.evidenceDigest,b.evidenceDigest);
  assert.equal(a.provenanceDigest,b.provenanceDigest);
});

test("source IDs cannot smuggle URLs, duplicates or arbitrary source amounts",async()=>{
  const {connector,calls}=fixture();
  for(const ids of [
    [],["https://evil.example/private"],["../../../etc/passwd"],
    ["record_1","record_1"],["a","b","c","d","e"],
  ]) {
    await denied(()=>run(connector,ids));
  }
  assert.deepEqual(calls,[]);
});

test("rejects wrong-tenant grants, wrong-tenant snapshots and expired grants",async()=>{
  for(const flag of ["foreignGrant","foreignSnapshot","expired"]) {
    const {connector}=fixture({[flag]:true});
    await denied(()=>run(connector));
  }
});

test("rejects stale or altered source revisions and stale capture times",async()=>{
  for(const flag of ["staleRevision","staleTime","longText"]) {
    const {connector}=fixture({[flag]:true});
    await denied(()=>run(connector));
  }
});

test("source revocation after read blocks candidate before it can reach a model",async()=>{
  const {connector,calls}=fixture({revoked:true});
  await denied(()=>run(connector));
  assert.deepEqual(calls,["authorize:record_1","read:record_1","revalidate:record_1"]);
});

test("all connector exceptions fail closed with no success fallback",async()=>{
  for(const flag of ["authorizationFailure","readFailure","revalidationFailure"]) {
    const {connector}=fixture({[flag]:true});
    await denied(()=>run(connector));
  }
});

test("missing identity or invalid clock fails before connector requests",async()=>{
  const {connector,calls}=fixture();
  await denied(()=>captureCommandAnalysisSources({...{
    scope:{...scope,tenantId:"client"} as typeof scope,
    sourceIds:["record_1"],now:NOW,connector,
  }}));
  await denied(()=>captureCommandAnalysisSources({scope,sourceIds:["record_1"],
    now:"2026-10-17",connector}));
  assert.deepEqual(calls,[]);
});
