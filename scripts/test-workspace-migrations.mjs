// Isolated integration contract: NEVER connect to Supabase or production data.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "20260924130000_brand_workspace_memberships.sql",
  "20260924140000_brand_workspace_access_plans.sql",
  "20260924150000_zeneco_joint_new_lead_cohort_foundation.sql",
  "20260924160000_zeneco_joint_tasks_isolated_foundation.sql",
];
const localUrl = process.env.MIGRATION_TEST_DATABASE_URL;
assert(localUrl && ["localhost", "127.0.0.1", "::1"].includes(new URL(localUrl).hostname) &&
  new URL(localUrl).pathname === "/remaster_migration_test",
  "Require the explicitly named local isolated migration-test PostgreSQL database");
assert(!process.env.SUPABASE_DB_URL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL,
  "Refuse connections when production-style database variables are configured");

const zen = "11111111-1111-4111-8111-111111111111";
const pinoso = "22222222-2222-4222-8222-222222222222";
const member = "33333333-3333-4333-8333-333333333333";
const old = "44444444-4444-4444-8444-444444444444";
const newId = "55555555-5555-4555-8555-555555555555";
const importedOld = "66666666-6666-4666-8666-666666666666";
const other = "77777777-7777-4777-8777-777777777777";
const cutoff = "2026-09-23T22:00:00Z";
const newer = "2026-09-23T23:00:00Z";
const older = "2026-09-23T21:00:00Z";
const client = new Client({ connectionString: localUrl, application_name: "isolated_zen_joint_cohort_test" });
let checks = 0;
const verify = (condition, message) => { checks += 1; assert(condition, message); };
async function sql(query, args = []) { return client.query(query, args); }
// Execute privileged RPCs as a realistic Supabase service_role, not the
// superuser fixture: missing schema/table/function grants must fail in CI.
async function serviceSql(query, args = []) {
  await sql("set role service_role");
  try { return await sql(query, args); }
  finally { await sql("reset role"); }
}
async function review(id, action, first = null) {
  const result = await serviceSql(
    "select public.workspace_zeneco_review_lead($1::uuid,$2::text,$3::timestamptz,$4::text,$5::text,$6::text,$7::text) as ok",
    [id, action, first, first ? "website form" : null,
      first ? "intake-evidence-20260924-1" : null,
      "Verified original inquiry and prior contact relationship", "owner@example.test"],
  );
  return result.rows[0].ok;
}
async function list(user = member, email = "staff@example.test") {
  const res = await serviceSql(
    "select public.workspace_zeneco_joint_contacts($1::uuid,$2::text,0,'') as result",
    [user, email],
  );
  return res.rows[0].result;
}
async function edit(id = newId, name = "Updated eligible name") {
  const res = await serviceSql(
    "select public.workspace_zeneco_joint_contact_update($1::uuid,$2::text,$3::uuid,$4::text,$5::text,$6::text) as result",
    [member, "staff@example.test", id, name, "updated@example.test", "+34600000000"],
  );
  return res.rows[0].result;
}

try {
  await client.connect();
  await sql("set statement_timeout = '30s'");
  await sql("set lock_timeout = '5s'");
  // Existing isolated migration tests have already created these roles and may
  // have left fixture schemas. Reset only this explicitly local test database.
  for (const role of ["anon", "authenticated", "service_role"]) {
    const existing = await sql("select 1 from pg_roles where rolname=$1", [role]);
    if (!existing.rowCount) await sql("create role " + role + " nologin");
  }
  // Production Supabase service_role has BYPASSRLS. Match it ONLY in the
  // disposable local CI database after legacy migration tests have finished.
  await sql("alter role service_role bypassrls");
  await sql("drop schema if exists core cascade");
  await sql("drop schema if exists auth cascade");
  await sql("drop schema if exists public cascade");
  await sql("create schema public");
  await sql("grant all on schema public to public");
  await sql("create schema auth; create schema core");
  await sql("create table auth.users (id uuid primary key, email text)");
  await sql("create table core.brands (id uuid primary key, brand_key text not null unique, display_name text not null)");
  await sql("create table public.contacts (id uuid primary key, name text not null, email text, phone text, brand_id text, brand text, pipeline_status text, source text, created_at timestamptz, updated_at timestamptz)");
  await sql("grant usage on schema core to service_role");
  await sql("grant select on core.brands to service_role");
  await sql("grant select, update on public.contacts to service_role");
  for (const filename of files) {
    const contents = await fs.readFile(path.join(root, "supabase/migrations", filename), "utf8");
    await sql(contents);
    process.stdout.write("Applied isolated migration: " + filename + "\n");
  }
  const roles = await sql("select rolname from pg_roles where rolname in ('anon','authenticated','service_role')");
  verify(roles.rowCount === 3, "Test roles missing");
  for (const func of ["workspace_zeneco_review_candidates", "workspace_zeneco_review_lead",
    "workspace_zeneco_joint_contacts", "workspace_zeneco_joint_contact_update",
    "workspace_zeneco_joint_tasks", "workspace_zeneco_joint_task_create",
    "workspace_zeneco_joint_task_complete"]) {
    const grants = await sql(
      "select has_function_privilege('anon',p.oid,'EXECUTE') as anon, has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated, has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",
      [func],
    );
    verify(!grants.rows[0].anon && !grants.rows[0].authenticated && grants.rows[0].service,
      func + ": privileged execute grant leaked");
  }
  for (const table of ["zeneco_joint_lead_cohort", "zeneco_joint_lead_review_audit",
    "zeneco_joint_contact_edit_audit", "zeneco_joint_work_items"]) {
    const rls = await sql("select relrowsecurity from pg_class where oid=$1::regclass", ["core." + table]);
    verify(rls.rows[0]?.relrowsecurity === true, table + " must use RLS");
  }
  await sql("insert into auth.users(id,email) values ($1,'staff@example.test')", [member]);
  await sql("insert into core.brands(id,brand_key,display_name) values ($1,'zeneco','Zen Eco Homes'),($2,'pinosoecolife','Pinoso EcoLife')", [zen, pinoso]);
  await sql(
    "insert into public.contacts (id,name,brand_id,brand,created_at,source) values ($1,'Historical Zen','zeneco','zeneco',$5,'website'),($2,'New Zen','zeneco','zeneco',$6,'website'),($3,'Reimported historical','zeneco','zeneco',$6,'old export'),($4,'Other brand','pinosoecolife','pinosoecolife',$6,'website')",
    [old, newId, importedOld, other, older, newer],
  );
  const candidate = await serviceSql("select public.workspace_zeneco_review_candidates() as result");
  verify(candidate.rows[0].result.contacts.length === 2, "Candidate view leaked historical or other-brand records");
  verify(candidate.rows[0].result.contacts.every(row => row.brand_id === "zeneco" && row.brand === "zeneco"),
    "Candidate brand fields must agree");
  verify(await review(old, "APPROVE", newer) === false, "Old CRM entry was automatically eligible");
  verify(await review(importedOld, "APPROVE", older) === false, "Re-imported old lead was automatically eligible");
  verify(await review(other, "APPROVE", newer) === false, "Other brand contact was approvable");
  verify(await review(newId, "APPROVE", newer) === true, "Documented new Zen contact not approved");
  verify(await review(newId, "APPROVE", newer) === false, "Duplicate approval should be rejected");
  verify((await list()).contacts.length === 0, "Joint CRM listed contacts without an active member grant");
  await sql(
    "insert into core.brand_workspace_memberships(brand_id,user_id,email,status,permissions) values ($1,$2,'staff@example.test','active',array['crm.joint.read']::text[])",
    [zen, member],
  );
  verify((await list()).contacts.map(c => c.id).join() === newId,
    "Scoped list must show only the owner-approved Zen contact");
  verify((await list(member, "wrong@example.test")).contacts.length === 0,
    "Session email must match exact membership email");
  verify(await edit() === null, "Read-only membership could edit joint Zen customer");
  await sql(
    "update core.brand_workspace_memberships set permissions=array['crm.joint.read','crm.joint.write']::text[] where brand_id=$1 and user_id=$2",
    [zen, member],
  );
  verify(await edit(old) === null, "Historical Zen customer was editable");
  verify(await edit(importedOld) === null, "Unapproved post-cutoff import was editable");
  verify(await edit(other) === null, "Foreign brand customer was editable");
  const editResult = await edit();
  verify(editResult?.id === newId && editResult.name === "Updated eligible name", "Approved joint edit failed");
  const audit = await sql("select actor_email,changed_fields from core.zeneco_joint_contact_edit_audit where contact_id=$1", [newId]);
  verify(audit.rowCount === 1 && audit.rows[0].actor_email === "staff@example.test",
    "Joint edit audit missing");
  const tasks = (contact = newId, email = "staff@example.test") =>
    serviceSql("select public.workspace_zeneco_joint_tasks($1::uuid,$2::text,$3::uuid) as result",
      [member, email, contact]).then(r => r.rows[0].result);
  const createTask = (contact = newId, title = "Check plot selection", email = "staff@example.test") =>
    serviceSql("select public.workspace_zeneco_joint_task_create($1::uuid,$2::text,$3::uuid,$4::text,$5::date) as result",
      [member, email, contact, title, "2026-09-30"]).then(r => r.rows[0].result);
  const finishTask = (contact, taskId, email = "staff@example.test") =>
    serviceSql("select public.workspace_zeneco_joint_task_complete($1::uuid,$2::text,$3::uuid,$4::uuid) as result",
      [member, email, contact, taskId]).then(r => r.rows[0].result);
  verify((await tasks()).tasks.length === 0, "Task read without explicit task grant must be empty");
  verify(await createTask() === null, "CRM edit role wrongly created a joint task");
  await sql(
    "update core.brand_workspace_memberships set permissions=array['crm.joint.read','crm.joint.write','tasks.joint.read']::text[] where brand_id=$1 and user_id=$2",
    [zen, member],
  );
  verify((await tasks()).tasks.length === 0, "New-only task ledger contained historical legacy tasks");
  verify(await createTask() === null, "Read-only task scope allowed task creation");
  await sql(
    "update core.brand_workspace_memberships set permissions=array['crm.joint.read','crm.joint.write','tasks.joint.read','tasks.joint.write']::text[] where brand_id=$1 and user_id=$2",
    [zen, member],
  );
  verify(await createTask(old) === null, "Task created for historical Zen customer");
  verify(await createTask(importedOld) === null, "Task created for unapproved reimport");
  verify(await createTask(other) === null, "Task created for other brand customer");
  verify(await createTask(newId, "No", "wrong@example.test") === null,
    "Task creator email or title was not validated");
  const createdTask = await createTask();
  verify(createdTask?.contact_id === newId && createdTask.status === "open",
    "A legitimate approved new Zen task was not created");
  const taskId = createdTask.id;
  verify((await tasks()).tasks.length === 1 && (await tasks()).tasks[0].title === "Check plot selection",
    "Exact reviewed new-contact task is not visible");
  verify((await tasks(newId, "wrong@example.test")).tasks.length === 0,
    "Task read did not require the exact member email");
  verify((await tasks(old)).tasks.length === 0 && (await tasks(other)).tasks.length === 0,
    "Historical/foreign contact task list was exposed");
  verify(await finishTask(old, taskId) === null, "Task completed via a different contact ID");
  verify(await finishTask(newId, "99999999-9999-4999-8999-999999999999") === null,
    "Task completion accepted an unrelated task ID");
  const doneTask = await finishTask(newId, taskId);
  verify(doneTask?.status === "done" && doneTask.finished_by_email === "staff@example.test" &&
    doneTask.created_at, "Scoped task completion actor/status missing");
  verify(await finishTask(newId, taskId) === null, "Completed task could be finished twice");
  const legacyTasks = await sql("select to_regclass('public.work_items') as name");
  verify(legacyTasks.rows[0].name === null, "Joint tasks must not use legacy work_items");
  verify(await review(newId, "REVOKE") === true, "Owner could not revoke existing joint approval");
  verify((await tasks()).tasks.length === 0, "Revoked joint customer tasks remained visible");
  verify(await createTask() === null, "Revoked joint customer accepted a new task");
  verify(await finishTask(newId, taskId) === null, "Revoked joint task could still be modified");

  verify((await list()).contacts.length === 0, "Revoked customer still visible in joint CRM");
  verify(await edit() === null, "Revoked customer still editable");
  const row = await sql("select name from public.contacts where id=$1", [old]);
  verify(row.rows[0].name === "Historical Zen", "Historical CRM customer was mutated");
  const reviewAudit = await sql("select new_status from core.zeneco_joint_lead_review_audit where contact_id=$1 order by reviewed_at", [newId]);
  verify(reviewAudit.rows.map(r => r.new_status).includes("approved") &&
    reviewAudit.rows.map(r => r.new_status).includes("revoked"), "Owner review/revocation audit missing");
  await sql("update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2", [zen, member]);
  verify((await list()).contacts.length === 0, "Revoked membership still listed records");

  // Race: owner starts a revocation while holding the exact CRM row lock.
  // A staff write must wait and recheck CURRENT cohort eligibility only after
  // the owner commits; no stale statement snapshot may allow this write.
  const concurrentId = "88888888-8888-4888-8888-888888888888";
  await sql(
    "insert into public.contacts(id,name,brand_id,brand,created_at,source) values ($1,'Concurrent joint contact','zeneco','zeneco',$2,'website')",
    [concurrentId, newer],
  );
  verify(await review(concurrentId, "APPROVE", newer) === true, "Concurrent test customer was not approved");
  await sql("update core.brand_workspace_memberships set status='active' where brand_id=$1 and user_id=$2", [zen, member]);
  const activePid = (await sql("select pg_backend_pid() as pid")).rows[0].pid;
  const blocker = new Client({ connectionString: localUrl, application_name: "isolated_zen_owner_revoke_race" });
  let pendingEdit;
  let lockCommitted = false;
  await blocker.connect();
  try {
    await blocker.query("begin");
    await blocker.query("select id from public.contacts where id=$1::uuid for update", [concurrentId]);
    pendingEdit = edit(concurrentId, "SHOULD NEVER BE WRITTEN").catch(error => error);
    let observedWaiting = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await blocker.query("select pg_sleep(0.04)");
      const state = await blocker.query(
        "select wait_event_type from pg_stat_activity where pid=$1", [activePid],
      );
      if (state.rows[0]?.wait_event_type === "Lock") {
        observedWaiting = true;
        break;
      }
    }
    verify(observedWaiting, "Concurrent employee edit did not wait for the owner contact lock");
    const revoke = await blocker.query(
      "select public.workspace_zeneco_review_lead($1::uuid,'REVOKE',null,null,null,$2::text,$3::text) as ok",
      [concurrentId, "Independent owner review revokes joint collaboration", "owner@example.test"],
    );
    verify(revoke.rows[0].ok === true, "Concurrent owner revocation failed");
    await blocker.query("commit");
    lockCommitted = true;
    verify((await pendingEdit) === null, "Stale staff write succeeded after owner revoked the customer");
  } finally {
    if (!lockCommitted) await blocker.query("rollback").catch(() => undefined);
    await blocker.end();
    if (pendingEdit) await pendingEdit.catch(() => undefined);
  }
  const afterRace = await sql("select name from public.contacts where id=$1", [concurrentId]);
  verify(afterRace.rows[0].name === "Concurrent joint contact",
    "An employee modified the customer AFTER owner revocation");
  const raceAudits = await sql(
    "select count(*)::int as total from core.zeneco_joint_contact_edit_audit where contact_id=$1",
    [concurrentId],
  );
  verify(raceAudits.rows[0].total === 0, "A revoked customer received an unauthorized edit audit");
  process.stdout.write("Isolated Zen joint-customer migration checks passed: " + checks + "\n");
} finally {
  await client.end();
}
