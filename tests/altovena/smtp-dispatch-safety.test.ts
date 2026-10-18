import assert from "node:assert/strict";
import test from "node:test";
import type {SupabaseClient} from "@supabase/supabase-js";
import {runStagingOperatorSmtp} from "../../src/lib/altovena/dispatch-staging-operator-email";

const owner="owner@example.invalid",staff="staff@example.invalid";
const userId="22222222-2222-4222-8222-222222222222";
const brandId="11111111-1111-4111-8111-111111111111";
const attemptId="33333333-3333-4333-8333-333333333333";
const secret="isolated-only-HMAC-key-do-not-ever-use-live-2026";
let revoked=false,claimed=false,claimError=false,finishError=false,tryCalls=0;
let sendMode:"accepted"|"failed"|"throws"="accepted";
let verifications=0;
const smtpCalls:string[]=[];
const finishRecords:Record<string,unknown>[]=[];
function deps(){
 const db={
  rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==="workspace_brand_grant"){
    verifications++;
    return {data:{
      brand:{id:brandId,brand_key:"altovena"},
      grant:{brand_id:brandId,user_id:userId,email:staff,
        status:revoked?"revoked":"active",permissions:["crm.read"]},
    },error:null};
   }
   if(name==="altovena_claim_operator_smtp"){
    tryCalls++;
    if(claimError)return {data:null,error:{message:"unavailable"}};
    if(claimed)return {data:{ok:true,brand:"altovena",claimed:false,
      smtpAccepted:false,delivered:false},error:null};
    claimed=true;
    return {data:{ok:true,brand:"altovena",claimed:true,attemptId,
      kind:"NOT_STARTED_24H",smtpAccepted:false,delivered:false},error:null};
   }
   if(name==="altovena_finalize_operator_smtp"){
    finishRecords.push(args);
    if(finishError)return {data:null,error:{message:"unknown DB commit"}};
    return {data:{ok:true,brand:"altovena",state:args.p_outcome,
      smtpAccepted:args.p_outcome==="SMTP_ACCEPTED",delivered:false},error:null};
   }
   throw Error("Unexpected DB call "+name);
  },
  auth:{admin:{getUserById:async(id:string)=>({
    data:{user:{id:userId,email:staff}},error:null,
  })}},
 } as unknown as Pick<SupabaseClient,"rpc"|"auth">;
 const send=async(email:string,kind:string)=>{
  smtpCalls.push(email+":"+kind);
  if(sendMode==="throws")throw Error("uncertain SMTP failure after acceptance");
  if(sendMode==="failed")return {success:false};
  return {success:true,messageId:"<test-smtp-accepted@example.invalid>"};
 };
 return {db,rawAllowlist:owner+","+staff,hmacSecret:secret,
  isOwnerEmail:(email:string)=>email===owner,
  send:send as any};
}
test.beforeEach(()=>{
 revoked=false;claimed=false;claimError=false;finishError=false;tryCalls=0;
 sendMode="accepted";verifications=0;smtpCalls.length=0;finishRecords.length=0;
});
test("after DB claim, acceptance is recorded but delivered stays FALSE",async()=>{
 const result=await runStagingOperatorSmtp(deps());
 assert.deepEqual(result,{ok:true,brand:"altovena",recipientCount:2,
  claimed:1,smtpAccepted:1,unknown:0,delivered:false});
 assert.equal(smtpCalls.length,1);
 assert.equal(smtpCalls[0],owner+":NOT_STARTED_24H");
 assert.equal(finishRecords[0].p_outcome,"SMTP_ACCEPTED");
 assert.equal(JSON.stringify(result).includes("@"),false);
 assert.equal(verifications>=4,true);
});
test("SMTP ambiguous exceptions never trigger another call or blind retry",async()=>{
 sendMode="throws";
 const outcome=await runStagingOperatorSmtp(deps());
 assert.equal(outcome.ok,true);
 if(!outcome.ok)return;
 assert.equal(outcome.smtpAccepted,0);
 assert.equal(outcome.unknown,1);
 assert.equal(outcome.delivered,false);
 assert.equal(finishRecords[0].p_outcome,"OUTCOME_UNKNOWN");
 assert.equal(smtpCalls.length,1);
 const second=await runStagingOperatorSmtp(deps());
 assert.equal(second.ok,true);
 assert.equal(smtpCalls.length,1,"committed attempt must never be retried");
});
test("explicit negative provider result remains unknown, not presumed safe retry",async()=>{
 sendMode="failed";
 const outcome=await runStagingOperatorSmtp(deps());
 assert.equal(outcome.ok,true);
 if(outcome.ok)assert.equal(outcome.unknown,1);
 assert.equal(finishRecords[0].p_message_id,null);
});
test("revoked member before first claim blocks BOTH operator senders",async()=>{
 revoked=true;
 const outcome=await runStagingOperatorSmtp(deps());
 assert.deepEqual(outcome,{ok:false,code:"RECIPIENT_IDENTITY_UNVERIFIED",
  claimed:0,smtpAccepted:0,unknown:0,delivered:false});
 assert.equal(smtpCalls.length,0);
 assert.equal(tryCalls,0);
});
test("DB claim failure or outcome write failure cannot be called success",async()=>{
 claimError=true;
 let outcome=await runStagingOperatorSmtp(deps());
 assert.equal(outcome.ok,false);
 assert.equal(smtpCalls.length,0);
 claimError=false;finishError=true;
 outcome=await runStagingOperatorSmtp(deps());
 assert.equal(outcome.ok,false);
 if(!outcome.ok)assert.equal(outcome.code,"SMTP_OUTCOME_UNAVAILABLE");
 assert.equal(smtpCalls.length,1);
});
