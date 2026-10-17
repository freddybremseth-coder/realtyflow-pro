import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  createAdminSession, createWorkspacePreviewSession, WORKSPACE_PREVIEW_COOKIE,
} from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, PATCH } from "../../src/app/api/workspaces/[brandKey]/lead-tasks/route";

const endpoint="https://realtyflow.test/api/workspaces/altovena/lead-tasks";
const brandId="11111111-1111-4111-8111-111111111111";
const operatorId="22222222-2222-4222-8222-222222222222";
const taskId="33333333-3333-4333-8333-333333333333";
const contactId="44444444-4444-4444-8444-444444444444";
const foreignTaskId="55555555-5555-4555-8555-555555555555";
const args={params:{brandKey:"altovena"}};
let permissions=["crm.read","crm.write"];
let grantStatus="active";
let operatorVerified=true;
let taskStatus="TO_DO";
let totalOpenCount=1;
let overdueCount=0;
let countFailed=false;
let changedStatus:string|null=null;
const calls:Array<{method:string;args:unknown[]}>=[];
let restore=()=>{};

function request(cookie="",method:"GET"|"PATCH"="GET",body?:unknown,headers:Record<string,string>={}) {
  return new NextRequest(endpoint,{
    method,
    headers:{
      ...(cookie?{cookie}:{}),
      ...(method==="PATCH"?{"Content-Type":"application/json",origin:"https://realtyflow.test"}:{}),
      ...headers,
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
}
async function ownerCookie() {
  return "realtyflow_admin="+await createAdminSession("owner@example.invalid");
}
async function memberCookie() {
  return "realtyflow_admin="+await createAdminSession("staff@example.invalid","WORKSPACE_MEMBER");
}
function mockBackend(){
  function makeSelectChain() {
    let head=false;
    let overdue=false;
    const chain:any={
      select(...params:unknown[]){
        calls.push({method:"select",args:params});
        head=(params[1] as {head?:boolean}|undefined)?.head===true;
        return chain;
      },
      eq(...params:unknown[]){calls.push({method:"eq",args:params});return chain;},
      in(...params:unknown[]){calls.push({method:"in",args:params});return chain;},
      order(...params:unknown[]){calls.push({method:"order",args:params});return chain;},
      limit(...params:unknown[]){calls.push({method:"limit",args:params});return chain;},
      lte(...params:unknown[]){
        overdue=true;calls.push({method:"lte",args:params});return chain;
      },
      then(resolve:(value:unknown)=>unknown){
        if(head) return Promise.resolve({
          data:null,count:overdue?overdueCount:totalOpenCount,
          error:countFailed?{message:"count unavailable"}:null,
        }).then(resolve);
        return Promise.resolve({data:[
          {id:taskId,brand_id:"altovena",source_type:"website_lead",source_id:contactId,
            title:"Altovena Visibility enquiry",status:taskStatus,priority:"HIGH",
            created_at:"2026-10-17T08:30:00.000Z",due_date:null,next_action:"Respond personally"},
          {id:foreignTaskId,brand_id:"zeneco",source_type:"website_lead",source_id:contactId,
            title:"Another brand private customer",status:"TO_DO",priority:"HIGH"},
          {id:"not-a-uuid",brand_id:"altovena",source_type:"website_lead",
            title:"Malformed row",status:"TO_DO",priority:"HIGH"},
        ],error:null}).then(resolve);
      },
    };
    return chain;
  }
  setPlatformSupabaseFactoryForTests(()=>({
    rpc:async(name:string,parameters?:Record<string,unknown>)=>{
      calls.push({method:"rpc",args:[name,parameters]});
      if(name==="workspace_brand_grant")return {data:{
        brand:{id:brandId,brand_key:"altovena"},
        grant:{brand_id:brandId,user_id:operatorId,email:"staff@example.invalid",
          status:grantStatus,permissions},
      },error:null};
      if(name==="altovena_mark_lead_task")return {data:changedStatus?{
        ok:true,brand:"altovena",task:{id:taskId,status:changedStatus},
      }:{ok:false,error:"TASK_NOT_FOUND_OR_ALREADY_HANDLED"},error:null};
      throw Error("Unexpected RPC: "+name);
    },
    from:(table:string)=>{calls.push({method:"from",args:[table]});return makeSelectChain();},
    auth:{admin:{getUserById:async(id:string)=>{
      calls.push({method:"getUserById",args:[id]});
      return {data:operatorVerified?{user:{id:operatorId,email:"staff@example.invalid"}}:{user:null},
        error:null};
    }}},
  } as unknown as SupabaseClient));
}

test.beforeEach(()=>{
 const snapshot=Object.fromEntries([
 "REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
 "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED",
 ].map(key=>[key,process.env[key]]));
 process.env.REALTYFLOW_SESSION_SECRET="synthetic-lead-task-access-tests";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://isolated-brand-test.invalid";
 process.env.SUPABASE_SERVICE_ROLE_KEY="test-only-not-real";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 permissions=["crm.read","crm.write"];grantStatus="active";operatorVerified=true;
 changedStatus=null;taskStatus="TO_DO";totalOpenCount=1;overdueCount=0;
 countFailed=false;calls.length=0;
 mockBackend();
 restore=()=>{
  setPlatformSupabaseFactoryForTests(null);
  for(const [key,value] of Object.entries(snapshot)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 };
});
test.afterEach(()=>restore());

test("unsigned and foreign brand requests never reach privileged query",async()=>{
 assert.equal((await GET(request(),args)).status,401);
 assert.equal((await GET(request(),{params:{brandKey:"zeneco"}})).status,404);
 assert.equal(calls.length,0);
});

test("owner sees only open Altovena lead tasks and cannot leak other-brand rows",async()=>{
 const response=await GET(request(await ownerCookie()),args);
 assert.equal(response.status,200);
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 const payload=await response.json();
 assert.equal(payload.brand,"altovena");
 assert.equal(payload.tasks.length,1);
 assert.equal(payload.totalOpen,1);
 assert.equal(payload.overdueNotStarted,0);
 assert.equal(payload.tasks[0].contactId,contactId);
 assert.equal(JSON.stringify(payload).includes("Another brand private customer"),false);
 assert.equal(JSON.stringify(payload).includes("Malformed row"),false);
 assert.ok(calls.some(c=>c.method==="eq"&&c.args[0]==="brand_id"&&c.args[1]==="altovena"));
 assert.ok(calls.some(c=>c.method==="eq"&&c.args[0]==="source_type"&&c.args[1]==="website_lead"));
 assert.deepEqual(calls.find(c=>c.method==="limit")?.args,[40]);
 const select=String(calls.find(c=>c.method==="select")?.args[0]||"");
 assert.equal(select.includes("*"),false);
 assert.equal(select.includes("interactions"),false);
 assert.equal(select.includes("email"),false);
});

test("verified worker with Altovena read grant sees same task, never another brand",async()=>{
 const response=await GET(request(await memberCookie()),args);
 assert.equal(response.status,200);
 const result=await response.json();
 assert.deepEqual(result.tasks.map((row:{id:string})=>row.id),[taskId]);
 assert.equal(result.totalOpen,1);
 assert.equal(result.overdueNotStarted,0);
 assert.ok(calls.some(c=>c.method==="getUserById"&&c.args[0]===operatorId));
});


test("server-wide counts see old unstarted leads beyond the newest-40 board",async()=>{
 totalOpenCount=94;overdueCount=27;
 const owner=await GET(request(await ownerCookie()),args);
 const member=await GET(request(await memberCookie()),args);
 assert.equal(owner.status,200);
 assert.equal(member.status,200);
 for(const response of [owner,member]){
  const payload=await response.json();
  assert.equal(payload.tasks.length,1,"visible filtered rows are not all rows");
  assert.equal(payload.totalOpen,94,"must not infer total from latest rows");
  assert.equal(payload.overdueNotStarted,27,"must count older unstarted enquiries");
  assert.equal(payload.brand,"altovena");
 }
 const headQueries=calls.filter(c=>c.method==="select"&&(c.args[1] as any)?.head===true);
 assert.equal(headQueries.length,4,"two independently scoped count queries per viewer");
 assert.ok(calls.some(c=>c.method==="lte"&&c.args[0]==="created_at"));
 assert.ok(calls.filter(c=>c.method==="eq"&&c.args[0]==="brand_id"&&c.args[1]==="altovena").length>=6);
 const redacted=await (await GET(request(await ownerCookie()),args)).json();
 assert.equal(JSON.stringify(redacted).includes("Another brand private customer"),false);
});

test("failed global count fails closed instead of reporting zero overdue",async()=>{
 countFailed=true;
 const result=await GET(request(await ownerCookie()),args);
 assert.equal(result.status,503);
 assert.deepEqual((await result.json()).error,{code:"LEAD_COUNTS_UNAVAILABLE"});
});

test("revoked grant, absent crm.read and mismatched identity all fail closed",async()=>{
 const cookie=await memberCookie();
 for(const step of ["revoked","missing_permission","identity_mismatch"]){
  calls.length=0;
  grantStatus=step==="revoked"?"revoked":"active";
  permissions=step==="missing_permission"?["crm.write"]:["crm.read","crm.write"];
  operatorVerified=step!=="identity_mismatch";
  const result=await GET(request(cookie),args);
  assert.equal(result.status,403,step);
  assert.equal(calls.some(c=>c.method==="from"),false,step);
 }
});

test("read-only worker cannot mark a lead; owner and authorized worker can",async()=>{
 const member=await memberCookie();
 permissions=["crm.read"];changedStatus="IN_PROGRESS";
 const denied=await PATCH(request(member,"PATCH",{id:taskId,status:"IN_PROGRESS"}),args);
 assert.equal(denied.status,403);
 assert.equal(calls.some(c=>c.method==="rpc"&&c.args[0]==="altovena_mark_lead_task"),false);
 permissions=["crm.read","crm.write"];
 const accepted=await PATCH(request(member,"PATCH",{id:taskId,status:"IN_PROGRESS"}),args);
 assert.equal(accepted.status,200);
 assert.equal((await accepted.json()).task.status,"IN_PROGRESS");
 const updateCall=calls.find(c=>c.method==="rpc"&&c.args[0]==="altovena_mark_lead_task");
 assert.deepEqual(updateCall?.args[1],{
   p_task_id:taskId,p_status:"IN_PROGRESS",p_actor_email:"staff@example.invalid",
 });
 const owner=await PATCH(request(await ownerCookie(),"PATCH",{id:taskId,status:"DONE"}),args);
 assert.equal(owner.status,404);
 changedStatus="DONE";
 assert.equal((await PATCH(request(await ownerCookie(),"PATCH",{id:taskId,status:"DONE"}),args)).status,200);
 const writes=calls.filter(c=>c.method==="rpc"&&c.args[0]==="altovena_mark_lead_task");
 assert.equal((writes.at(-1)?.args[1] as Record<string,unknown>).p_actor_email,"owner@example.invalid");
});

test("unsafe PATCH body, cross-site origin and owner preview write are denied",async()=>{
 const cookie=await ownerCookie();
 for(const [body,headers,status] of [
   [{id:taskId,status:"CANCELLED"},{},400],
   [{id:taskId,status:"DONE",brandKey:"zeneco"},{},400],
   [{id:foreignTaskId,status:"DONE"},{origin:"https://attacker.invalid"},403],
   [{id:taskId,status:"DONE"},{"sec-fetch-site":"cross-site"},403],
 ] as const){
  const res=await PATCH(request(cookie,"PATCH",body,headers),args);
  assert.equal(res.status,status);
 }
 assert.equal(calls.some(c=>c.method==="rpc"&&c.args[0]==="altovena_mark_lead_task"),false);

 const preview=await createWorkspacePreviewSession(
    "owner@example.invalid","staff@example.invalid","Staff member");
 const previewCookie=cookie+"; "+WORKSPACE_PREVIEW_COOKIE+"="+preview;
 assert.equal((await GET(request(previewCookie),args)).status,200);
 assert.equal((await PATCH(request(previewCookie,"PATCH",{id:taskId,status:"DONE"}),args)).status,403);
});
