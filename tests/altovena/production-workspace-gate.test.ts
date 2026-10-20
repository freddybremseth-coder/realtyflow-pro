import test from "node:test";
import assert from "node:assert/strict";
import {allowAltovenaProductionWorkspace} from "../../src/lib/altovena/production-workspace-gate";
import {NextRequest} from "next/server";
import {GET as capabilities} from "../../src/app/api/workspaces/[brandKey]/capabilities/route";
import {setPlatformSupabaseFactoryForTests} from "../../src/lib/platform/supabase";
import type {SupabaseClient} from "@supabase/supabase-js";

test("production Altovena remains off unless separately and exactly approved",()=>{
 assert.equal(allowAltovenaProductionWorkspace({VERCEL_ENV:"production"}),false);
 assert.equal(allowAltovenaProductionWorkspace({VERCEL_ENV:"production",ALTOVENA_PRODUCTION_WORKSPACE_ENABLED:"TRUE"}),false);
 assert.equal(allowAltovenaProductionWorkspace({VERCEL_ENV:"production",ALTOVENA_PRODUCTION_WORKSPACE_ENABLED:"true"}),true);
 assert.equal(allowAltovenaProductionWorkspace({VERCEL_ENV:"preview"}),true);
});
test("production Altovena capability blocks before any production database/Auth query",async()=>{
 const old={env:process.env.VERCEL_ENV,flag:process.env.ALTOVENA_PRODUCTION_WORKSPACE_ENABLED};
 let queries=0;
 try {
  process.env.VERCEL_ENV="production";
  delete process.env.ALTOVENA_PRODUCTION_WORKSPACE_ENABLED;
  setPlatformSupabaseFactoryForTests(()=>{
   queries++;
   throw Error("Altovena workspace tried to read production DB before approval");
  });
  const request=new NextRequest("https://realtyflow.test/api/workspaces/altovena/capabilities");
  const denied=await capabilities(request,{params:{brandKey:"altovena"}});
  assert.equal(denied.status,503);
  assert.equal((await denied.json()).error.code,"ALTOVENA_PRODUCTION_WORKSPACE_DISABLED");
  assert.equal(queries,0);
 }finally{
  setPlatformSupabaseFactoryForTests(null);
  for(const [key,value] of [["VERCEL_ENV",old.env],["ALTOVENA_PRODUCTION_WORKSPACE_ENABLED",old.flag]] as const){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
