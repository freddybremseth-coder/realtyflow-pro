import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260718130752_billing_core.sql"), "utf8").toLowerCase();
const hardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718131104_billing_dona_anna_security_hardening.sql"),
  "utf8",
).toLowerCase();

test("billing migration assigns invoice numbers inside the issuance transaction", () => {
  const issueFunction = migration.slice(migration.indexOf("function public.billing_issue_document"), migration.indexOf("function public.billing_record_payment"));
  assert.match(issueFunction, /from public\.billing_invoice_series[\s\S]*for update/);
  assert.match(issueFunction, /set next_number = next_number \+ 1/);
  assert.match(issueFunction, /insert into public\.billing_document_snapshots/);
  assert.match(issueFunction, /digest\(/);
  assert.match(issueFunction, /insert into public\.billing_audit_events/);
});

test("billing migration makes issued content immutable and keeps a VeriFactu chain", () => {
  assert.match(migration, /issued billing documents cannot be deleted/);
  assert.match(migration, /issued billing document content is immutable/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /previous_hash/);
  assert.match(migration, /record_hash/);
});

test("billing migration enables RLS on every exposed billing table without broad revokes", () => {
  const tables = [...migration.matchAll(/create table public\.(billing_[a-z_]+)/g)].map((match) => match[1]);
  assert.ok(tables.length >= 20);
  for (const table of tables) assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.doesNotMatch(migration, /revoke all on all tables in schema public/);
  assert.match(migration, /grant select on[\s\S]*to authenticated/);
});

test("browser billing access is read-only and RLS auth calls are init-plan safe", () => {
  assert.doesNotMatch(migration, /billing_members_write/);
  assert.match(hardeningMigration, /drop policy if exists billing_members_write/);
  assert.match(hardeningMigration, /for select to authenticated/);
  assert.match(hardeningMigration, /\(\(select auth\.jwt\(\)\) ->> 'email'\)/);
  assert.doesNotMatch(hardeningMigration, /create policy billing_admins_update_organizations/);
});
