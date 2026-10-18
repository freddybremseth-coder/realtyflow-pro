import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";

const url=new URL(process.env.ALTOVENA_TEST_DATABASE_URL || "");
if(!["127.0.0.1","localhost"].includes(url.hostname) ||
   url.pathname!=="/altovena_ci_test")throw Error("Disposable local PostgreSQL only");
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
const read=p=>readFileSync(p,"utf8");
const operatorA="a".repeat(64),operatorB="b".repeat(64);
const prepare=async(key)=> (await client.query(
 "select public.altovena_prepare_operator_delivery($1::text,20) as value",[key]
)).rows[0].value;
const total=async(where="true",params=[])=>Number((await client.query(
 "select count(*)::int as total from public.altovena_delivery_candidates where "+where,params
)).rows[0].total);

await client.connect();
try{
 await client.query("BEGIN");
 await client.query(read("scripts/fixtures/altovena-ci-schema.sql"));
 await client.query(read("supabase/migrations/20261014210000_altovena_brand_intake.sql"));
 await client.query(read("supabase/migrations/20261017212000_altovena_lead_alert_queue.sql"));
 const migration=read("supabase/migrations/20261018094500_altovena_delivery_preflight.sql");
 await client.query(migration);
 await client.query(migration);
 const access=(await client.query(`select
   has_table_privilege('anon','public.altovena_delivery_candidates','SELECT') as anon_read,
   has_table_privilege('authenticated','public.altovena_delivery_candidates','INSERT') as auth_insert,
   has_function_privilege('anon','public.altovena_prepare_operator_delivery(text,integer)','EXECUTE') as anon_rpc,
   has_function_privilege('service_role','public.altovena_prepare_operator_delivery(text,integer)','EXECUTE') as service_rpc`)).rows[0];
 assert.deepEqual(access,{anon_read:false,auth_insert:false,anon_rpc:false,service_rpc:true});
 await client.query("SET LOCAL ROLE service_role");

 const addTask=async(brand,status,sourceType,oldHours,updateHours=oldHours)=>{
   const w=(await client.query(`insert into public.work_items
    (title,brand_id,source_type,status,created_at,updated_at)
    values ('Synthetic alert only',$1,$2,$3,now()-($4::int * interval '1 hour'),
            now()-($5::int * interval '1 hour'))
    returning id`,[brand,sourceType,status,oldHours,updateHours])).rows[0];
   return w.id;
 };
 const overdue=await addTask("altovena","TO_DO","website_lead",26);
 const stalled=await addTask("altovena","IN_PROGRESS","website_lead",52,49);
 const recent=await addTask("altovena","TO_DO","website_lead",1);
 const other=await addTask("zeneco","TO_DO","website_lead",72);
 const wrongSource=await addTask("altovena","TO_DO","crm",72);
 const addAlert=async (workId,kind)=> (await client.query(
   "insert into public.altovena_lead_alerts(work_item_id,kind) values($1,$2) returning id",
   [workId,kind])).rows[0].id;
 const a=await addAlert(overdue,"NOT_STARTED_24H");
 const b=await addAlert(stalled,"IN_PROGRESS_48H");
 await addAlert(recent,"NOT_STARTED_15M");
 await addAlert(other,"NOT_STARTED_24H");
 await addAlert(wrongSource,"NOT_STARTED_24H");
 assert.deepEqual(await prepare(operatorA),{
   ok:true,brand:"altovena",newCandidates:2,cancelledCandidates:0,
   preparedTotal:2,deliveryAttempted:false,emailSent:false,
 });
 assert.equal((await prepare(operatorA)).newCandidates,0,"repeat is idempotent");
 assert.equal((await prepare(operatorB)).newCandidates,2,"separate operator candidate");
 assert.equal(await total(),4);
 assert.equal(await total("alert_id=$1",[a]),2);
 assert.equal(await total("alert_id=$1",[b]),2);
 assert.equal(await total("state='PREPARED'"),4);
 assert.equal(await total("state='CANCELLED'"),0);
 const status= (await client.query(
   "select public.altovena_operator_delivery_preflight($1) as result",[operatorA]
 )).rows[0].result;
 assert.deepEqual(status,{ok:true,brand:"altovena",prepared:2,cancelled:0,
  deliveryAttempted:false,emailSent:false});
 // A completed lead must never remain available for a future provider send.
 await client.query("update public.work_items set status='DONE' where id=$1",[overdue]);
 const after=await prepare(operatorA);
 assert.equal(after.cancelledCandidates,1);
 assert.equal(after.preparedTotal,1);
 assert.equal((await prepare(operatorA)).newCandidates,0,
   "previously cancelled candidate is never resurrected");
 assert.equal((await prepare(operatorB)).cancelledCandidates,1);
 assert.equal(await total("state='CANCELLED'"),2);
 // FK cascade applies to both operators on a legitimate task erasure.
 await client.query("delete from public.work_items where id=$1",[stalled]);
 assert.equal(await total(),2);
 assert.equal(await total("state='PREPARED'"),0);
 assert.equal(await total("state='CANCELLED'"),2);
 await assert.rejects(client.query(
   "select public.altovena_prepare_operator_delivery($1,20)",["x".repeat(64)]
 ),/Invalid Altovena delivery preparation/);
 console.log("PASS altovena delivery PREPARED/CANCELLED ledger; role ACL, filtering, idempotency, operator isolation, status cancellation and FK erasure. NO external send.");
}finally{await client.query("ROLLBACK").catch(()=>{});await client.end();}
