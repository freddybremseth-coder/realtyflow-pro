import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { setAltovenaPreviewClientFactoryForTests } from "@/lib/altovena/supabase";
import { GET } from "../../src/app/api/workspaces/available/route";

const production="ereapsfcsqtdmzosgnnn";
const staging="abcdefghijklmnopqrst";
const staff="staff@example.invalid";
const uid="22222222-2222-4222-8222-222222222222";
const brandId="11111111-1111-4111-8111-111111111111";
const keys=[
 "VERCEL_ENV","REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
 "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED",
 "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "ALTOVENA_STAGING_ISOLATION_ENABLED",
 "ALTOVENA_STAGING_SUPABASE_PROJECT_REF","ALTOVENA_STAGING_SUPABASE_URL",
 "ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY",
];
let previous:Record<string,string|undefined>={};
let active=true,stageCalls:string[]=[],platformCalls:string[]=[];
let stagingPermissions=["crm.read","nexus.read"];
const request=async()=>{
 const cookie=await createAdminSession(staff,"WORKSPACE_MEMBER");
 return new NextRequest("https://realtyflow.test/api/workspaces/available",{
  headers:{cookie:"realtyflow_admin="+cookie},
 });
};
test.beforeEach(()=>{
 previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 active=true;stageCalls=[];platformCalls=[];
 stagingPermissions=["crm.read","nexus.read"];
 process.env.VERCEL_ENV="preview";
 process.env.REALTYFLOW_SESSION_SECRET="isolated-available-brand-list-test";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 process.env.NEXT_PUBLIC_SUPABASE_URL=`https://${production}.supabase.co`;
 process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-platform-key";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF=staging;
 process.env.ALTOVENA_STAGING_SUPABASE_URL=`https://${staging}.supabase.co`;
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="synthetic-staging-key";
 setPlatformSupabaseFactoryForTests(()=>({
  rpc:async(method:string)=>{
   platformCalls.push(method);
   if(method!=="workspace_user_brand_grants")throw Error("unexpected platform RPC");
   return {data:[
    {brand:{id:"pinoso-id",brand_key:"pinosoecolife",display_name:"Pinoso EcoLife"},
     grant:{brand_id:"pinoso-id",user_id:uid,email:staff,status:"active",
      permissions:["content.read"]}},
    {brand:{id:"prod-altovena",brand_key:"altovena",display_name:"PRODUCTION ALTOVENA"},
     grant:{brand_id:"prod-altovena",user_id:uid,email:staff,status:"active",
      permissions:["crm.read","crm.write"]}},
   ],error:null};
  },
  auth:{admin:{getUserById:async()=>({data:{user:{id:uid,email:staff}},error:null})}},
 } as unknown as SupabaseClient));
 setAltovenaPreviewClientFactoryForTests(()=>({
  rpc:async(method:string)=>{
   stageCalls.push(method);
   assert.equal(method,"workspace_brand_grant");
   return {data:{brand:{id:brandId,brand_key:"altovena"},
    grant:{brand_id:brandId,user_id:uid,email:staff,
      status:active?"active":"revoked",
      permissions:stagingPermissions}},error:null};
  },
  auth:{admin:{getUserById:async()=>{
   stageCalls.push("staging-auth");
   return {data:{user:{id:uid,email:staff}},error:null};
  }}},
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setPlatformSupabaseFactoryForTests(null);
 setAltovenaPreviewClientFactoryForTests(null);
 for(const [k,v] of Object.entries(previous))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});

test("staging Altovena is listed only after independent verified Auth/grant",async()=>{
 const res=await GET(await request());
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.workspaces.length,2);
 assert.deepEqual(body.workspaces.map((w:{brandKey:string})=>w.brandKey),
  ["pinosoecolife","altovena"]);
 const item=body.workspaces.find((w:{brandKey:string})=>w.brandKey==="altovena");
 assert.deepEqual(item.permissions,["crm.read","nexus.read"]);
 assert.equal(item.name,"Altovena · testmiljø");
 assert.equal(JSON.stringify(body).includes("PRODUCTION ALTOVENA"),false);
 assert.deepEqual(stageCalls,["workspace_brand_grant","staging-auth"]);
 assert.deepEqual(platformCalls,["workspace_user_brand_grants"]);
});
test("staging revocation hides Altovena instead of reverting to production grant",async()=>{
 active=false;
 const res=await GET(await request());
 assert.equal(res.status,200);
 const body=await res.json();
 assert.deepEqual(body.workspaces.map((w:{brandKey:string})=>w.brandKey),
  ["pinosoecolife"]);
 assert.equal(JSON.stringify(body).includes("PRODUCTION ALTOVENA"),false);
});
test("missing staging config hides Altovena even if production has a live grant",async()=>{
 delete process.env.ALTOVENA_STAGING_SUPABASE_URL;
 const res=await GET(await request());
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).workspaces.map((w:{brandKey:string})=>w.brandKey),
  ["pinosoecolife"]);
 assert.deepEqual(stageCalls,[]);
});
test("incomplete staging publish and email grants are never advertised",async()=>{
 stagingPermissions=["crm.read","marketing.publish","email.send",
  "content.publish","ads.draft","visibility.plan"];
 const res=await GET(await request());
 assert.equal(res.status,200);
 const body=await res.json();
 const staged=body.workspaces.find((w:{brandKey:string})=>w.brandKey==="altovena");
 assert.deepEqual(staged.permissions,["crm.read"]);
 assert.equal(JSON.stringify(staged).includes("marketing.publish"),false);
 assert.equal(JSON.stringify(staged).includes("email.send"),false);
});
test("production brand selection is not changed by Altovena preview isolation",async()=>{
 process.env.VERCEL_ENV="production";
 const res=await GET(await request());
 assert.equal(res.status,200);
 const body=await res.json();
 assert.deepEqual(body.workspaces.map((w:{brandKey:string})=>w.brandKey),
  ["pinosoecolife","altovena"]);
 assert.equal(stageCalls.length,0);
});
