/**
 * CI ONLY: HTTP -> real Supabase-js RPC request -> disposable PostgreSQL.
 * No network request is sent to RealtyflowPRO or to the Altovena website.
 *
 * Requires ALTOVENA_TEST_DATABASE_URL on local Postgres altovena_ci_test.
 * All fixtures and synthetic enquiries run inside a transaction, rolled back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/public/altovena-leads/route";

const rawUrl=process.env.ALTOVENA_TEST_DATABASE_URL||"";
const parsedUrl=new URL(rawUrl);
if (!["127.0.0.1","localhost"].includes(parsedUrl.hostname)
 || parsedUrl.pathname!=="/altovena_ci_test") {
  throw Error("HTTP-to-SQL smoke test requires isolated local altovena_ci_test database");
}
const db=new pg.Client({connectionString:rawUrl,connectionTimeoutMillis:5000});
const envKeys=["ALTOVENA_INTAKE_ENABLED","ALTOVENA_INTAKE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
const saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
const previousFetch=globalThis.fetch;
const secret="synthetic-altovena-test-only-private-key-2026";
const mockSupabase="https://altovena-ci-project.invalid";
const endpoint="https://realtyflow.test/api/public/altovena-leads";
const submissionId="e37df975-f20d-45e0-a6cf-85eaf50f97ab";
const enquiry={
  brandKey:"altovena",source:"altovena.com/contact",
  requestType:"product-enquiry",submissionId,
  name:"Synthetic Integration",company:"Test Organization",
  email:"integration@example.invalid",
  message:"Please explain the Visibility product and its approval controls.",
  product:"visibility",
  consent:{purpose:"respond_to_request",marketing:false},
  pageUrl:"https://altovena.com/en/contact/",
};

let databaseRpcCalls=0;
let simulateBrokenReceipt=false;
const request=(payload:Record<string,unknown>,key=secret)=>new NextRequest(endpoint,{
  method:"POST",
  headers:{"Content-Type":"application/json","x-altovena-ingest-key":key},
  body:JSON.stringify(payload),
});

await db.connect();
let inTransaction=false;
try {
  await db.query("BEGIN");
  inTransaction=true;
  await db.query(readFileSync("scripts/fixtures/altovena-ci-schema.sql","utf8"));
  await db.query(readFileSync("supabase/migrations/20261014210000_altovena_brand_intake.sql","utf8"));
  await db.query("SET LOCAL ROLE service_role");

  process.env.ALTOVENA_INTAKE_ENABLED="true";
  process.env.ALTOVENA_INTAKE_KEY=secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL=mockSupabase;
  process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-private-key-not-real";

  // Only the PostgREST RPC from the REAL Next.js handler can reach this
  // fake transport. The fake transport runs the REAL SQL function.
  globalThis.fetch=(async(target:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(target);
    assert.equal(url,mockSupabase+"/rest/v1/rpc/altovena_receive_lead");
    assert.equal(String(init?.method).toUpperCase(),"POST");
    assert.equal((init?.headers as Record<string,string>)?.apikey,process.env.SUPABASE_SERVICE_ROLE_KEY);
    databaseRpcCalls++;
    const args=JSON.parse(String(init?.body??"{}"));
    assert.deepEqual(Object.keys(args).sort(),[
      "p_company","p_email","p_message","p_name","p_product","p_submission_id"
    ]);
    await db.query("SAVEPOINT altovena_http_request");
    try {
      const query=await db.query(
        "SELECT public.altovena_receive_lead($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text) AS receipt",
        [args.p_submission_id,args.p_name,args.p_email,args.p_company,args.p_message,args.p_product],
      );
      await db.query("RELEASE SAVEPOINT altovena_http_request");
      const value=simulateBrokenReceipt ?
        {ok:true,accepted:true,leadId:"fake",workItemId:"fake"} :
        query.rows[0].receipt;
      return new Response(JSON.stringify(value),{
        status:200,headers:{"Content-Type":"application/json"},
      });
    } catch(error) {
      await db.query("ROLLBACK TO SAVEPOINT altovena_http_request");
      await db.query("RELEASE SAVEPOINT altovena_http_request");
      return new Response(JSON.stringify({
        code:"23514",message:error instanceof Error ? error.message : "SQL failed",
      }),{status:400,headers:{"Content-Type":"application/json"}});
    }
  }) as typeof fetch;

  const count=async(table:string,where="true")=>{
    const r=await db.query("SELECT count(*)::int AS n FROM "+table+" WHERE "+where);
    return Number(r.rows[0].n);
  };

  // Invalid authentication or another brand must never call the database.
  assert.equal((await POST(request(enquiry,"invalid-key"))).status,401);
  assert.equal((await POST(request({...enquiry,brandKey:"zeneco"}))).status,422);
  assert.equal(databaseRpcCalls,0);

  const first=await POST(request(enquiry));
  assert.equal(first.status,200);
  const receipt=await first.json();
  assert.equal(receipt.accepted,true);
  assert.equal(receipt.duplicate,false);
  assert.match(receipt.leadId,/^[a-f\d-]{36}$/i);
  assert.match(receipt.workItemId,/^[a-f\d-]{36}$/i);

  assert.equal(await count("public.contacts","brand_id='altovena'"),1);
  assert.equal(await count("public.work_items","brand_id='altovena' AND source_type='website_lead'"),1);
  assert.equal(await count("public.altovena_intake_receipts"),1);

  const same=await (await POST(request(enquiry))).json();
  assert.equal(same.accepted,true);
  assert.equal(same.duplicate,true);
  assert.equal(same.leadId,receipt.leadId);
  assert.equal(same.workItemId,receipt.workItemId);
  assert.equal(await count("public.work_items","brand_id='altovena'"),1);

  // This must fail in the REAL SQL routine, then be translated to a
  // non-leaking error by the REAL route, without another contact/task.
  const edited=await POST(request({...enquiry,message:"Changed message with old UUID"}));
  assert.equal(edited.status,503);
  assert.equal((await edited.json()).error,"CRM_WRITE_FAILED");
  assert.equal(await count("public.contacts","brand_id='altovena'"),1);
  assert.equal(await count("public.work_items","brand_id='altovena'"),1);

  simulateBrokenReceipt=true;
  const fabricated=await POST(request({...enquiry,submissionId:"2f5d5037-ddfb-4a35-a86e-364b6ae9f24e"}));
  assert.equal(fabricated.status,503);
  assert.equal((await fabricated.json()).error,"CRM_NOT_CONFIRMED");
  simulateBrokenReceipt=false;
  // The deliberately bad RECEIPT was mocked after a SQL write. A client must
  // not assume successful delivery; this is a contract failure to investigate.
  assert.equal(await count("public.work_items","brand_id='altovena'"),2);

  const contact=await db.query(
    "SELECT name,email,company,nurture_status,ai_auto_followup FROM public.contacts WHERE id=$1",
    [receipt.leadId],
  );
  assert.equal(contact.rows[0].name,enquiry.name);
  assert.equal(contact.rows[0].email,enquiry.email);
  assert.equal(contact.rows[0].nurture_status,"stopped");
  assert.equal(contact.rows[0].ai_auto_followup,false);
  assert.equal(await count("public.contacts","brand_id='zeneco'"),1);

  console.log("PASS: synthetic HTTP -> Supabase RPC -> real PostgreSQL CRM + task, exact retries, conflict rejection, receipt validation, tenant safety");
} finally {
  if(inTransaction) await db.query("ROLLBACK").catch(()=>{});
  await db.end();
  globalThis.fetch=previousFetch;
  for(const key of envKeys) {
    if(saved[key]===undefined)delete process.env[key];
    else process.env[key]=saved[key];
  }
}
