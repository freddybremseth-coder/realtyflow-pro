import assert from "node:assert/strict";
import {it} from "node:test";
import {createAdminSession} from "@/lib/admin-auth";
import {NextRequest} from "next/server";
import {GET,POST} from "./route";

const endpoint="https://realtyflow.test/api/visibility/ai-search-samples";
function req(method:"GET"|"POST",cookie?:string,body?:unknown,origin="https://realtyflow.test"){
 return new NextRequest(endpoint,{
  method,headers:{...(cookie?{cookie}:{}) , ...(method==="POST"?{"content-type":"application/json",origin}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
 });
}
const confirmed={brandId:"zeneco",promptId:"en-altea",confirmRun:true};
it("rejects unauthenticated reads and writes before contacting services",async()=>{
 assert.equal((await GET(req("GET"))).status,403);
 assert.equal((await POST(req("POST",undefined,confirmed))).status,403);
});
it("exposes disabled status without charging provider and rejects invalid owner submissions",async()=>{
 const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
   "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
   "ALTOVENA_OPENAI_SAMPLING_ENABLED","ALTOVENA_OPENAI_API_KEY","ALTOVENA_OPENAI_MODEL"] as const;
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const oldFetch=globalThis.fetch;
 let providerCalls=0;
 try{
  process.env.REALTYFLOW_SESSION_SECRET="visibility-synthetic-test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS="visibility-owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://visibility-sample-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="visibility-synthetic-service-key";
  process.env.ALTOVENA_OPENAI_SAMPLING_ENABLED="false";
  process.env.ALTOVENA_OPENAI_API_KEY="synthetic-api-key";
  process.env.ALTOVENA_OPENAI_MODEL="test-model";
  globalThis.fetch=(async()=>{providerCalls++;return new Response("[]",{status:200,headers:{"content-type":"application/json"}})}) as typeof fetch;
  const cookie="realtyflow_admin="+await createAdminSession("visibility-owner@example.test");
  assert.equal((await POST(req("POST",cookie,confirmed,"https://evil.test"))).status,403);
  assert.equal((await POST(req("POST",cookie,{...confirmed,promptId:"unknown"}))).status,400);
  assert.equal((await POST(req("POST",cookie,confirmed))).status,503);
  assert.equal(providerCalls,0);
 }finally{
  globalThis.fetch=oldFetch;
  for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
 }
});
it("reserves at most one paid provider request per UTC day and persists cited evidence separately",async()=>{
 const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
   "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
   "ALTOVENA_OPENAI_SAMPLING_ENABLED","ALTOVENA_OPENAI_API_KEY","ALTOVENA_OPENAI_MODEL"] as const;
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const oldFetch=globalThis.fetch;
 let reserved=false, providerCalls=0, saved=false;
 try{
  process.env.REALTYFLOW_SESSION_SECRET="visibility-synthetic-test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS="visibility-owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://visibility-sample-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="visibility-synthetic-service-key";
  process.env.ALTOVENA_OPENAI_SAMPLING_ENABLED="true";
  process.env.ALTOVENA_OPENAI_API_KEY="synthetic-api-key";
  process.env.ALTOVENA_OPENAI_MODEL="test-model";
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
   if(url==="https://api.openai.com/v1/responses"){
    providerCalls++;
    const payload=JSON.parse(String(init?.body));
    assert.equal(payload.store,false);
    return new Response(JSON.stringify({
     id:"resp_sample_test",status:"completed",model:"test-model",output:[
      {type:"web_search_call",action:{type:"search",sources:[{type:"url",url:"https://www.zenecohomes.com/guide"}]}},
      {type:"message",content:[{type:"output_text",text:"Zen Eco Homes guide.",
       annotations:[{type:"url_citation",url:"https://www.zenecohomes.com/guide"}]}]},
     ],
    }),{status:200,headers:{"content-type":"application/json"}});
   }
   assert.match(url,/^https:\/\/visibility-sample-test\.invalid\/rest\/v1\/visibility_ai_provider_sample_runs/);
   const method=String(init?.method||"GET").toUpperCase();
   if(method==="POST"){
    const row=JSON.parse(String(init?.body));
    assert.equal(row.brand_id,"zeneco");
    assert.equal(row.provider,"openai_api_web_search");
    assert.equal(row.status,"RESERVED");
    if(reserved)return new Response(JSON.stringify({code:"23505",message:"duplicate key"}),{status:409,headers:{"content-type":"application/json"}});
    reserved=true;
    return new Response(JSON.stringify({id:"00000000-0000-4000-8000-000000000008"}),{status:201,headers:{"content-type":"application/json"}});
   }
   if(method==="PATCH"){
    const row=JSON.parse(String(init?.body));
    assert.equal(row.status,"COMPLETED");
    assert.equal(row.provider_response_id,"resp_sample_test");
    assert.deepEqual(row.cited_urls,["https://www.zenecohomes.com/guide"]);
    saved=true;
    return new Response(null,{status:204});
   }
   if(method==="GET")return new Response("[]",{status:200,headers:{"content-type":"application/json"}});
   throw new Error("Unexpected method "+method);
  }) as typeof fetch;
  const cookie="realtyflow_admin="+await createAdminSession("visibility-owner@example.test");
  const first=await POST(req("POST",cookie,confirmed));
  assert.equal(first.status,201,JSON.stringify(await first.clone().json()));
  const item=await first.json();
  assert.equal(item.consumerChatGPTSearchEquivalent,false);
  assert.equal(item.kind,"OPENAI_API_WEB_SEARCH_SAMPLE");
  assert.equal(saved,true);
  assert.equal(providerCalls,1);
  const second=await POST(req("POST",cookie,confirmed));
  assert.equal(second.status,409);
  assert.equal(providerCalls,1,"Duplicate daily requests must not incur extra provider charges");
 } finally{
  globalThis.fetch=oldFetch;
  for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
 }
});
