import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession, createWorkspacePreviewSession, WORKSPACE_PREVIEW_COOKIE } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "./route";

const endpoint="https://realtyflow.test/api/workspaces/altovena/launch-readiness";
const brandId="22222222-2222-4222-8222-222222222222";
const operatorId="33333333-3333-4333-8333-333333333333";
const partnerEmail="operator@example.invalid";
const operatorRights=[
  "crm.read","crm.write","marketing.read","marketing.draft","marketing.publish",
  "content.read","content.edit","content.publish","email.read","email.draft","email.send",
  "visibility.read","visibility.plan","ads.read","ads.draft","events.plan","nexus.read",
];
const healthOkay={
  schema_version:"altovena-intake-v1",
  brand_present:true,receipts_present:true,
  intake_rpc_secured:true,task_rpc_secured:true,
};
const watchEnv=[
 "REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS","NEXT_PUBLIC_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","ALTOVENA_INTAKE_ENABLED","ALTOVENA_INTAKE_KEY",
 "ALTOVENA_ANDREA_AUTH_USER_ID"
];
const saved=Object.fromEntries(watchEnv.map(key=>[key,process.env[key]]));
const flags={brand:false,health:false,missingHealth:true,brokenHealth:false,grant:false};
function mockDatabase(){
  setPlatformSupabaseFactoryForTests(()=>({
    rpc:async(name:string,args?:Record<string,unknown>)=>{
      if(name==="workspace_access_snapshot")
        return {data:{brands:flags.brand?[{id:brandId,brand_key:"altovena"}]:[],plans:[]},error:null};
      if(name==="altovena_intake_health"){
        if(flags.brokenHealth)return {data:null,error:{code:"PGRST999",message:"unavailable"}};
        if(flags.missingHealth)return {data:null,error:{code:"PGRST202",message:"altovena_intake_health not found"}};
        return {data:flags.health?healthOkay:{...healthOkay,intake_rpc_secured:false},error:null};
      }
      if(name==="workspace_user_brand_grants"){
        assert.equal(args?.p_email,partnerEmail);
        return {data:flags.grant?[{brand:{id:brandId},grant:{
          brand_id:brandId,user_id:operatorId,email:partnerEmail,status:"active",permissions:operatorRights,
        }}]:[],error:null};
      }
      throw Error("Unexpected RPC "+name);
    },
    auth:{admin:{getUserById:async(id:string)=>{
      assert.equal(id,operatorId);
      return {data:{user:{id:operatorId,email:partnerEmail}},error:null};
    }}},
  }) as unknown as SupabaseClient);
}
function req(session?:string,preview?:string){
  const cookie=[
    ...(session?["realtyflow_admin="+session]:[]),
    ...(preview?[WORKSPACE_PREVIEW_COOKIE+"="+preview]:[]),
  ];
  return new NextRequest(endpoint,{headers:cookie.length?{cookie:cookie.join("; ")}:{}});
}
test("Owner readiness never activates a contact form, reports real migration and verified scoped grants",async()=>{
  try{
    process.env.REALTYFLOW_SESSION_SECRET="test-only-owner-readiness-secret";
    process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
    process.env.NEXT_PUBLIC_SUPABASE_URL="https://db.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-role-not-production";
    delete process.env.ALTOVENA_INTAKE_ENABLED;
    delete process.env.ALTOVENA_INTAKE_KEY;
    delete process.env.ALTOVENA_ANDREA_AUTH_USER_ID;
    mockDatabase();
    const owner=await createAdminSession("owner@example.invalid");
    const member=await createAdminSession("member@example.invalid","WORKSPACE_MEMBER");

    assert.equal((await GET(req())).status,401);
    assert.equal((await GET(req(member))).status,403);
    const preview=await createWorkspacePreviewSession("owner@example.invalid",partnerEmail,"Team member");
    assert.equal((await GET(req(owner,preview))).status,403);

    const initial=await GET(req(owner));
    assert.equal(initial.status,200);
    const first=await initial.json();
    assert.equal(first.readyForPublicForm,false);
    assert.equal(first.checks.find((c:{id:string})=>c.id==="brand").state,"blocked");
    assert.equal(first.checks.find((c:{id:string})=>c.id==="migration").state,"blocked");
    assert.equal(first.checks.find((c:{id:string})=>c.id==="receiver").state,"blocked");
    assert.ok(!JSON.stringify(first).includes("test-service-role"));

    // Andrea's verified Supabase identity must show independently of whether
    // Altovena has been provisioned or any scoped brand permission was granted.
    process.env.ALTOVENA_ANDREA_AUTH_USER_ID=operatorId;
    const beforeBrand=await (await GET(req(owner))).json();
    assert.equal(beforeBrand.checks.find((c:{id:string})=>c.id==="operator_identity").state,"verified");
    assert.equal(beforeBrand.checks.find((c:{id:string})=>c.id==="operator_grants").state,"blocked");
    assert.equal(beforeBrand.checks.find((c:{id:string})=>c.id==="brand").state,"blocked");
    delete process.env.ALTOVENA_ANDREA_AUTH_USER_ID;

    // The schema can be present while its intake RPC is unexpectedly exposed.
    // A secret alone must never mark such a deployment as ready.
    flags.brand=true;flags.missingHealth=false;flags.health=false;
    process.env.ALTOVENA_INTAKE_ENABLED="true";
    process.env.ALTOVENA_INTAKE_KEY="test-key-at-least-thirty-two-characters-long";
    let answer=await (await GET(req(owner))).json();
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="migration").state,"blocked");
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="receiver").state,"blocked");

    flags.health=true;
    answer=await (await GET(req(owner))).json();
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="migration").state,"verified");
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="receiver").state,"verified");
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="operator_identity").state,"not_configured");
    assert.equal(answer.readyForPublicForm,false);
    assert.ok(!JSON.stringify(answer).includes(process.env.ALTOVENA_INTAKE_KEY));

    process.env.ALTOVENA_ANDREA_AUTH_USER_ID=operatorId;
    flags.grant=false;
    answer=await (await GET(req(owner))).json();
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="operator_identity").state,"verified");
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="operator_grants").state,"blocked");
    flags.grant=true;
    answer=await (await GET(req(owner))).json();
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="operator_identity").state,"verified");
    assert.equal(answer.checks.find((c:{id:string})=>c.id==="operator_grants").state,"verified");
    assert.equal(answer.readyForPublicForm,false);
    assert.ok(!JSON.stringify(answer).includes(partnerEmail));
    assert.ok(!JSON.stringify(answer).includes(operatorId));

    flags.brokenHealth=true;
    const unavailable=await GET(req(owner));
    assert.equal(unavailable.status,503);
    assert.equal((await unavailable.json()).error,"INTAKE_HEALTH_UNAVAILABLE");
    console.log("PASS: owner-only release gate, no cross-account access, missing/broken migration, real role security, operator verification, privacy of credentials, no public activation.");
  }finally{
    setPlatformSupabaseFactoryForTests(null);
    for(const k of watchEnv)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];
  }
});
