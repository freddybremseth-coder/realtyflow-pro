import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertNexusBoardReadOnlyRole, parseNexusBoardDatabaseUrl } from "./task-board-connection";

const good="postgresql://nexus_reader:encoded-pass@db.example.org:5432/realtyflow";
const validProof={
  restricted_role:true, ordinary_role:true, can_read_board:true, can_read_grants:true,
  can_create_in_core:false, task_table_access:false, approval_table_access:false,
  grant_table_access:false, membership_table_access:false, claim_table_access:false,
  can_claim:false, can_propose:false, can_review:false,
};
test("database URL fails closed on SSL downgrade or URL injection options",()=>{
  assert.equal(parseNexusBoardDatabaseUrl(good).hostname,"db.example.org");
  for (const url of [
    good+"?sslmode=require", good+"?sslmode=verify-full",
    good+"?sslmode=no-verify", good+"?sslmode=disable",
    good+"?sslrootcert=%2Ftmp%2Froot.crt",good+"?sslcert=x",
    good+"?ssl=false",good+"?options=-c%20statement_timeout%3D0",
    good+"#fragment", "http://user:pass@db.example.org/db",
    "postgresql://postgres@db.example.org/db",
    "postgresql://user:password@db.example.org/",
    "not a connection url",
  ]) {
    assert.throws(()=>parseNexusBoardDatabaseUrl(url),/NEXUS_BOARD_DATABASE_URL_INVALID/,url);
  }
});
test("private board role must match a restricted Postgres identity",async()=>{
  let calls=0;
  const db={async query(sql:string,values:readonly unknown[]){
    calls++;
    assert.match(sql,/pg_catalog\.pg_has_role\(current_user/);
    assert.match(sql,/pg_catalog\.has_table_privilege/);
    assert.match(sql,/pg_catalog\.has_function_privilege/);
    assert.deepEqual(values,[]);
    return {rows:[{...validProof}]};
  }};
  await assert.doesNotReject(assertNexusBoardReadOnlyRole(db));
  assert.equal(calls,1);
});
test("superuser, bypassRLS, privileged login or capability leakage is refused",async()=>{
  for (const patch of [
    {restricted_role:false},
    {ordinary_role:false},
    {can_read_board:false},
    {can_read_grants:false},
    {can_create_in_core:true},
    {task_table_access:true},
    {approval_table_access:true},
    {grant_table_access:true},
    {membership_table_access:true},
    {claim_table_access:true},
    {can_claim:true},
    {can_propose:true},
    {can_review:true},
  ]) {
    const db={async query(){return {rows:[{...validProof,...patch}]}}};
    await assert.rejects(assertNexusBoardReadOnlyRole(db),/NEXUS_BOARD_READER_ROLE_DENIED/);
  }
});
test("unavailable or ambiguous role-proof result cannot authorize data read",async()=>{
  const db0={async query(){return {rows:[]}}};
  const db2={async query(){return {rows:[validProof,validProof]}}};
  const dbFailed={async query(){throw new Error("database offline");}};
  await assert.rejects(assertNexusBoardReadOnlyRole(db0),/NEXUS_BOARD_READER_ROLE_DENIED/);
  await assert.rejects(assertNexusBoardReadOnlyRole(db2),/NEXUS_BOARD_READER_ROLE_DENIED/);
  await assert.rejects(assertNexusBoardReadOnlyRole(dbFailed),/database offline/);
});
test("both server routes require role proof before board data requests",()=>{
 const owner=readFileSync(new URL("../../app/api/nexus/task-board/route.ts",import.meta.url),"utf8");
 const staff=readFileSync(new URL("../../app/api/workspaces/[brandKey]/nexus-task-board/route.ts",import.meta.url),"utf8");
 const source=readFileSync(new URL("./task-board-connection.ts",import.meta.url),"utf8");
 for(const route of [owner,staff]){
   assert.match(route,/parseNexusBoardDatabaseUrl/);
   assert.match(route,/withNexusBoardReader/);
   assert.doesNotMatch(route,/new pg\.Client/);
   assert.doesNotMatch(route,/export async function (POST|PUT|PATCH|DELETE)/);
 }
 assert.match(source,/await assertNexusBoardReadOnlyRole\(client\)/);
 assert.match(source,/await client\.connect\(\)/);
 assert.match(source,/rejectUnauthorized:true/);
 assert.doesNotMatch(source,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});
