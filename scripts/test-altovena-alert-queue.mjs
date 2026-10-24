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
 const heartbeat=(await db.query("select brand_key,queued_count,resolved_count,pending_count,last_scan_at from public.altovena_alert_scan_state")).rows[0];
 assert.equal(heartbeat.brand_key,"altovena");
 // The heartbeat describes the MOST RECENT scan. The second, idempotent
 // scan created no new alerts but still sees all three open.
 assert.deepEqual([heartbeat.queued_count,heartbeat.resolved_count,heartbeat.pending_count],[0,0,3]);
 assert.equal(Number.isFinite(new Date(heartbeat.last_scan_at).getTime()),true);
 const scanAcl=await db.query("select has_table_privilege('anon','public.altovena_alert_scan_state','SELECT') as anon");
 assert.equal(scanAcl.rows[0].anon,false);

 // The in-app inbox is service-role-only. These are synthetic per-operator HMAC
 // keys, never customer emails and never a real production account.
 const inboxACL=await db.query(`select
   has_function_privilege('anon','public.altovena_operator_alert_inbox(text,integer)','EXECUTE') as read_anon,
   has_function_privilege('authenticated','public.altovena_ack_operator_alert(uuid,text)','EXECUTE') as ack_auth,
   has_function_privilege('service_role','public.altovena_operator_alert_inbox(text,integer)','EXECUTE') as read_service,
   has_table_privilege('anon','public.altovena_alert_reads','SELECT') as table_anon`);
 assert.deepEqual(inboxACL.rows[0],{
   read_anon:false,ack_auth:false,read_service:true,table_anon:false,
 });
 const operatorA="a".repeat(64), operatorB="b".repeat(64);
 const inbox=async key=>(await db.query(
   "select public.altovena_operator_alert_inbox($1::text,20) as response",[key]
 )).rows[0].response;
 const ack=async(id,key)=>(await db.query(
   "select public.altovena_ack_operator_alert($1::uuid,$2::text) as response",[id,key]
 )).rows[0].response;
 const a0=await inbox(operatorA),b0=await inbox(operatorB);
 assert.equal(a0.brand,"altovena");
 assert.equal(a0.emailSent,false);
 assert.equal(a0.externalDelivery,false);
 assert.equal(a0.totalPending,3);
 assert.equal(a0.unreadTotal,3);
 assert.equal(a0.alerts.length,3);
 assert.equal(a0.alerts[0].kind,"NOT_STARTED_24H","high severity appears first");
 assert.equal(b0.unreadTotal,3);
 assert.deepEqual(a0.alerts.map(x=>x.id),b0.alerts.map(x=>x.id));
 assert.equal(JSON.stringify(a0).includes("example.invalid"),false);
 const alertId=a0.alerts.find(x=>x.contactId===first.leadId)?.id;
 assert.ok(alertId,"select a receipt that belongs to the contact erased below");
 const seen=await ack(alertId,operatorA);
 assert.equal(seen.ok,true);
 assert.equal(seen.id,alertId);
 assert.equal(seen.externalDelivery,false);
 const againSeen=await ack(alertId,operatorA);
 assert.equal(againSeen.readAt,seen.readAt,"duplicate click keeps first read time");
 const a1=await inbox(operatorA),b1=await inbox(operatorB);
 assert.equal(a1.unreadTotal,2);
 assert.equal(a1.alerts.at(-1)?.id,alertId,"read alert moves behind unread alerts");
 const topAfterRead=(await db.query(
   "select public.altovena_operator_alert_inbox($1::text,1) as response",
   [operatorA])).rows[0].response;
 assert.equal(topAfterRead.alerts.length,1);
 assert.notEqual(topAfterRead.alerts[0].id,alertId,
   "capped inbox must surface unread alerts instead of an already read alert");
 assert.equal(b1.unreadTotal,3,"employee B receipt independent of A");
 assert.equal(a1.totalPending,3);
 assert.equal(await count("state='PENDING'"),3,"read receipt does not resolve lead");
 const foreignAck=await ack(foreign.rows[0].id,operatorA);
 assert.equal(foreignAck.ok,false);
 assert.equal((await db.query("select count(*)::int as n from public.altovena_alert_reads")).rows[0].n,1);

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
 assert.equal((await db.query("select count(*)::int as n from public.altovena_alert_reads")).rows[0].n,0,
   "contact erasure cascades the operator receipt via alert task");
 assert.equal((await db.query("select count(*)::int as n from public.work_items where id=$1",
  [foreign.rows[0].id])).rows[0].n,1);
 console.log("PASS altovena durable alert outbox: exact 15m/24h/48h, idempotency, grant isolation, resolution, erasure; no outbound delivery");
} finally {
 await db.query("ROLLBACK").catch(()=>{});
 await db.end();
}
