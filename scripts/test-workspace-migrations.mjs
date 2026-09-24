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
];
const localUrl = process.env.MIGRATION_TEST_DATABASE_URL;
assert(localUrl && ["localhost", "127.0.0.1", "::1"].includes(new URL(localUrl).hostname),
  "Require a local isolated PostgreSQL service");
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
async function review(id, action, first = null) {
  const result = await sql(
    "select public.workspace_zeneco_review_lead($1::uuid,$2::text,$3::timestamptz,$4::text,$5::text,$6::text,$7::text) as ok",
    [id, action, first, first ? "website form" : null,
      first ? "intake-evidence-20260924-1" : null,
      "Verified original inquiry and prior contact relationship", "owner@example.test"],
  );
  return result.rows[0].ok;
}
async function list(user = member, email = "staff@example.test") {
  const res = await sql(
    "select public.workspace_zeneco_joint_contacts($1::uuid,$2::text,0,'') as result",
    [user, email],
  );
  return res.rows[0].result;
}
async function edit(id = newId, name = "Updated eligible name") {
  const res = await sql(
    "select public.workspace_zeneco_joint_contact_update($1::uuid,$2::text,$3::uuid,$4::text,$5::text,$6::text) as result",
    [member, "staff@example.test", id, name, "updated@example.test", "+34600000000"],
  );
  return res.rows[0].result;
}

try {
  await client.connect();
  await sql("set statement_timeout = '30s'");
  await sql("set lock_timeout = '5s'");
  await sql("create role anon nologin; create role authenticated nologin; create role service_role nologin");
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
    "workspace_zeneco_joint_contacts", "workspace_zeneco_joint_contact_update"]) {
    const grants = await sql(
      "select has_function_privilege('anon',$1,'EXECUTE') as anon, has_function_privilege('authenticated',$1,'EXECUTE') as authenticated, has_function_privilege('service_role',$1,'EXECUTE') as service",
      ["public." + func],
    );
    verify(!grants.rows[0].anon && !grants.rows[0].authenticated && grants.rows[0].service,
      func + ": privileged execute grant leaked");
  }
  for (const table of ["zeneco_joint_lead_cohort", "zeneco_joint_lead_review_audit", "zeneco_joint_contact_edit_audit"]) {
    const rls = await sql("select relrowsecurity from pg_class where oid=$1::regclass", ["core." + table]);
    verify(rls.rows[0]?.relrowsecurity === true, table + " must use RLS");
  }
  await sql("insert into auth.users(id,email) values ($1,'staff@example.test')", [member]);
  await sql("insert into core.brands(id,brand_key,display_name) values ($1,'zeneco','Zen Eco Homes'),($2,'pinosoecolife','Pinoso EcoLife')", [zen, pinoso]);
  await sql(
    "insert into public.contacts (id,name,brand_id,brand,created_at,source) values ($1,'Historical Zen','zeneco','zeneco',$5,'website'),($2,'New Zen','zeneco','zeneco',$6,'website'),($3,'Reimported historical','zeneco','zeneco',$6,'old export'),($4,'Other brand','pinosoecolife','pinosoecolife',$6,'website')",
    [old, newId, importedOld, other, older, newer],
  );
  const candidate = await sql("select public.workspace_zeneco_review_candidates() as result");
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
  verify(await review(newId, "REVOKE") === true, "Owner could not revoke existing joint approval");
  verify((await list()).contacts.length === 0, "Revoked customer still visible in joint CRM");
  verify(await edit() === null, "Revoked customer still editable");
  const row = await sql("select name from public.contacts where id=$1", [old]);
  verify(row.rows[0].name === "Historical Zen", "Historical CRM customer was mutated");
  const reviewAudit = await sql("select new_status from core.zeneco_joint_lead_review_audit where contact_id=$1 order by reviewed_at", [newId]);
  verify(reviewAudit.rows.map(r => r.new_status).includes("approved") &&
    reviewAudit.rows.map(r => r.new_status).includes("revoked"), "Owner review/revocation audit missing");
  await sql("update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2", [zen, member]);
  verify((await list()).contacts.length === 0, "Revoked membership still listed records");
  process.stdout.write("Isolated Zen joint-customer migration checks passed: " + checks + "\n");
} finally {
  await client.end();
}
