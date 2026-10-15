import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

const urlText = process.env.ALTOVENA_TEST_DATABASE_URL || "";
const url = new URL(urlText);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/altovena_ci_test")
  throw Error("Altovena DB tests require a local isolated CI database");
const client = new pg.Client({connectionString:urlText,connectionTimeoutMillis:5000});
const migration=readFileSync("supabase/migrations/20261014210000_altovena_brand_intake.sql","utf8");
const fixture=readFileSync("scripts/fixtures/altovena-ci-schema.sql","utf8");
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222",
 "33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const receive=(id,name,email,company,message,product="offer")=>
  client.query("select public.altovena_receive_lead($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text) as answer",
    [id,name,email,company,message,product]);
const count=async(table,where="true",args=[])=>{
  const r=await client.query("select count(*)::integer as n from "+table+" where "+where,args);
  return r.rows[0].n;
};
await client.connect();
try {
  // Execute the actual unmodified migration and prove repeat application is safe.
  await client.query(fixture);
  await client.query(migration);
  await client.query(migration);
  assert.equal(await count("core.brands","brand_key='altovena'"),1);
  assert.equal(await count("core.tenants","slug='altovena'"),1);

  const fn="public.altovena_receive_lead(uuid,text,text,text,text,text)";
  const q=await client.query("select has_function_privilege('anon',$1,'EXECUTE') as anon, has_function_privilege('authenticated',$1,'EXECUTE') as authenticated, has_function_privilege('service_role',$1,'EXECUTE') as service_role",[fn]);
  assert.deepEqual(q.rows[0],{anon:false,authenticated:false,service_role:true});

  await client.query("set role service_role");
  const first=(await receive(ids[0],"Canonical Example","shared@example.invalid","Canonical Ltd","Please explain Offer Intelligence.")).rows[0].answer;
  assert.equal(first.ok,true);
  assert.equal(first.accepted,true);
  assert.equal(first.duplicate,false);
  assert.match(first.leadId,/^[a-f\d-]{36}$/);
  assert.match(first.workItemId,/^[a-f\d-]{36}$/);

  const c=(await client.query("select name,company,brand,brand_id,nurture_status,ai_auto_followup,interactions from public.contacts where brand_id='altovena'")).rows;
  assert.equal(c.length,1);
  assert.equal(c[0].name,"Canonical Example");
  assert.equal(c[0].company,"Canonical Ltd");
  assert.equal(c[0].nurture_status,"stopped");
  assert.equal(c[0].ai_auto_followup,false);
  assert.equal(c[0].interactions[0].metadata.marketing_opt_in,false);
  assert.equal(c[0].interactions[0].metadata.identity_verified,false);
  assert.equal(await count("public.contacts","brand_id='zeneco'"),1);
  assert.equal(await count("public.altovena_intake_receipts"),1);
  assert.equal(await count("public.work_items","brand_id='altovena' and source_type='website_lead'"),1);

  const dup=(await receive(ids[0],"Altered Name","other@example.invalid","Other","Should not be recorded")).rows[0].answer;
  assert.equal(dup.duplicate,true);
  assert.equal(dup.leadId,first.leadId);
  assert.equal(dup.workItemId,first.workItemId);
  assert.equal(await count("public.work_items","brand_id='altovena'"),1);

  const second=(await receive(ids[1],"Spoofed Name","shared@example.invalid","Spoofed Ltd","A second question","visibility")).rows[0].answer;
  assert.equal(second.leadId,first.leadId);
  assert.equal(second.duplicate,false);
  const stored=(await client.query("select name,company,interactions,nurture_status from public.contacts where id=$1",[first.leadId])).rows[0];
  assert.equal(stored.name,"Canonical Example");
  assert.equal(stored.company,"Canonical Ltd");
  assert.equal(stored.interactions.length,2);
  assert.equal(stored.interactions[1].metadata.submitted_name,"Spoofed Name");
  assert.equal(stored.nurture_status,"stopped");
  assert.equal(await count("public.work_items","brand_id='altovena'"),2);
  assert.equal(await count("public.altovena_intake_receipts"),2);

  const other=(await client.query("select name,company,brand_id from public.contacts where brand_id='zeneco'")).rows[0];
  assert.deepEqual(other,{name:"Other Brand Example",company:"Other Ltd",brand_id:"zeneco"});

  await assert.rejects(receive(ids[2],"Invalid","invalid@example.invalid","Test","Test","unlisted-product"),/Invalid Altovena enquiry/);
  assert.equal(await count("public.altovena_intake_receipts"),2);

  // Artificial CHECK forces a work-item failure and proves atomic rollback.
  await assert.rejects(receive(ids[3],"REJECT_TASK_","rollback@example.invalid","Rollback Ltd","Test"),/altovena_ci_failure_simulation/);
  assert.equal(await count("public.contacts","email='rollback@example.invalid'"),0);
  assert.equal(await count("public.altovena_intake_receipts","submission_id=$1",[ids[3]]),0);
  assert.equal(await count("public.work_items","brand_id='altovena'"),2);
  console.log("PASS: real Altovena migration idempotent; roles restricted; scoped CRM and tasks; retry safety; consent, identity and transaction rollback verified.");
}finally{await client.end();}
