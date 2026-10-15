import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasNexusTaskBoardViewGrant, loadNexusTaskBoard, normalizeTaskBoardBrandFilter } from "./task-board-read";

const task = "66666666-6666-4666-8666-666666666666";
const brand = "11111111-1111-4111-8111-111111111111";
test("brand filter rejects arbitrary input before any DB query", async () => {
  assert.throws(()=>normalizeTaskBoardBrandFilter("' or true"), /INVALID_BRAND_FILTER/);
  assert.throws(()=>normalizeTaskBoardBrandFilter("zeneco"), /INVALID_BRAND_FILTER/);
  assert.equal(normalizeTaskBoardBrandFilter(brand),brand);
  let touched=false;
  const fake={async query(){touched=true;return {rows:[]}}};
  await assert.rejects(loadNexusTaskBoard(fake,"hello"),/INVALID_BRAND_FILTER/);
  assert.equal(touched,false);
});
test("zero real rows gives zero; no sample or synthetic tasks",async()=>{
  const queries:Array<{sql:string;values:readonly unknown[]} >=[];
  const db={async query(sql:string,values:readonly unknown[]){queries.push({sql,values});return {rows:[]}}};
  assert.deepEqual(await loadNexusTaskBoard(db,null),[]);
  assert.equal(queries.length,1);
  assert.match(queries[0].sql,/core\.nexus_execution_tasks/);
  assert.match(queries[0].sql,/limit 50/i);
  assert.deepEqual(queries[0].values,[null,null]);
});
test("task board maps only non-sensitive metadata, event provenance and brand",async()=>{
  const db={async query(){return {rows:[{
    id:task,brand_id:brand,brand_key:"altovena",status:"review_required",version:1,
    action_type:"shortlist_draft_prepare",evidence_count:2,quality_reviewed:false,
    preflight_passed:false,review_decision:null,review_expires_at:null,
    reserved:false,created_at:"2026-10-15T20:00:00Z",updated_at:"2026-10-15T20:05:00Z",
    events:[{type:"proposal_created",at:"2026-10-15T20:00:00Z"}],
    customer_email:"not-sent@example.com",
  }]}}};
  const data=await loadNexusTaskBoard(db,brand);
  assert.equal(data.length,1);
  assert.equal(data[0].brandId,brand);
  assert.equal(data[0].evidenceCount,2);
  assert.deepEqual(data[0].events,[{type:"proposal_created",at:"2026-10-15T20:00:00.000Z"}]);
  assert.equal(JSON.stringify(data).includes("not-sent@example.com"),false);
});
test("missing record identity or malformed status fails closed",async()=>{
  const db={async query(){return {rows:[{id:"fake",brand_id:brand,status:"approved",version:1}]}}};
  await assert.rejects(loadNexusTaskBoard(db),/NEXUS_TASK_BOARD_INVALID_DATA/);
});
test("owner session, off-by-default activation and zero mutation routes are source contracts",()=>{
  const route=readFileSync(new URL("../../app/api/nexus/task-board/route.ts",import.meta.url),"utf8");
  assert.match(route,/requireAdminApi\(request\)/);
  assert.match(route,/access\.role !== "OWNER"/);
  assert.match(route,/access\.source !== "owner-session"/);
  assert.match(route,/NEXUS_TASK_BOARD_READ_ENABLED !== "true"/);
  assert.match(route,/NEXUS_TASK_BOARD_DATABASE_URL/);
  assert.match(route,/rejectUnauthorized:true/);
  assert.doesNotMatch(route,/export async function (POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(route,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route,/console\.log/);
});

test("staff board access requires independent DB capability and live membership",async()=>{
  const calls:Array<{sql:string;values:readonly unknown[]}>= [];
  const userId="33333333-3333-4333-8333-333333333333";
  const db={async query(sql:string,values:readonly unknown[]){
    calls.push({sql,values});
    return {rows:sql.includes("as allowed")?[{allowed:true}]:[]};
  }};
  assert.equal(await hasNexusTaskBoardViewGrant(db,brand,userId),true);
  assert.deepEqual(await loadNexusTaskBoard(db,brand,userId),[]);
  assert.deepEqual(calls[0].values,[brand,userId]);
  assert.deepEqual(calls[1].values,[brand,userId]);
  assert.match(calls[1].sql,/authz.capability='view'/);
  assert.match(calls[1].sql,/membership.status='active'/);
  assert.match(calls[1].sql,/nexus.read/);
  assert.match(calls[1].sql,/t.brand_id=\$1::uuid/);
  await assert.rejects(loadNexusTaskBoard(db,null,userId),/NEXUS_MEMBER_BRAND_REQUIRED/);
  assert.equal(calls.length,2);
  const denied={async query(){return {rows:[{allowed:false}]}}};
  assert.equal(await hasNexusTaskBoardViewGrant(denied,brand,userId),false);
});
test("member route remains GET-only, gated and bound to verified user identity",()=>{
  const route=readFileSync(new URL("../../app/api/workspaces/[brandKey]/nexus-task-board/route.ts",import.meta.url),"utf8");
  assert.match(route,/requireBrandWorkspace\(request,\s*brandKey,\s*"nexus.read"\)/);
  assert.match(route,/verifiedUserId/);
  assert.match(route,/hasNexusTaskBoardViewGrant/);
  assert.match(route,/NEXUS_TASK_BOARD_STAFF_READ_ENABLED/);
  assert.doesNotMatch(route,/export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route,/process.env.SUPABASE_SERVICE_ROLE_KEY/);
});
