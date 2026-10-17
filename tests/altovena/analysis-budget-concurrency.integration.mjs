import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";

if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.ALTOVENA_BUDGET_TEST_DB_ONLY !== "true" ||
    process.env.PGDATABASE !== "altovena_nexus_test" ||
    process.env.PGHOST !== "127.0.0.1") {
  throw new Error("Budget concurrency test restricted to disposable CI PostgreSQL");
}
function connect() {
  return new pg.Client({
    host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    database:process.env.PGDATABASE,user:process.env.PGUSER,
    password:process.env.PGPASSWORD,ssl:false,
    connectionTimeoutMillis:5000,statement_timeout:15000,
  });
}
const owner="cccccccc-cccc-cccc-cccc-cccccccccccc";
const reviewer="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const digest="c".repeat(64);
const goalDigest=(goal)=>createHash("sha256").update(goal,"utf8").digest("hex");

const setup=connect(),a=connect(),b=connect();
try {
  await Promise.all([setup,a,b].map(c=>c.connect()));
  const tenantRow=await setup.query(
    "select id from altovena.tenants where external_ref=$1",
    ["host:realtyflowpro:altovena-internal"]);
  assert.equal(tenantRow.rows.length,1);
  const tenant=tenantRow.rows[0].id;
  const before=await setup.query(
    "select committed_cents,limit_cents from altovena.analysis_budget_periods where tenant_id=$1",
    [tenant]);
  assert.deepEqual(
    [Number(before.rows[0].committed_cents),Number(before.rows[0].limit_cents)],
    [12,25]);
  const permits=[];
  for (const index of [1,2]) {
    const missionId=randomUUID(),permitId=randomUUID();
    const goal="Concurrent analysis budget case "+index;
    await setup.query(
      "insert into altovena.missions(id,tenant_id,product_slug,created_by,goal,state)"+
      " values($1,$2,'command',$3,$4,'draft')",
      [missionId,tenant,owner,goal]);
    await setup.query(
      "insert into altovena.mission_route_plans(tenant_id,mission_id,proposed_by,plan)"+
      " values($1,$2,$3,$4::jsonb)",
      [tenant,missionId,owner,JSON.stringify({mode:"ROUTING_PROPOSAL_ONLY",missionId})]);
    await setup.query(
      "insert into altovena.mission_analysis_preparations("+
      "tenant_id,mission_id,prepared_by,routing_digest,agent_count)"+
      " values($1,$2,$3,$4,1)",
      [tenant,missionId,owner,digest]);
    await setup.query(
      "insert into altovena.analysis_permits(id,tenant_id,mission_id,actor_id,reviewer_id,"+
      "approved_at,state,model,goal_digest,routing_digest,evidence_digest,"+
      "max_input_tokens,max_output_tokens,reserved_cost_cents,expires_at)"+
      " values($1,$2,$3,$4,$5,clock_timestamp(),'approved_for_read_only_analysis',"+
      "'gpt-5.6',$6,$7,$7,1200,600,12,clock_timestamp()+interval '8 minutes')",
      [permitId,tenant,missionId,owner,reviewer,goalDigest(goal),digest]);
    permits.push(permitId);
  }
  const jobs=await Promise.allSettled([a,b].map((client,i)=>
    client.query(
      "select result_kind,result_reservation_id from altovena.reserve_analysis_budget($1,$2,$3,$4)",
      [permits[i],tenant,owner,digest]),
  ));
  const passed=jobs.filter(x=>x.status==="fulfilled");
  const denied=jobs.filter(x=>x.status==="rejected");
  assert.equal(passed.length,1,JSON.stringify(jobs));
  assert.equal(denied.length,1,JSON.stringify(jobs));
  assert.equal(passed[0].value.rows[0].result_kind,"reserved");
  assert.ok(String(denied[0].reason.message).includes("analysis_monthly_budget_exhausted"));
  const after=await setup.query(
    "select committed_cents from altovena.analysis_budget_periods where tenant_id=$1",
    [tenant]);
  assert.equal(Number(after.rows[0].committed_cents),24);
  const reservations=await setup.query(
    "select count(*)::int n from altovena.analysis_reservations where tenant_id=$1",
    [tenant]);
  assert.equal(reservations.rows[0].n,2);
  const audit=await setup.query(
    "select count(*)::int n from altovena.analysis_budget_events where tenant_id=$1 and event_type='reserved'",
    [tenant]);
  assert.equal(audit.rows[0].n,2);
  console.log("Two simultaneous permits reserved at most one remaining budget slot; exactly once.");
} finally {
  await Promise.all([setup,a,b].map(c=>c.end().catch(()=>undefined)));
}
