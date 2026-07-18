import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260718130752_billing_core.sql"), "utf8").toLowerCase();
const hardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718131104_billing_dona_anna_security_hardening.sql"),
  "utf8",
).toLowerCase();
const settlementMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718174545_billing_credit_settlement_refunds.sql"),
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

test("credit notes and refunds have explicit immutable allocations", () => {
  assert.match(settlementMigration, /create table public\.billing_credit_allocations/);
  assert.match(settlementMigration, /credit_note_id uuid not null unique/);
  assert.match(settlementMigration, /original_invoice_id uuid not null/);
  assert.match(settlementMigration, /create table public\.billing_refunds/);
  assert.match(settlementMigration, /create table public\.billing_refund_allocations/);
  assert.match(settlementMigration, /billing settlement events are append-only/);
  assert.match(settlementMigration, /before update or delete on public\.billing_refunds/);
  assert.match(settlementMigration, /function public\.billing_validate_refund_allocation/);
  assert.match(settlementMigration, /refund allocation exceeds the refundable invoice amount/);
});

test("invoice settlement uses payments, credits, and refunds as its authority", () => {
  const settlementFunction = settlementMigration.slice(
    settlementMigration.indexOf("function public.billing_recalculate_invoice_settlement"),
    settlementMigration.indexOf("function public.billing_protect_document"),
  );
  assert.match(settlementFunction, /document_row\.total - gross_paid - credited \+ refunded/);
  assert.match(settlementFunction, /gross_paid \+ credited - refunded - document_row\.total/);
  assert.match(settlementFunction, /then 'partially_credited'/);
  assert.match(settlementFunction, /then 'fully_credited'/);
  assert.match(settlementMigration, /external refund id is already used for another refund/);
});

test("settlement tables are tenant-readable but server-write-only", () => {
  for (const table of ["billing_credit_allocations", "billing_refunds", "billing_refund_allocations"]) {
    assert.match(settlementMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(settlementMigration, /for select to authenticated/);
  assert.match(settlementMigration, /grant select, insert on[\s\S]*to service_role/);
  assert.doesNotMatch(settlementMigration, /grant (all|update|delete) on[\s\S]*billing_refunds[\s\S]*to service_role/);
});

test("billing actions expose refunds through the guarded database function", () => {
  const actionsRoute = readFileSync(
    resolve(process.cwd(), "src/app/api/billing/documents/[id]/actions/route.ts"),
    "utf8",
  );
  assert.match(actionsRoute, /action: z\.literal\("refund"\)/);
  assert.match(actionsRoute, /rpc\("billing_record_refund"/);
  assert.match(actionsRoute, /const deliveryStatus = \["partially_paid", "paid", "partially_credited", "fully_credited", "credited"\]/);
});
