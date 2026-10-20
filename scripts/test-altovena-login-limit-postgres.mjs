import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";

const url=new URL(process.env.ALTOVENA_TEST_DATABASE_URL||"");
if(!["127.0.0.1","localhost"].includes(url.hostname) ||
 url.pathname!=="/altovena_ci_test")throw Error("Disposable local Postgres only");
const conn=url.toString();
const client=async()=>{const c=new pg.Client({connectionString:conn});await c.connect();return c;};
const owner=await client();
try{
 // Disposable CI Postgres can start with no Supabase roles because prior
 // test suites roll back their fixtures. Create only missing synthetic roles.
 for(const role of ["anon","authenticated","service_role"]){
  const existing=await owner.query("select 1 from pg_roles where rolname=$1",[role]);
  if(!existing.rowCount)await owner.query('create role "'+role+'" nologin');
 }
 await owner.query("BEGIN");
 await owner.query(readFileSync("supabase/migrations/20261020124500_altovena_staging_login_limiter.sql","utf8"));
 const acl=(await owner.query(`select
 has_function_privilege('anon','public.altovena_consume_login_limit(text,integer,integer)','execute') as anon,
 has_function_privilege('authenticated','public.altovena_consume_login_limit(text,integer,integer)','execute') as member,
 has_function_privilege('service_role','public.altovena_consume_login_limit(text,integer,integer)','execute') as service,
 has_table_privilege('anon','public.altovena_staging_login_limits','select') as table_anon`)).rows[0];
 assert.deepEqual(acl,{anon:false,member:false,service:true,table_anon:false});
 await owner.query("SET LOCAL ROLE service_role");
 const key="a".repeat(64);
 const use=async()=> (await owner.query(
  "select public.altovena_consume_login_limit($1::text,3,900) as accepted",[key]
 )).rows[0].accepted;
 assert.deepEqual([await use(),await use(),await use(),await use()],[true,true,true,false]);
 const bad=await owner.query("select count(*)::int as n from public.altovena_staging_login_limits");
 assert.equal(bad.rows[0].n,1);
 // Concurrent independent connection requests require committed fixtures.
 await owner.query("ROLLBACK");
 await owner.query(readFileSync("supabase/migrations/20261020124500_altovena_staging_login_limiter.sql","utf8"));
 const b="b".repeat(64);
 const attempts=await Promise.all(Array.from({length:12},async()=>{
  const c=await client();
  try{
   await c.query("SET ROLE service_role");
   const r=await c.query("select public.altovena_consume_login_limit($1::text,5,900) as accepted",[b]);
   return r.rows[0].accepted;
  }finally{await c.end();}
 }));
 assert.equal(attempts.filter(Boolean).length,5);
 assert.equal(attempts.filter(x=>!x).length,7);
 const row=(await owner.query("select attempts from public.altovena_staging_login_limits where identifier=$1",[b])).rows[0];
 assert.equal(row.attempts,12,"every racing attempt counted exactly once");
 await owner.query("drop function public.altovena_consume_login_limit(text,integer,integer)");
 await owner.query("drop table public.altovena_staging_login_limits");
 console.log("PASS durable staging limiter: ACL + 12 concurrent calls; no database data persists");
}finally{await owner.end();}
