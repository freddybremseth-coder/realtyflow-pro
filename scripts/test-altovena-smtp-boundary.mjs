import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";

// Offline, rollback-only, isolated GitHub Actions PostgreSQL.
const u=new URL(process.env.ALTOVENA_TEST_DATABASE_URL||"");
if(!["localhost","127.0.0.1"].includes(u.hostname) ||
    u.pathname!=="/altovena_ci_test")throw Error("Local disposable database required");
const db=new pg.Client({connectionString:u.toString(),connectionTimeoutMillis:5000});
const file=path=>readFileSync(path,"utf8");
const keyA="a".repeat(64),keyB="b".repeat(64);
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const rpc=async(name,args=[],types=[])=>{
 const vars=args.map((_,i)=>"$"+(i+1)+(types[i]?"::"+types[i]:"")).join(",");
 return (await query("select public."+name+"("+vars+") as result",args))[0].result;
};
await db.connect();
try{
 await db.query("BEGIN");
 await db.query(file("scripts/fixtures/altovena-ci-schema.sql"));
 await db.query(file("supabase/migrations/20261014210000_altovena_brand_intake.sql"));
 await db.query(file("supabase/migrations/20261017212000_altovena_lead_alert_queue.sql"));
 await db.query(file("supabase/migrations/20261018094500_altovena_delivery_preflight.sql"));
 const migration=file("supabase/migrations/20261018120500_altovena_smtp_attempt_boundary.sql");
 await db.query(migration);
 await db.query(migration); // Idempotent DDL

 const acl=(await query(`select
   has_table_privilege('anon','public.altovena_delivery_attempts','SELECT') as anon_select,
   has_table_privilege('authenticated','public.altovena_delivery_attempts','INSERT') as auth_insert,
   has_function_privilege('anon','public.altovena_claim_operator_smtp(text)','EXECUTE') as anon_claim,
   has_function_privilege('authenticated','public.altovena_finalize_operator_smtp(uuid,text,text,text)','EXECUTE') as auth_finish,
   has_function_privilege('service_role','public.altovena_claim_operator_smtp(text)','EXECUTE') as service_claim`))[0];
 assert.deepEqual(acl,{anon_select:false,auth_insert:false,anon_claim:false,
   auth_finish:false,service_claim:true});
 await db.query("SET LOCAL ROLE service_role");

 const task=async(brand,status,source,hours,updated=hours)=>{
   return (await query(`insert into public.work_items
     (title,brand_id,source_type,status,created_at,updated_at)
     values('Synthetic',$1,$2,$3,now()-($4::int*interval '1 hour'),
       now()-($5::int*interval '1 hour')) returning id`,
     [brand,source,status,hours,updated]))[0].id;
 };
 const add=async(id,kind)=>{
  return (await query(`insert into public.altovena_lead_alerts(work_item_id,kind)
    values($1,$2) returning id`,[id,kind]))[0].id;
 };
 const old=await task("altovena","TO_DO","website_lead",30);
 const stalled=await task("altovena","IN_PROGRESS","website_lead",53,50);
 const other=await task("zeneco","TO_DO","website_lead",77);
 const early=await task("altovena","TO_DO","website_lead",1);
 const oldAlert=await add(old,"NOT_STARTED_24H");
 const stallAlert=await add(stalled,"IN_PROGRESS_48H");
 const foreignAlert=await add(other,"NOT_STARTED_24H");
 await add(early,"NOT_STARTED_15M");
 const insertCandidate=async(id,operator)=>(
  await query(`insert into public.altovena_delivery_candidates(alert_id,operator_key)
  values($1,$2) returning id`,[id,operator]))[0].id;
 const idOldA=await insertCandidate(oldAlert,keyA);
 const idStallA=await insertCandidate(stallAlert,keyA);
 await insertCandidate(oldAlert,keyB);
 await insertCandidate(foreignAlert,keyA); // illegal brand candidate cannot be claimed
 const claimA=await rpc("altovena_claim_operator_smtp",[keyA],["text"]);
 assert.equal(claimA.ok,true);
 assert.equal(claimA.claimed,true);
 assert.match(claimA.attemptId,/^[0-9a-f-]{36}$/i);
 assert.equal(claimA.smtpAccepted,false);
 assert.equal(claimA.delivered,false);
 const firstCandidate=(await query(
  "select candidate_id,state from public.altovena_delivery_attempts where id=$1",
  [claimA.attemptId]))[0];
 assert.equal(firstCandidate.state,"ATTEMPTING");
 assert.ok([idOldA,idStallA].includes(firstCandidate.candidate_id));

 // Simulate a server crash after the claim. It is NOT reclaimed on the next run.
 const claimOther=await rpc("altovena_claim_operator_smtp",[keyA],["text"]);
 assert.equal(claimOther.claimed,true);
 assert.notEqual(claimOther.attemptId,claimA.attemptId);
 assert.equal((await rpc("altovena_claim_operator_smtp",[keyA],["text"])).claimed,false);
 const pending=(await rpc("altovena_operator_smtp_status",[keyA],["text"]));
 assert.deepEqual(pending,{
   ok:true,brand:"altovena",attempting:2,smtpAccepted:0,
   outcomeUnknown:0,deliveryConfirmed:false,
 });

 // A genuine SMTP server acceptance is not final mailbox delivery.
 const accepted=await rpc("altovena_finalize_operator_smtp",
   [claimA.attemptId,keyA,"SMTP_ACCEPTED","<smtp-test-id@example.invalid>"],
   ["uuid","text","text","text"]);
 assert.deepEqual(accepted,{ok:true,brand:"altovena",state:"SMTP_ACCEPTED",
   smtpAccepted:true,delivered:false});
 const immutable=await rpc("altovena_finalize_operator_smtp",
   [claimA.attemptId,keyA,"OUTCOME_UNKNOWN",null],
   ["uuid","text","text","text"]);
 assert.equal(immutable.state,"SMTP_ACCEPTED","result is immutable on repeated calls");
 const outcome=await rpc("altovena_finalize_operator_smtp",
   [claimOther.attemptId,keyA,"OUTCOME_UNKNOWN",null],
   ["uuid","text","text","text"]);
 assert.equal(outcome.state,"OUTCOME_UNKNOWN");
 assert.equal(outcome.smtpAccepted,false);
 assert.equal((await rpc("altovena_claim_operator_smtp",[keyA],["text"])).claimed,false,
   "neither accepted nor uncertain sends can auto-retry");
 const status=await rpc("altovena_operator_smtp_status",[keyA],["text"]);
 assert.deepEqual(status,{ok:true,brand:"altovena",attempting:0,
    smtpAccepted:1,outcomeUnknown:1,deliveryConfirmed:false});
 assert.deepEqual(await rpc("altovena_operator_smtp_status",[keyB],["text"]),
   {ok:true,brand:"altovena",attempting:0,smtpAccepted:0,
    outcomeUnknown:0,deliveryConfirmed:false});

 const otherKey=await rpc("altovena_finalize_operator_smtp",
   [claimA.attemptId,keyB,"OUTCOME_UNKNOWN",null],
   ["uuid","text","text","text"]);
 assert.equal(otherKey.ok,false,"other operator may not finalize our send");
 const foreign=await query(`select count(*)::int as n
  from public.altovena_delivery_attempts t
  join public.altovena_delivery_candidates c on c.id=t.candidate_id
  where c.alert_id=$1`,[foreignAlert]);
 assert.equal(foreign[0].n,0);
 await db.query("delete from public.work_items where id=$1",[old]);
 const afterErase=(await query(
  "select count(*)::int as n from public.altovena_delivery_attempts"))[0].n;
 assert.equal(afterErase,1,"task erasure cascades its delivery attempt");

 console.log("PASS irreversible one-claim SMTP boundary, ambiguous crash state, acceptance != delivery, immutable results, brand/key ACL and FK erasure.");
}finally{
 await db.query("ROLLBACK").catch(()=>{});
 await db.end();
}
