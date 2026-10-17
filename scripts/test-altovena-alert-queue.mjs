import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

// Run only in the disposable GitHub Actions Postgres, no cloud credentials.
const url=new URL(process.env.ALTOVENA_TEST_DATABASE_URL || "");
if (!["127.0.0.1","localhost"].includes(url.hostname) ||
    url.pathname!=="/altovena_ci_test")
  throw Error("Alert queue tests require isolated local PostgreSQL database");
const db=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
const file=(path)=>readFileSync(path,"utf8");
const firstId="a0a0a0a0-0000-4000-8000-000000000001";
const secondId="a0a0a0a0-0000-4000-8000-000000000002";
async function scan(){
 const r=await db.query("select public.altovena_reconcile_lead_alerts() as result");
 return r.rows[0].result;
}
async function count(where="true",parameters=[]){
 const r=await db.query("select count(*)::int as n from public.altovena_lead_alerts where "+where,parameters);
 return r.rows[0].n;
}
await db.connect();
try {
 await db.query("BEGIN");
 await db.query(file("scripts/fixtures/altovena-ci-schema.sql"));
 await db.query(file("supabase/migrations/20261014210000_altovena_brand_intake.sql"));
 const migration=file("supabase/migrations/20261017212000_altovena_lead_alert_queue.sql");
 await db.query(migration);
 await db.query(migration); // additive and idempotent

 const acl=await db.query(`select
   has_function_privilege('anon','public.altovena_reconcile_lead_alerts()','EXECUTE') as anon,
   has_function_privilege('authenticated','public.altovena_reconcile_lead_alerts()','EXECUTE') as authenticated,
   has_function_privilege('service_role','public.altovena_reconcile_lead_alerts()','EXECUTE') as service_role,
   has_table_privilege('anon','public.altovena_lead_alerts','SELECT') as anon_select`);
 assert.deepEqual(acl.rows[0],{anon:false,authenticated:false,service_role:true,anon_select:false});
 await db.query("SET LOCAL ROLE service_role");

 const receive=async (id,name,email)=>{
   const result=await db.query(
     "select public.altovena_receive_lead($1::uuid,$2,$3,$4,$5,$6) as result",
     [id,name,email,"Synthetic Co","Synthetic test enquiry","visibility"]
   );
   return result.rows[0].result;
 };
 const first=await receive(firstId,"Old inquiry","old@example.invalid");
 const second=await receive(secondId,"New inquiry","new@example.invalid");
 await db.query("update public.work_items set created_at=now()-interval '26 hours' where id=$1",[first.workItemId]);
 await db.query("update public.work_items set created_at=now()-interval '30 minutes' where id=$1",[second.workItemId]);
 const foreign=await db.query(
   "insert into public.work_items(title,brand_id,source_type,created_at) values('Different brand task','zeneco','website_lead',now()-interval '5 days') returning id"
 );
 const firstScan=await scan();
 assert.deepEqual(firstScan,{
   ok:true,brand:"altovena",queued:3,resolved:0,pending:3,deliveryEnabled:false
 });
 assert.equal(await count(),3);
 assert.equal(await count("work_item_id=$1",[foreign.rows[0].id]),0);
 assert.equal((await scan()).queued,0,"cron reruns are idempotent");
 assert.equal(await count("kind='NOT_STARTED_24H'"),1);
 assert.equal(await count("kind='NOT_STARTED_15M'"),2);
 assert.equal(await count("state='PENDING'"),3);

 // Human transitions cause alert resolution, not an outbound notification.
 await db.query("select public.altovena_mark_lead_task($1::uuid,'IN_PROGRESS','owner@example.invalid')",
   [first.workItemId]);
 await db.query("select public.altovena_mark_lead_task($1::uuid,'DONE','member@example.invalid')",
   [second.workItemId]);
 const resolved=await scan();
 assert.equal(resolved.queued,0);
 assert.equal(resolved.resolved,3);
 assert.equal(resolved.pending,0);
 assert.equal(await count("state='RESOLVED'"),3);

 // Long-unresolved in-progress work gets a separate operational alert.
 await db.query("update public.work_items set updated_at=now()-interval '49 hours' where id=$1",
  [first.workItemId]);
 const stalled=await scan();
 assert.equal(stalled.queued,1);
 assert.equal(stalled.pending,1);
 assert.equal(await count("kind='IN_PROGRESS_48H' and state='PENDING'"),1);
 assert.equal((await scan()).queued,0);

 // Right-to-erasure should cascade alert task references and never touch another brand.
 await db.query("delete from public.contacts where id=$1 and brand_id='altovena'",[first.leadId]);
 assert.equal(await count("work_item_id=$1",[first.workItemId]),0);
 assert.equal(await count("work_item_id=$1",[second.workItemId]),1);
 assert.equal((await db.query("select count(*)::int as n from public.work_items where id=$1",
  [foreign.rows[0].id])).rows[0].n,1);
 console.log("PASS altovena durable alert outbox: exact 15m/24h/48h, idempotency, grant isolation, resolution, erasure; no outbound delivery");
} finally {
 await db.query("ROLLBACK").catch(()=>{});
 await db.end();
}
