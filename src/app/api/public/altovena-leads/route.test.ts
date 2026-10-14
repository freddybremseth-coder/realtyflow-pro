import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

test("Altovena endpoint rejects invalid callers and confirms an isolated CRM+task receipt", async () => {
  const keys=["ALTOVENA_INTAKE_ENABLED","ALTOVENA_INTAKE_KEY","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
  const originals=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  const secret="test-only-altovena-bridge-key-please-never-reuse";
  process.env.ALTOVENA_INTAKE_ENABLED="true";
  process.env.ALTOVENA_INTAKE_KEY=secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://altovena-mock-supabase.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-role-key";
  const submissionId="f6dab1fb-efde-4582-a54f-950a21464703";
  const payload={
    brandKey:"altovena",source:"altovena.com/contact",requestType:"product-enquiry",
    submissionId,name:"Demo Example",email:"example@example.invalid",
    company:"Example Ltd",message:"Please discuss a workflow.",product:"visibility",
    consent:{purpose:"respond_to_request",marketing:false},
    pageUrl:"https://altovena.com/en/book-demo/",
  };
  const make=(data: Record<string,unknown>,key=secret)=>
    new NextRequest("https://realtyflow.chatgenius.pro/api/public/altovena-leads",{
      method:"POST",headers:{"content-type":"application/json","x-altovena-ingest-key":key},
      body:JSON.stringify(data),
    });
  const calls: Array<{url:string;body:unknown}>=[];
  globalThis.fetch=(async(url:RequestInfo|URL,options?:RequestInit)=>{
    calls.push({url:String(url),body:JSON.parse(String(options?.body||"{}"))});
    return new Response(JSON.stringify({
      ok:true,accepted:true,leadId:"11111111-1111-4111-8111-111111111111",
      workItemId:"22222222-2222-4222-8222-222222222222",
      duplicate:false,
    }),{status:200,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  try{
    const blocked=await POST(make(payload,"wrong-key"));
    assert.equal(blocked.status,401);
    assert.equal(calls.length,0);

    const wrongBrand=await POST(make({...payload,brandKey:"zeneco"}));
    assert.equal(wrongBrand.status,422);
    assert.equal(calls.length,0);

    const invalidId=await POST(make({...payload,submissionId:"not-uuid"}));
    assert.equal(invalidId.status,422);
    assert.equal(calls.length,0);

    const newsletter=await POST(make({...payload,consent:{purpose:"respond_to_request",marketing:true}}));
    assert.equal(newsletter.status,422);
    assert.equal(calls.length,0);

    const ok=await POST(make(payload));
    assert.equal(ok.status,200);
    const result=await ok.json();
    assert.equal(result.ok,true);
    assert.equal(result.accepted,true);
    assert.equal(result.workItemId,"22222222-2222-4222-8222-222222222222");
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/\/rest\/v1\/rpc\/altovena_receive_lead$/);
    assert.equal((calls[0].body as Record<string,unknown>).p_submission_id,submissionId);

    const get=GET();
    assert.equal(get.status,405);
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of keys){if(originals[key]===undefined)delete process.env[key];else process.env[key]=originals[key];}
  }
});
