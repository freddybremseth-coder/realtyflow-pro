import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSession } from "@/lib/admin-auth";
import { setAltovenaPreviewClientFactoryForTests } from "@/lib/altovena/supabase";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "../../src/app/api/workspaces/[brandKey]/capabilities/route";

const productionRef="ereapsfcsqtdmzosgnnn";
const stagingRef="abcdefghijklmnopqrst";
const stageBrandId="11111111-1111-4111-8111-111111111111";
const stageUserId="22222222-2222-4222-8222-222222222222";
const envKeys=[
 "VERCEL_ENV","REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
 "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED","ALTOVENA_STAGING_ISOLATION_ENABLED",
 "ALTOVENA_STAGING_SUPABASE_PROJECT_REF","ALTOVENA_STAGING_SUPABASE_URL",
 "ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY",
 "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
];
let previous:Record<string,string|undefined>={};
let platformCalls=0,stageCalls:string[]=[];
let staffActive=true;
const request=async(brandKey:string,role:"OWNER"|"WORKSPACE_MEMBER"="OWNER")=>{
 const email=role==="OWNER"?"owner@example.invalid":"staff@example.invalid";
 const session=await createAdminSession(email,role);
 return new NextRequest(`https://realtyflow.test/api/workspaces/${brandKey}/capabilities`,{
  headers:{cookie:"realtyflow_admin="+session},
 });
};

test.beforeEach(()=>{
 previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 platformCalls=0;stageCalls=[];staffActive=true;
 process.env.VERCEL_ENV="preview";
 process.env.REALTYFLOW_SESSION_SECRET="offline-capabilities-isolation-session-key";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 process.env.NEXT_PUBLIC_SUPABASE_URL=`https://${productionRef}.supabase.co`;
 process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-platform-production-key-never-real";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF=stagingRef;
 process.env.ALTOVENA_STAGING_SUPABASE_URL=`https://${stagingRef}.supabase.co`;
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="synthetic-staging-key-never-real";
 setPlatformSupabaseFactoryForTests(()=>{
  platformCalls++;
  throw Error("ALTOVENA_CAPABILITIES_MUST_NOT_USE_PRODUCTION");
 });
 setAltovenaPreviewClientFactoryForTests(()=>({
  rpc:async(name:string)=>{
   stageCalls.push(name);
   if(name==="workspace_brand_grant")return {
    data:{brand:{id:stageBrandId,brand_key:"altovena"},
     grant:{brand_id:stageBrandId,user_id:stageUserId,email:"staff@example.invalid",
       status:staffActive?"active":"revoked",
       permissions:["crm.read","crm.write","nexus.read"]}},
    error:null,
   };
   if(name==="workspace_user_admin_snapshot")return {
    data:{brands:[{id:stageBrandId,brand_key:"altovena"}],
      users:[{user_id:stageUserId,email:"staff@example.invalid",status:"active",
        memberships:[{brand_id:stageBrandId,status:"active",permissions:["crm.read"],
          responsibilities:[]}]}]},
    error:null,
   };
   throw Error("Unexpected Altovena staging RPC: "+name);
  },
  auth:{admin:{getUserById:async(id:string)=>{
   stageCalls.push("auth:"+id);
   return {data:{user:{id:stageUserId,email:"staff@example.invalid"}},error:null};
  }}},
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setAltovenaPreviewClientFactoryForTests(null);
 setPlatformSupabaseFactoryForTests(null);
 for(const [k,v] of Object.entries(previous))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});

test("first Altovena workspace capabilities request only queries staging",async()=>{
 const res=await GET(await request("altovena"),{params:{brandKey:"altovena"}});
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.brand,"altovena");
 assert.ok(body.permissions.includes("crm.read"));
 assert.deepEqual(stageCalls,["workspace_brand_grant"]);
 assert.equal(platformCalls,0);
});

test("staff capabilities and current Auth grant are verified in staging only",async()=>{
 const res=await GET(await request("altovena","WORKSPACE_MEMBER"),
  {params:{brandKey:"altovena"}});
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.brand,"altovena");
 assert.ok(body.permissions.includes("crm.read"));
 assert.ok(body.permissions.includes("nexus.read"));
 assert.ok(stageCalls.includes("workspace_user_admin_snapshot"));
 assert.ok(stageCalls.includes("auth:"+stageUserId));
 assert.equal(platformCalls,0);
});

test("revoked staging staff cannot recover permissions from production",async()=>{
 staffActive=false;
 const res=await GET(await request("altovena","WORKSPACE_MEMBER"),
  {params:{brandKey:"altovena"}});
 assert.equal(res.status,403);
 assert.equal(platformCalls,0);
});

test("missing staging config fails closed before any platform or staging RPC",async()=>{
 delete process.env.ALTOVENA_STAGING_SUPABASE_URL;
 const res=await GET(await request("altovena"),{params:{brandKey:"altovena"}});
 assert.equal(res.status,503);
 assert.deepEqual((await res.json()).error,{code:"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED"});
 assert.equal(platformCalls,0);
 assert.deepEqual(stageCalls,[]);
});
test("non-Altovena brand is NOT redirected to staging",async()=>{
 setPlatformSupabaseFactoryForTests(()=>{
  platformCalls++;
  return {rpc:async(name:string)=>({
    data:{brand:{id:"other",brand_key:"pinosoecolife"},grant:null},
    error:null,
  })} as unknown as SupabaseClient;
 });
 const res=await GET(await request("pinosoecolife"),
  {params:{brandKey:"pinosoecolife"}});
 assert.equal(res.status,200);
 assert.equal(platformCalls,1);
 assert.equal(stageCalls.length,0);
});
