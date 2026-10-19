import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAltovenaDeliveryRecipients } from
  "../../src/lib/altovena/verified-delivery-recipients";

const owner="owner@example.invalid",staff="staff@example.invalid";
const uid="22222222-2222-4222-8222-222222222222";
const brand="11111111-1111-4111-8111-111111111111";
const secret="synthetic-HMAC-key-for-isolated-only-20261018";
let grantStatus="active",memberPermissions=["crm.read"],verifiedEmail=staff,
  verifiedId=uid,brandKey="altovena",brandId=brand,rpcFail=false,authFail=false;
const calls:string[]=[];
function mock():{supabase:Pick<SupabaseClient,"rpc"|"auth">;isOwnerEmail:(email:string)=>boolean}{
 return {
  isOwnerEmail:(email)=>email===owner,
  supabase:{
   rpc:async(name:string,args:Record<string,unknown>)=>{
    calls.push(name+":"+args.p_email);
    assert.equal(name,"workspace_brand_grant");
    if(rpcFail)return {data:null,error:{message:"not configured"}};
    return {data:{brand:{id:brandId,brand_key:brandKey},grant:{
      brand_id:brandId,user_id:uid,email:staff,status:grantStatus,
      permissions:memberPermissions,
    }},error:null};
   },
   auth:{admin:{getUserById:async(id:string)=>{
    assert.equal(id,uid);
    return {data:{user:authFail?null:{id:verifiedId,email:verifiedEmail}},
      error:authFail?{message:"unavailable"}:null};
   }}},
  } as unknown as Pick<SupabaseClient,"rpc"|"auth">,
 };
}
test.beforeEach(()=>{
 grantStatus="active";memberPermissions=["crm.read"];verifiedEmail=staff;
 verifiedId=uid;brandKey="altovena";brandId=brand;rpcFail=false;authFail=false;calls.length=0;
});
test("preflight requires two distinct explicitly configured operator addresses",async()=>{
 for(const config of [undefined,"",owner,staff,owner+","+owner,owner+",bad",
      owner+","+staff+",third@example.invalid"]){
  const r=await resolveAltovenaDeliveryRecipients(config,secret,mock());
  assert.deepEqual(r,{ok:false,code:"INVALID_RECIPIENT_CONFIGURATION"});
 }
 assert.equal(calls.length,0);
});
test("owner and independently verified staff get stable distinct HMAC-only keys",async()=>{
 const result=await resolveAltovenaDeliveryRecipients(owner+","+staff,secret,mock());
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.deepEqual(result.recipients.map(x=>x.recipientType),["OWNER","WORKSPACE_MEMBER"]);
 assert.notEqual(result.recipients[0].operatorKey,result.recipients[1].operatorKey);
 assert.equal(new Set(result.recipients.map(x=>x.operatorKey)).size,2);
 assert.ok(result.recipients.every(x=>/^[a-f0-9]{64}$/.test(x.operatorKey)));
 assert.equal(JSON.stringify(result).includes("@"),false);
 assert.deepEqual(calls,["workspace_brand_grant:"+owner,"workspace_brand_grant:"+staff]);
});
test("membership revocation, missing crm.read and Auth mismatch fail closed",async()=>{
 for(const problem of ["revoked","no-permission","email-mismatch","id-mismatch","auth-unavailable"]){
  grantStatus=problem==="revoked"?"revoked":"active";
  memberPermissions=problem==="no-permission"?["marketing.read"]:["crm.read"];
  verifiedEmail=problem==="email-mismatch"?"wrong@example.invalid":staff;
  verifiedId=problem==="id-mismatch"?"33333333-3333-4333-8333-333333333333":uid;
  authFail=problem==="auth-unavailable";
  const r=await resolveAltovenaDeliveryRecipients(owner+","+staff,secret,mock());
  assert.deepEqual(r,{ok:false,code:"RECIPIENT_IDENTITY_UNVERIFIED"},problem);
 }
});
test("brand mismatch or unavailable grant lookup fail closed without a partial list",async()=>{
 brandKey="zeneco";
 assert.equal((await resolveAltovenaDeliveryRecipients(owner+","+staff,secret,mock())).ok,false);
 brandKey="altovena";rpcFail=true;
 assert.deepEqual(await resolveAltovenaDeliveryRecipients(owner+","+staff,secret,mock()),
  {ok:false,code:"GRANT_LOOKUP_UNAVAILABLE"});
});
test("short or missing HMAC secret cannot prepare recipients",async()=>{
 for(const value of [undefined,"short"]){
  assert.deepEqual(await resolveAltovenaDeliveryRecipients(owner+","+staff,value,mock()),
   {ok:false,code:"INVALID_RECIPIENT_CONFIGURATION"});
 }
 assert.equal(calls.length,0);
});
