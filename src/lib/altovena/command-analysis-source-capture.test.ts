import assert from "node:assert/strict";
import test from "node:test";
import {
  captureAuthorizedCommandSources,digestVerifiedSourceBundle,
  type AuthorizedSourceMaterial, type AuthorizedSourceConnector,
  type PrivateEvidenceSnapshotStore,
} from "./command-analysis-source-capture";
const tenantId="dcc65a7f-d4c4-490d-b4da-8ed6f1b2a0b9";
const missionId="b8ce3e82-f928-4db1-b532-716980699805";
const verifiedActorId="5db6a674-823a-4c48-9d39-e7bea29b967a";
const scope={tenantId,missionId,verifiedActorId};
const now="2026-10-17T09:54:00.000Z";
const material=(id="internal_one"):AuthorizedSourceMaterial=>({
  id,tenantId,missionId,authorizedActorId:verifiedActorId,
  sourceRef:"internal:approved/inspection-2026",
  excerpt:"Inspection is timestamped, and its measured irrigation reading is 8.5 cubic meters.",
  capturedAt:"2026-10-17T09:53:00.000Z",
  access:"authorized_for_this_mission",
});
const build=(override:Partial<AuthorizedSourceMaterial>={},saveOverride?:Partial<{
  kind:"stored",evidenceDigest:string,sourceCount:number
}>)=>{
  let calls=0,storeCalls=0,revalidationCalls=0;
  let currentAccess=true;
  const connector:AuthorizedSourceConnector={
    async readForMission({sourceId}){calls++;return {...material(sourceId),...override};},
    async revalidateForMission({scope,sourceId,sourceRef,excerptDigest,capturedAt}){
      revalidationCalls++;
      return currentAccess &&
        scope.tenantId===tenantId && scope.missionId===missionId &&
        scope.verifiedActorId===verifiedActorId &&
        sourceId.length>0 && sourceRef.startsWith("internal:") &&
        /^[a-f0-9]{64}$/.test(excerptDigest) && capturedAt.includes("T");
    },
  };
  const store:PrivateEvidenceSnapshotStore={
    async save(input){storeCalls++;return {kind:"stored",evidenceDigest:input.evidenceDigest,
      sourceCount:input.snapshots.length,...saveOverride};},
  };
  return {connector,store,getCalls:()=>calls,getStoreCalls:()=>storeCalls,
    getRevalidationCalls:()=>revalidationCalls,
    revoke:()=>{currentAccess=false;},
  };
};
test("only server-authorized source material can produce a stable audit digest",async()=>{
  const mock=build();
  const value=await captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
  });
  assert.equal(value.status,"stored_for_independent_review");
  assert.equal(value.sourceCount,1);
  assert.equal(value.snapshots[0].id,"internal_one");
  assert.match(value.snapshots[0].excerptDigest,/^[a-f0-9]{64}$/);
  assert.equal(value.evidenceDigest,digestVerifiedSourceBundle(scope,value.snapshots));
  assert.equal(mock.getCalls(),1);
  assert.equal(mock.getStoreCalls(),1);
});
test("tenant, mission and authenticated actor mismatches are rejected before storage",async()=>{
  for(const override of [
    {tenantId:"cf886ca2-245d-495b-95f1-7164c1d4b902"},
    {missionId:"31363464-787f-4ea4-8141-772a7db30d4b"},
    {authorizedActorId:"cf886ca2-245d-495b-95f1-7164c1d4b902"},
    {access:"unauthorized" as never},
  ]){
    const mock=build(override);
    await assert.rejects(captureAuthorizedCommandSources({
      scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
    }),/unauthorized_or_invalid_source/);
    assert.equal(mock.getStoreCalls(),0);
  }
});
test("source URLs are never accepted as arbitrary public network locations",async()=>{
  const mock=build({sourceRef:"https://attacker.example/injected"});
  await assert.rejects(captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
  }),/unauthorized_or_invalid_source/);
  assert.equal(mock.getStoreCalls(),0);
});
test("duplicates and forged IDs cannot reach a connector",async()=>{
  for(const sourceIds of [
    ["internal_one","internal_one"],["https://example.com"],[],Array(13).fill("xid"),
  ]){
    const mock=build();
    await assert.rejects(captureAuthorizedCommandSources({
      scope,sourceIds,now,connector:mock.connector,store:mock.store,
    }),/invalid_source_ids/);
    assert.equal(mock.getCalls(),0);
  }
});
test("future/stale evidence and malformed clocks are denied",async()=>{
  for(const capturedAt of [
    "2026-10-17T09:55:00.000Z","2026-10-17T09:30:00.000Z","invalid",
  ]){
    const mock=build({capturedAt});
    await assert.rejects(captureAuthorizedCommandSources({
      scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
    }),/stale_or_invalid_source_capture/);
    assert.equal(mock.getStoreCalls(),0);
  }
});
test("source content size and untrusted bytes cannot be silently bypassed",async()=>{
  for(const excerpt of ["short","a".repeat(4001),"verified content\0malicious"]){
    const mock=build({excerpt});
    await assert.rejects(captureAuthorizedCommandSources({
      scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
    }),/unauthorized_or_invalid_source/);
  }
});
test("database snapshot receipt must echo the exact digest and count",async()=>{
  for(const receipt of [{evidenceDigest:"f".repeat(64)},{sourceCount:2}]){
    const mock=build({},receipt);
    await assert.rejects(captureAuthorizedCommandSources({
      scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
    }),/snapshot_not_durably_stored/);
  }
});
test("changing source bytes or source order changes content digest correctly",async()=>{
  const first=build();
  const a=await captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:first.connector,store:first.store,
  });
  const second=build({excerpt:"A different authenticated source snapshot with a different reading."});
  const b=await captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:second.connector,store:second.store,
  });
  assert.notEqual(a.evidenceDigest,b.evidenceDigest);
  assert.equal(digestVerifiedSourceBundle(scope,[
    {id:"bbb",excerptDigest:"b".repeat(64)},
    {id:"aaa",excerptDigest:"a".repeat(64)},
  ]),digestVerifiedSourceBundle(scope,[
    {id:"aaa",excerptDigest:"a".repeat(64)},
    {id:"bbb",excerptDigest:"b".repeat(64)},
  ]));
});

test("revoked source after successful read is NEVER saved",async()=>{
  const mock=build();
  const originalRead=mock.connector.readForMission.bind(mock.connector);
  mock.connector.readForMission=async (input)=>{
    const row=await originalRead(input);
    mock.revoke();
    return row;
  };
  await assert.rejects(captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:mock.connector,store:mock.store,
  }),/source_access_revoked_after_read/);
  assert.equal(mock.getCalls(),1);
  assert.equal(mock.getRevalidationCalls(),1);
  assert.equal(mock.getStoreCalls(),0);
});

test("all captured sources must pass a fresh ACL check before the bundle is saved",async()=>{
  const mock=build();
  const original=mock.connector.revalidateForMission.bind(mock.connector);
  mock.connector.revalidateForMission=async input=>{
    if(input.sourceId==="internal_two") return false;
    return original(input);
  };
  await assert.rejects(captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one","internal_two"],now,
    connector:mock.connector,store:mock.store,
  }),/source_access_revoked_after_read/);
  assert.equal(mock.getCalls(),2);
  assert.equal(mock.getStoreCalls(),0);
});

test("missing ACL recheck or a connector outage fail closed",async()=>{
  const one=build();
  const noRevalidation=one.connector as unknown as Record<string,unknown>;
  delete noRevalidation.revalidateForMission;
  await assert.rejects(captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:one.connector,store:one.store,
  }),/source_revalidation_required/);
  assert.equal(one.getStoreCalls(),0);

  const two=build();
  two.connector.revalidateForMission=async()=>{throw Error("private ACL outage");};
  await assert.rejects(captureAuthorizedCommandSources({
    scope,sourceIds:["internal_one"],now,connector:two.connector,store:two.store,
  }),/source_revalidation_unavailable/);
  assert.equal(two.getStoreCalls(),0);
});
