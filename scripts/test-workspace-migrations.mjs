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
  "20260924170000_brand_workspace_contact_writes.sql",
  "20260924180000_workspace_brand_property_catalogue.sql",
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
async function createBrandContact(brandKey = "pinosoecolife", name = "Pinoso staff contact") {
  const res = await serviceSql(
    "select public.workspace_brand_contact_create($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text) as result",
    [brandKey, member, "staff@example.test", name, "pinoso.staff@example.test", "+34611111111"],
  );
  return res.rows[0].result;
}
async function updateBrandContact(id, name = "Pinoso staff contact updated") {
  const res = await serviceSql(
    "select public.workspace_brand_contact_update($1::text,$2::uuid,$3::text,$4::uuid,$5::boolean,$6::text,$7::boolean,$8::text,$9::boolean,$10::text) as result",
    ["pinosoecolife", member, "staff@example.test", id, true, name, false, null, false, null],
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
  await sql("create table public.contacts (id uuid primary key default gen_random_uuid(), name text not null, email text, phone text, brand_id text, brand text, pipeline_status text default 'NEW', source text default 'manual', created_at timestamptz default now(), updated_at timestamptz default now())");
  await sql("create table public.properties (id uuid primary key default gen_random_uuid(), ref text, title text, town text, location text, price numeric, bedrooms integer, bathrooms integer, area_m2 numeric, plot_size numeric, property_type text, primary_image text, created_at timestamptz default now(), show_on_website boolean not null default true, website_visible boolean not null default true)");
  await sql("create table public.property_brand_visibility (property_id uuid not null references public.properties(id) on delete cascade, brand_id text not null, visible boolean not null default true, created_at timestamptz default now(), primary key(property_id,brand_id))");
  await sql("grant usage on schema core to service_role");
  await sql("grant select on core.brands to service_role");
  await sql("grant select, insert, update on public.contacts to service_role");
  await sql("grant select on public.properties, public.property_brand_visibility to service_role");
  for (const filename of files) {
    const contents = await fs.readFile(path.join(root, "supabase/migrations", filename), "utf8");
    await sql(contents);
    process.stdout.write("Applied isolated migration: " + filename + "\n");
  }
  const roles = await sql("select rolname from pg_roles where rolname in ('anon','authenticated','service_role')");
  verify(roles.rowCount === 3, "Test roles missing");
  const membershipPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_memberships','SELECT') as sel, " +
    "has_table_privilege('service_role','core.brand_workspace_memberships','INSERT') as ins, " +
    "has_table_privilege('service_role','core.brand_workspace_memberships','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.brand_workspace_memberships','DELETE') as del",
  );
  verify(membershipPrivileges.rows[0].sel && membershipPrivileges.rows[0].ins &&
    membershipPrivileges.rows[0].upd && !membershipPrivileges.rows[0].del,
    "service_role workspace membership privileges must allow lifecycle updates but never hard delete");
  const membershipAuditExec = await sql(
    "select has_function_privilege('anon','core.audit_brand_workspace_membership()','EXECUTE') as anon, " +
    "has_function_privilege('authenticated','core.audit_brand_workspace_membership()','EXECUTE') as authenticated, " +
    "has_function_privilege('service_role','core.audit_brand_workspace_membership()','EXECUTE') as service",
  );
  verify(!membershipAuditExec.rows[0].anon && !membershipAuditExec.rows[0].authenticated &&
    !membershipAuditExec.rows[0].service,
    "membership audit trigger function must not be directly executable by app roles");

  const accessPlanPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_access_plans','SELECT') as sel, " +
    "has_table_privilege('service_role','core.brand_workspace_access_plans','INSERT') as ins, " +
    "has_table_privilege('service_role','core.brand_workspace_access_plans','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.brand_workspace_access_plans','DELETE') as del",
  );
  verify(accessPlanPrivileges.rows[0].sel && accessPlanPrivileges.rows[0].ins &&
    accessPlanPrivileges.rows[0].upd && !accessPlanPrivileges.rows[0].del,
    "service_role access-plan privileges must preserve discarded drafts rather than hard-delete them");
  const accessPlanAuditExec = await sql(
    "select has_function_privilege('anon','core.audit_brand_workspace_access_plan()','EXECUTE') as anon, " +
    "has_function_privilege('authenticated','core.audit_brand_workspace_access_plan()','EXECUTE') as authenticated, " +
    "has_function_privilege('service_role','core.audit_brand_workspace_access_plan()','EXECUTE') as service",
  );
  verify(!accessPlanAuditExec.rows[0].anon && !accessPlanAuditExec.rows[0].authenticated &&
    !accessPlanAuditExec.rows[0].service,
    "access-plan audit trigger function must not be directly executable by app roles");
  const initialPlans = await sql("select count(*)::int as total from core.brand_workspace_access_plans");
  verify(initialPlans.rows[0].total === 0,
    "Workspace migrations must never create an access-plan draft implicitly");

  const initialMemberships = await sql("select count(*)::int as total from core.brand_workspace_memberships");
  verify(initialMemberships.rows[0].total === 0,
    "Workspace migrations must never activate a member implicitly");
  for (const func of ["workspace_zeneco_review_candidates", "workspace_zeneco_review_lead",
    "workspace_zeneco_joint_contacts", "workspace_zeneco_joint_contact_update",
    "workspace_zeneco_joint_tasks", "workspace_zeneco_joint_task_create",
    "workspace_zeneco_joint_task_complete", "workspace_brand_contacts",
    "workspace_brand_contact_create", "workspace_brand_contact_update",
    "workspace_brand_property_catalogue"]) {
    const grants = await sql(
      "select has_function_privilege('anon',p.oid,'EXECUTE') as anon, has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated, has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",
      [func],
    );
    verify(!grants.rows[0].anon && !grants.rows[0].authenticated && grants.rows[0].service,
      func + ": privileged execute grant leaked");
  }
  for (const table of ["brand_workspace_memberships", "brand_workspace_membership_audit",
    "brand_workspace_access_plans", "brand_workspace_access_plan_audit",
    "zeneco_joint_lead_cohort", "zeneco_joint_lead_review_audit",
    "zeneco_joint_contact_edit_audit", "zeneco_joint_work_items",
    "brand_workspace_contact_write_audit"]) {
    const rls = await sql("select relrowsecurity from pg_class where oid=$1::regclass", ["core." + table]);
    verify(rls.rows[0]?.relrowsecurity === true, table + " must use RLS");
  }
  for (const auditTable of ["zeneco_joint_lead_review_audit", "zeneco_joint_contact_edit_audit",
    "brand_workspace_contact_write_audit"]) {
    const privileges = await sql(
      "select has_table_privilege('service_role',$1,'SELECT') as sel, has_table_privilege('service_role',$1,'INSERT') as ins, has_table_privilege('service_role',$1,'UPDATE') as upd, has_table_privilege('service_role',$1,'DELETE') as del",
      ["core." + auditTable],
    );
    verify(privileges.rows[0].sel && privileges.rows[0].ins &&
      !privileges.rows[0].upd && !privileges.rows[0].del,
      auditTable + " must be append-only for service_role");
  }
  const planAuditPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_access_plan_audit','SELECT') as sel, has_table_privilege('service_role','core.brand_workspace_access_plan_audit','INSERT') as ins, has_table_privilege('service_role','core.brand_workspace_access_plan_audit','UPDATE') as upd, has_table_privilege('service_role','core.brand_workspace_access_plan_audit','DELETE') as del",
  );
  verify(planAuditPrivileges.rows[0].sel && !planAuditPrivileges.rows[0].ins &&
    !planAuditPrivileges.rows[0].upd && !planAuditPrivileges.rows[0].del,
    "brand_workspace_access_plan_audit must be trigger-owned and read-only to service_role");
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
  const firstMembershipAudit = await sql(
    "select action,old_status,new_status,new_permissions from core.brand_workspace_membership_audit " +
    "where brand_id=$1 and user_id=$2 order by at,id",
    [zen, member],
  );
  verify(firstMembershipAudit.rowCount === 1 &&
    firstMembershipAudit.rows[0].action === "created" &&
    firstMembershipAudit.rows[0].old_status === null &&
    firstMembershipAudit.rows[0].new_status === "active" &&
    firstMembershipAudit.rows[0].new_permissions.join() === "crm.joint.read",
    "Initial workspace membership lifecycle audit missing or inaccurate");
  verify((await list()).contacts.map(c => c.id).join() === newId,
    "Scoped list must show only the owner-approved Zen contact");
  verify((await list(member, "wrong@example.test")).contacts.length === 0,
    "Session email must match exact membership email");
  verify(await edit() === null, "Read-only membership could edit joint Zen customer");
  await sql(
    "update core.brand_workspace_memberships set permissions=array['crm.joint.read','crm.joint.write']::text[] where brand_id=$1 and user_id=$2",
    [zen, member],
  );
  const updatedMembershipAudit = await sql(
    "select action,old_status,new_status,old_permissions,new_permissions from core.brand_workspace_membership_audit " +
    "where brand_id=$1 and user_id=$2 order by at desc,id desc limit 1",
    [zen, member],
  );
  verify(updatedMembershipAudit.rows[0]?.action === "updated" &&
    updatedMembershipAudit.rows[0]?.old_status === "active" &&
    updatedMembershipAudit.rows[0]?.new_status === "active" &&
    updatedMembershipAudit.rows[0]?.old_permissions.join() === "crm.joint.read" &&
    updatedMembershipAudit.rows[0]?.new_permissions.join() === "crm.joint.read,crm.joint.write",
    "Workspace membership permission change audit missing");
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

  // Employee membership revocation also serializes with ALL supported write
  // operations, not just with owner customer-cohort revocation. These isolated
  // races deliberately block the service_role query on a locked member row.
  const memberRaceId = "99999999-9999-4999-8999-999999999998";
  await sql(
    "insert into public.contacts(id,name,brand_id,brand,created_at,source) values ($1,'Membership race customer','zeneco','zeneco',$2,'website')",
    [memberRaceId, newer],
  );
  verify(await review(memberRaceId, "APPROVE", newer) === true,
    "Member-revocation race contact was not approved");
  const taskBeforeMemberRevoke = await createTask(memberRaceId, "Finish after membership lock");
  verify(taskBeforeMemberRevoke?.id, "Could not create the open task for membership race");
  for (const scenario of [
    { label: "joint CRM edit", invoke: () => edit(memberRaceId, "UNAUTHORIZED MEMBER RACE EDIT") },
    { label: "joint task create", invoke: () => createTask(memberRaceId, "UNAUTHORIZED MEMBER RACE TASK") },
    { label: "joint task complete", invoke: () => finishTask(memberRaceId, taskBeforeMemberRevoke.id) },
  ]) {
    await sql(
      "update core.brand_workspace_memberships set status='active' where brand_id=$1 and user_id=$2",
      [zen, member],
    );
    const membershipBlocker = new Client({
      connectionString: localUrl,
      application_name: "isolated_zen_membership_revoke_race",
    });
    await membershipBlocker.connect();
    let pendingWrite;
    let committed = false;
    try {
      await membershipBlocker.query("begin");
      await membershipBlocker.query(
        "select user_id from core.brand_workspace_memberships where brand_id=$1 and user_id=$2 for update",
        [zen, member],
      );
      pendingWrite = scenario.invoke().catch(error => error);
      let waiting = false;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await membershipBlocker.query("select pg_sleep(0.05)");
        const state = await membershipBlocker.query(
          "select wait_event_type from pg_stat_activity where pid=$1", [activePid],
        );
        if (state.rows[0]?.wait_event_type === "Lock") {
          waiting = true;
          break;
        }
      }
      verify(waiting, scenario.label + " did not serialize against membership revocation");
      await membershipBlocker.query(
        "update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2",
        [zen, member],
      );
      await membershipBlocker.query("commit");
      committed = true;
      verify((await pendingWrite) === null,
        scenario.label + " succeeded after employee membership was revoked");
    } finally {
      if (!committed) await membershipBlocker.query("rollback").catch(() => undefined);
      await membershipBlocker.end();
      if (pendingWrite) await pendingWrite.catch(() => undefined);
    }
  }
  const memberRaceContact = await sql("select name from public.contacts where id=$1", [memberRaceId]);
  verify(memberRaceContact.rows[0].name === "Membership race customer",
    "Revoked employee changed a contact during the concurrent membership test");
  const memberRaceTasks = await sql(
    "select title,status from core.zeneco_joint_work_items where contact_id=$1 order by created_at,id",
    [memberRaceId],
  );
  verify(memberRaceTasks.rowCount === 1 && memberRaceTasks.rows[0].status === "open",
    "Revoked employee created/completed a joint task during membership revocation");

  // Pinoso full-brand CRM reads/writes use separate non-Zen RPCs. They are
  // membership-scoped and cannot fall back to Zen's historical CRM.
  const readBrandContacts = () => serviceSql(
    "select public.workspace_brand_contacts($1::text,$2::uuid,$3::text,$4::integer,$5::text) as result",
    ["pinosoecolife", member, "staff@example.test", 0, ""],
  ).then(r => r.rows[0].result);
  verify(await readBrandContacts() === null,
    "Pinoso CRM was readable without an active Pinoso membership");
  verify(await createBrandContact() === null,
    "Pinoso contact was created without an active Pinoso membership");
  await sql(
    "insert into core.brand_workspace_memberships(brand_id,user_id,email,status,permissions) values ($1,$2,'staff@example.test','active',array['crm.read']::text[])",
    [pinoso, member],
  );
  const readOnlyPinoso = await readBrandContacts();
  verify(readOnlyPinoso?.contacts?.length === 1 && readOnlyPinoso.contacts[0].id === other &&
    readOnlyPinoso.contacts[0].brand_id === "pinosoecolife" && readOnlyPinoso.contacts[0].brand === "pinosoecolife",
    "Pinoso read RPC leaked another brand or failed exact brand scoping");
  verify(await createBrandContact() === null,
    "Read-only Pinoso membership created a customer");
  await sql(
    "update core.brand_workspace_memberships set permissions=array['crm.read','crm.write']::text[] where brand_id=$1 and user_id=$2",
    [pinoso, member],
  );
  verify(await createBrandContact("zeneco", "FORBIDDEN ZEN LEGACY") === null,
    "Generic brand contact RPC accepted Zen Eco Homes");
  const pinosoCreated = await createBrandContact();
  verify(pinosoCreated?.brand_id === "pinosoecolife" && pinosoCreated?.brand === "pinosoecolife" &&
    pinosoCreated?.pipeline_status === "NEW" && pinosoCreated?.name === "Pinoso staff contact",
    "Atomic Pinoso contact creation failed or returned the wrong brand");
  const pinosoContactId = pinosoCreated.id;
  const pinosoUpdated = await updateBrandContact(pinosoContactId);
  verify(pinosoUpdated?.id === pinosoContactId && pinosoUpdated?.name === "Pinoso staff contact updated" &&
    pinosoUpdated?.brand_id === "pinosoecolife" && pinosoUpdated?.brand === "pinosoecolife",
    "Atomic Pinoso contact update failed");
  const pinosoAudit = await sql(
    "select action,actor_email,changed_fields from core.brand_workspace_contact_write_audit where contact_id=$1 order by at,id",
    [pinosoContactId],
  );
  verify(pinosoAudit.rowCount === 2 &&
    pinosoAudit.rows[0].action === "created" && pinosoAudit.rows[1].action === "updated" &&
    pinosoAudit.rows.every(row => row.actor_email === "staff@example.test"),
    "Pinoso staff create/update audit entries missing");
  verify(pinosoAudit.rows[0].changed_fields.includes("name") &&
    pinosoAudit.rows[0].changed_fields.includes("email") &&
    pinosoAudit.rows[0].changed_fields.includes("phone") &&
    pinosoAudit.rows[1].changed_fields.join() === "name",
    "Pinoso audit changed-field names are inaccurate");
  const auditColumns = await sql(
    "select column_name from information_schema.columns where table_schema='core' and table_name='brand_workspace_contact_write_audit'",
  );
  verify(!auditColumns.rows.some(row =>
    ["name","email","phone","before","after","value"].includes(row.column_name)),
    "Pinoso write audit table stores customer PII values");
  verify(await updateBrandContact(newId, "DO NOT EDIT ZEN") === null,
    "Pinoso generic RPC updated a Zen contact");

  // Race: an employee read waiting behind an owner membership lock must not
  // return CRM rows after the owner commits revocation.
  const pinosoReadBlocker = new Client({
    connectionString: localUrl,
    application_name: "isolated_pinoso_membership_revoke_read_race",
  });
  await pinosoReadBlocker.connect();
  let pendingPinosoRead;
  let pinosoReadCommitted = false;
  try {
    await pinosoReadBlocker.query("begin");
    await pinosoReadBlocker.query(
      "select user_id from core.brand_workspace_memberships where brand_id=$1 and user_id=$2 for update",
      [pinoso, member],
    );
    pendingPinosoRead = readBrandContacts().catch(error => error);
    let waiting = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await pinosoReadBlocker.query("select pg_sleep(0.05)");
      const state = await pinosoReadBlocker.query(
        "select wait_event_type from pg_stat_activity where pid=$1", [activePid],
      );
      if (state.rows[0]?.wait_event_type === "Lock") { waiting = true; break; }
    }
    verify(waiting, "Pinoso CRM read did not serialize against membership revocation");
    await pinosoReadBlocker.query(
      "update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2",
      [pinoso, member],
    );
    await pinosoReadBlocker.query("commit");
    pinosoReadCommitted = true;
    verify((await pendingPinosoRead) === null,
      "Pinoso CRM read returned customer rows after membership was revoked");
  } finally {
    if (!pinosoReadCommitted) await pinosoReadBlocker.query("rollback").catch(() => undefined);
    await pinosoReadBlocker.end();
    if (pendingPinosoRead) await pendingPinosoRead.catch(() => undefined);
  }
  await sql(
    "update core.brand_workspace_memberships set status='active' where brand_id=$1 and user_id=$2",
    [pinoso, member],
  );

  // Race: an already-started customer creation must also lose to owner
  // membership revocation and must leave no contact or audit row behind.
  const pinosoCreateBlocker = new Client({
    connectionString: localUrl,
    application_name: "isolated_pinoso_membership_revoke_create_race",
  });
  await pinosoCreateBlocker.connect();
  let pendingPinosoCreate;
  let pinosoCreateCommitted = false;
  try {
    await pinosoCreateBlocker.query("begin");
    await pinosoCreateBlocker.query(
      "select user_id from core.brand_workspace_memberships where brand_id=$1 and user_id=$2 for update",
      [pinoso, member],
    );
    pendingPinosoCreate = createBrandContact("pinosoecolife", "UNAUTHORIZED PINOSO RACE CREATE")
      .catch(error => error);
    let waiting = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await pinosoCreateBlocker.query("select pg_sleep(0.05)");
      const state = await pinosoCreateBlocker.query(
        "select wait_event_type from pg_stat_activity where pid=$1", [activePid],
      );
      if (state.rows[0]?.wait_event_type === "Lock") { waiting = true; break; }
    }
    verify(waiting, "Pinoso contact create did not serialize against membership revocation");
    await pinosoCreateBlocker.query(
      "update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2",
      [pinoso, member],
    );
    await pinosoCreateBlocker.query("commit");
    pinosoCreateCommitted = true;
    verify((await pendingPinosoCreate) === null,
      "Pinoso contact create succeeded after employee membership was revoked");
  } finally {
    if (!pinosoCreateCommitted) await pinosoCreateBlocker.query("rollback").catch(() => undefined);
    await pinosoCreateBlocker.end();
    if (pendingPinosoCreate) await pendingPinosoCreate.catch(() => undefined);
  }
  const forbiddenCreates = await sql(
    "select count(*)::int as total from public.contacts where brand_id='pinosoecolife' and brand='pinosoecolife' and name='UNAUTHORIZED PINOSO RACE CREATE'",
  );
  verify(forbiddenCreates.rows[0].total === 0,
    "Revoked Pinoso employee created a customer during membership revocation");
  await sql(
    "update core.brand_workspace_memberships set status='active' where brand_id=$1 and user_id=$2",
    [pinoso, member],
  );

  // Race: membership revocation wins over an already-started Pinoso update.
  const pinosoBlocker = new Client({
    connectionString: localUrl,
    application_name: "isolated_pinoso_membership_revoke_race",
  });
  await pinosoBlocker.connect();
  let pendingPinosoUpdate;
  let pinosoCommitted = false;
  try {
    await pinosoBlocker.query("begin");
    await pinosoBlocker.query(
      "select user_id from core.brand_workspace_memberships where brand_id=$1 and user_id=$2 for update",
      [pinoso, member],
    );
    pendingPinosoUpdate = updateBrandContact(pinosoContactId, "UNAUTHORIZED PINOSO RACE EDIT").catch(error => error);
    let waiting = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await pinosoBlocker.query("select pg_sleep(0.05)");
      const state = await pinosoBlocker.query(
        "select wait_event_type from pg_stat_activity where pid=$1", [activePid],
      );
      if (state.rows[0]?.wait_event_type === "Lock") {
        waiting = true;
        break;
      }
    }
    verify(waiting, "Pinoso contact update did not serialize against membership revocation");
    await pinosoBlocker.query(
      "update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2",
      [pinoso, member],
    );
    await pinosoBlocker.query("commit");
    pinosoCommitted = true;
    verify((await pendingPinosoUpdate) === null,
      "Pinoso contact update succeeded after employee membership was revoked");
  } finally {
    if (!pinosoCommitted) await pinosoBlocker.query("rollback").catch(() => undefined);
    await pinosoBlocker.end();
    if (pendingPinosoUpdate) await pendingPinosoUpdate.catch(() => undefined);
  }
  const pinosoAfterRace = await sql("select name,brand_id,brand from public.contacts where id=$1", [pinosoContactId]);
  verify(pinosoAfterRace.rows[0].name === "Pinoso staff contact updated" &&
    pinosoAfterRace.rows[0].brand_id === "pinosoecolife" && pinosoAfterRace.rows[0].brand === "pinosoecolife",
    "Revoked Pinoso employee changed customer data during membership revocation");
  const auditAfterRace = await sql(
    "select count(*)::int as total from core.brand_workspace_contact_write_audit where contact_id=$1",
    [pinosoContactId],
  );
  verify(auditAfterRace.rows[0].total === 2,
    "Blocked Pinoso membership-race write produced an audit entry");
  verify(await readBrandContacts() === null,
    "Revoked Pinoso membership still read CRM customers");
  verify(await createBrandContact() === null,
    "Revoked Pinoso membership still created a customer");

  process.stdout.write("Isolated workspace migration checks passed: " + checks + "\n");
} finally {
  await client.end();
}
