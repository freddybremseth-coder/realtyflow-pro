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

  const healthFn = "public.altovena_intake_health()";
  const healthPrivileges = await client.query(
    "select has_function_privilege('anon',$1,'EXECUTE') as anon, has_function_privilege('authenticated',$1,'EXECUTE') as authenticated, has_function_privilege('service_role',$1,'EXECUTE') as service_role",
    [healthFn]
  );
  assert.deepEqual(healthPrivileges.rows[0],{anon:false,authenticated:false,service_role:true});

  await client.query("set role service_role");
  const health = (await client.query("select public.altovena_intake_health() as status")).rows[0].status;
  assert.deepEqual(health,{
    schema_version:"altovena-intake-v1",
    brand_present:true,
    receipts_present:true,
    intake_rpc_secured:true,
    task_rpc_secured:true,
  });

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
  // Concurrent submissions are realistic: two tabs or impatient double clicks.
  // Locking by brand/email must yield ONE contact and two separately traceable requests.
  const concurrently=async(submissionId,message)=>{
    const connection=new pg.Client({connectionString:urlText,connectionTimeoutMillis:5000});
    await connection.connect();
    try{
      await connection.query("set role service_role");
      const r=await connection.query(
        "select public.altovena_receive_lead($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text) as answer",
        [submissionId,"Parallel Example","parallel@example.invalid","Parallel Ltd",message,"realtyflow"]
      );
      return r.rows[0].answer;
    }finally{await connection.end();}
  };
  const pair=await Promise.all([
    concurrently("55555555-5555-4555-8555-555555555555","First parallel request"),
    concurrently("66666666-6666-4666-8666-666666666666","Second parallel request"),
  ]);
  assert.equal(pair[0].leadId,pair[1].leadId);
  assert.notEqual(pair[0].workItemId,pair[1].workItemId);
  assert.equal(await count("public.contacts","brand_id='altovena' and email='parallel@example.invalid'"),1);
  assert.equal(await count("public.work_items","brand_id='altovena' and source_id=$1",[pair[0].leadId]),2);
  const race=await Promise.all([
    concurrently("77777777-7777-4777-8777-777777777777","Same ID both clients"),
    concurrently("77777777-7777-4777-8777-777777777777","Same ID both clients"),
  ]);
  assert.equal(race[0].leadId,race[1].leadId);
  assert.equal(race[0].workItemId,race[1].workItemId);
  assert.deepEqual(race.map(r=>r.duplicate).sort(),[false,true]);
  assert.equal(await count("public.work_items","brand_id='altovena' and source_id=$1",[pair[0].leadId]),3);
  // Human follow-up status changes are atomic and audited, and never send messages.
  const acl = await client.query(
    "select has_function_privilege('anon',$1,'EXECUTE') as anon, has_function_privilege('authenticated',$1,'EXECUTE') as authenticated, has_function_privilege('service_role',$1,'EXECUTE') as service_role",
    ["public.altovena_mark_lead_task(uuid,text,text)"],
  );
  assert.deepEqual(acl.rows[0],{anon:false,authenticated:false,service_role:true});
  const change = (taskId,status,actor="andrea@example.invalid") =>
    client.query("select public.altovena_mark_lead_task($1::uuid,$2::text,$3::text) as answer",[taskId,status,actor]);
  const started=(await change(first.workItemId,"IN_PROGRESS")).rows[0].answer;
  assert.deepEqual(started,{ok:true,brand:"altovena",task:{id:first.workItemId,status:"IN_PROGRESS"}});
  const closed=(await change(first.workItemId,"DONE","owner@example.invalid")).rows[0].answer;
  assert.equal(closed.task.status,"DONE");
  const saved=(await client.query("select status,metadata from public.work_items where id=$1",[first.workItemId])).rows[0];
  assert.equal(saved.status,"DONE");
  assert.deepEqual(saved.metadata.status_history.map(event=>event.actor),["andrea@example.invalid","owner@example.invalid"]);
  assert.deepEqual(saved.metadata.status_history.map(event=>event.status),["IN_PROGRESS","DONE"]);
  assert.ok(saved.metadata.status_history.every(event=>Boolean(event.at)));
  assert.ok(saved.metadata.status_history.every(event=>event.source==="verified_altovena_workspace"));
  const again=(await change(first.workItemId,"DONE")).rows[0].answer;
  assert.deepEqual(again,{ok:false,error:"TASK_NOT_FOUND_OR_ALREADY_HANDLED"});
  const foreign=await client.query(
    "insert into public.work_items(title,brand_id,source_type) values ('Foreign brand lead task','zeneco','website_lead') returning id",
  );
  const denied=(await change(foreign.rows[0].id,"IN_PROGRESS")).rows[0].answer;
  assert.equal(denied.ok,false);
  assert.equal((await client.query("select status from public.work_items where id=$1",[foreign.rows[0].id])).rows[0].status,"TO_DO");
  await assert.rejects(change(second.workItemId,"CANCELLED"),/Invalid Altovena task mutation/);

  // A legitimate contact erasure must also erase that person's branded
  // lead tasks and receipt references, without touching a different brand.
  assert.equal(await count("public.altovena_intake_receipts","contact_id=$1",[first.leadId]),2);
  assert.equal(await count("public.work_items","brand_id='altovena' and source_id=$1",[first.leadId]),2);
  const deleted=await client.query(
    "delete from public.contacts where id=$1 and brand_id='altovena' and brand='altovena' returning id",
    [first.leadId],
  );
  assert.equal(deleted.rowCount,1);
  assert.equal(await count("public.altovena_intake_receipts","contact_id=$1",[first.leadId]),0);
  assert.equal(await count("public.work_items","brand_id='altovena' and source_id=$1",[first.leadId]),0);
  assert.equal(await count("public.contacts","id=$1",[first.leadId]),0);
  assert.equal(await count("public.work_items","id=$1",[foreign.rows[0].id]),1);
  assert.equal(await count("public.contacts","brand_id='zeneco'"),1);
  // Clearing an Altovena website task also clears the stale idempotency receipt.
  assert.equal(await count("public.altovena_intake_receipts","contact_id=$1",[pair[0].leadId]),3);
  const removeTask=await client.query(
    "delete from public.work_items where id=$1 and brand_id='altovena' returning id",
    [pair[0].workItemId],
  );
  assert.equal(removeTask.rowCount,1);
  assert.equal(await count("public.altovena_intake_receipts","work_item_id=$1",[pair[0].workItemId]),0);
  assert.equal(await count("public.contacts","id=$1",[pair[0].leadId]),1);
  console.log("PASS: real Altovena SQL migration, role restrictions, brand isolation, atomicity, consent, identity, duplicate/concurrent leads and audited status history and safe contact erasure.");
}finally{await client.end();}
