import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "../../src/app/api/workspaces/[brandKey]/lead-contact/route";

const brand="11111111-1111-4111-8111-111111111111";
const staff="22222222-2222-4222-8222-222222222222";
const contactId="33333333-3333-4333-8333-333333333333";
const args={params:{brandKey:"altovena"}};
const calls:Array<{name:string,args:unknown[]}>=[]; 
let permissions=["crm.read"];
let grantStatus="active";
let identityValid=true;
let row:Record<string,unknown>|null=null;
let dbFailure=false;
let restore=()=>{};
const request=(id=contactId,cookie="")=>new NextRequest(
  "https://realtyflow.test/api/workspaces/altovena/lead-contact?contactId="+encodeURIComponent(id),
  {headers:cookie?{cookie}:{}});

function mockDb(){
  const query:any={
    select(...v:unknown[]){calls.push({name:"select",args:v});return query;},
    eq(...v:unknown[]){calls.push({name:"eq",args:v});return query;},
    async maybeSingle(){return {data:row,error:dbFailure?{message:"synthetic backend error"}:null};},
  };
  setPlatformSupabaseFactoryForTests(()=>({
    from(table:string){calls.push({name:"from",args:[table]});return query;},
    async rpc(name:string,payload?:unknown){
      calls.push({name:"rpc",args:[name,payload]});
      if(name!=="workspace_brand_grant")throw Error("Unexpected RPC "+name);
      return {data:{brand:{id:brand,brand_key:"altovena"},
        grant:{brand_id:brand,user_id:staff,email:"operator@example.invalid",
          status:grantStatus,permissions}},error:null};
    },
    auth:{admin:{async getUserById(id:string){
      return {data:identityValid?{user:{id,email:"operator@example.invalid"}}:{user:null},error:null};
    }}},
  } as unknown as SupabaseClient));
}
test.beforeEach(()=>{
 const old=Object.fromEntries(["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
  "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","REALTYFLOW_WORKSPACE_MEMBERS_ENABLED"
 ].map(k=>[k,process.env[k]]));
 process.env.REALTYFLOW_SESSION_SECRET="test-private-session-key";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://test-supabase.invalid";
 process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key-not-real";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 permissions=["crm.read"];grantStatus="active";identityValid=true;dbFailure=false;calls.length=0;
 row={id:contactId,name:"Synthetic Customer",email:"lead@example.invalid",
  phone:null,brand:"altovena",brand_id:"altovena",pipeline_status:"NEW",
  source:"altovena.com/contact",created_at:"2026-10-17T11:00:00.000Z",
  updated_at:"2026-10-17T11:05:00.000Z",
  notes:"Private message must never be exposed",commission_amount:99999,
  interactions:[{content:"Sensitive note"}]};
 mockDb();
 restore=()=>{setPlatformSupabaseFactoryForTests(null);
  for(const [key,value] of Object.entries(old)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 };
});
test.afterEach(()=>restore());
const owner=async()=> "realtyflow_admin="+await createAdminSession("owner@example.invalid");
const operator=async()=> "realtyflow_admin="+await createAdminSession("operator@example.invalid","WORKSPACE_MEMBER");

test("unsigned, other-brand and malformed IDs are refused before query",async()=>{
 assert.equal((await GET(request(),args)).status,401);
 assert.equal((await GET(request(contactId,await owner()),{params:{brandKey:"zeneco"}})).status,404);
 for(const id of ["../../etc/passwd","not-an-id","11111111-1111-1111-1111-111111111111"]){
  assert.equal((await GET(request(id,await owner()),args)).status,400);
 }
 assert.equal(calls.some(c=>c.name==="from"),false);
});

test("owner gets exact contact with no customer notes, finance or cross-brand data",async()=>{
 const res=await GET(request(contactId,await owner()),args);
 assert.equal(res.status,200);
 assert.equal(res.headers.get("cache-control"),"private, no-store");
 const data=await res.json();
 assert.equal(data.brand,"altovena");
 assert.equal(data.contact.id,contactId);
 assert.equal(data.contact.email,"lead@example.invalid");
 assert.equal(JSON.stringify(data).includes("Private message"),false);
 assert.equal(JSON.stringify(data).includes("Sensitive note"),false);
 assert.equal(JSON.stringify(data).includes("99999"),false);
 assert.deepEqual(calls.filter(c=>c.name==="eq").map(c=>c.args),
  [["brand_id","altovena"],["brand","altovena"],["id",contactId]]);
 const select=String(calls.find(c=>c.name==="select")?.args[0]||"");
 assert.equal(select.includes("*"),false);
 assert.equal(select.includes("notes"),false);
 assert.equal(select.includes("interactions"),false);
});

test("verified Altovena member is scoped; revoked grants never query contacts",async()=>{
 const cookie=await operator();
 assert.equal((await GET(request(contactId,cookie),args)).status,200);
 for(const blocked of ["revoked","permission","identity"]){
  calls.length=0;grantStatus=blocked==="revoked"?"revoked":"active";
  permissions=blocked==="permission"?[]:["crm.read"];
  identityValid=blocked!=="identity";
  assert.equal((await GET(request(contactId,cookie),args)).status,403);
  assert.equal(calls.some(c=>c.name==="from"),false);
 }
});

test("foreign-brand, spam and missing rows fail closed with no customer details",async()=>{
 const cookie=await owner();
 for(const substitute of [
  {...row,brand:"zeneco"},{...row,brand_id:"zeneco"},
  {...row,source:"__SPAM__:altovena"},null,
 ]){
  row=substitute;
  const res=await GET(request(contactId,cookie),args);
  assert.equal(res.status,404);
  assert.equal((await res.json()).contact,undefined);
 }
 dbFailure=true;
 assert.equal((await GET(request(contactId,cookie),args)).status,503);
});

test("ambiguous query parameters cannot bypass exact contact matching",async()=>{
 const cookie=await owner();
 const res=await GET(new NextRequest(
  "https://realtyflow.test/api/workspaces/altovena/lead-contact?contactId="+contactId+"&contactId="+contactId,
  {headers:{cookie}}),args);
 assert.equal(res.status,400);
 assert.equal(calls.some(c=>c.name==="from"),false);
});
