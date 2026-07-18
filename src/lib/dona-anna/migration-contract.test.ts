import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718130758_dona_anna_commerce_inventory.sql"),
  "utf8",
).toLowerCase();
const hardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718131104_billing_dona_anna_security_hardening.sql"),
  "utf8",
).toLowerCase();
const indexMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718131253_billing_dona_anna_foreign_key_indexes.sql"),
  "utf8",
).toLowerCase();
const operationalMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718191708_dona_anna_partial_fulfillment_stock_ledger.sql"),
  "utf8",
).toLowerCase();

test("Doña Anna keeps operations private and exposes only server RPCs", () => {
  assert.match(migration, /create schema if not exists commerce/);
  assert.match(migration, /create schema if not exists inventory/);
  assert.match(migration, /create schema if not exists integrations/);
  assert.match(migration, /revoke all on schema commerce, inventory, integrations from public, anon, authenticated/);
  assert.match(migration, /grant usage on schema commerce, inventory, integrations to service_role/);

  const publicRpcs = [...migration.matchAll(/create or replace function public\.(donaanna_[a-z_]+)/g)]
    .map((match) => match[1]);
  assert.ok(publicRpcs.length >= 18);
  for (const rpc of publicRpcs) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${rpc}\\(`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}\\(`));
  }
});

test("every operational table receives RLS and inventory is movement based", () => {
  const tables = [...migration.matchAll(/create table (commerce|inventory|integrations)\.([a-z_]+)/g)];
  assert.ok(tables.length >= 25);
  assert.match(migration, /n\.nspname in \('commerce', 'inventory', 'integrations'\)/);
  assert.match(migration, /alter table %i\.%i enable row level security/);
  assert.match(migration, /create table inventory\.movements/);
  assert.match(migration, /create or replace view inventory\.stock_balances[\s\S]*sum\(quantity\)/);
  assert.match(migration, /trg_inventory_movements_immutable/);
  assert.match(migration, /revoke update, delete on inventory\.movements, commerce\.audit_events from service_role/);

  const productTable = migration.slice(
    migration.indexOf("create table commerce.products"),
    migration.indexOf("create table commerce.price_lists"),
  );
  assert.doesNotMatch(productTable, /stock_quantity/);
});

test("legacy Olivia products and prices are preserved while physical opening stock stays zero", () => {
  assert.match(migration, /to_regclass\('olivia\.commerce_products'\)/);
  assert.match(migration, /legacyoliviaid/);
  assert.match(migration, /legacyoliviastockquantityignored/);
  assert.match(migration, /'canonicalopeningstock', 0/);
  assert.doesNotMatch(migration, /legacy-opening-/);
});

test("orders protect stock, intercompany parties, commissions and invoice linkage", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /insufficient available stock/);
  assert.match(migration, /adjustment would create negative available stock/);
  assert.match(migration, /intercompany orders require both legal seller and legal buyer/);
  assert.match(migration, /payable_event in \('fulfilled', 'paid'\)/);
  assert.match(migration, /function public\.donaanna_create_invoice_draft/);
  assert.match(migration, /public\.billing_save_draft/);
  assert.match(migration, /update commerce\.orders set billing_document_id/);
});

test("food commerce covers lots, POS, landed cost, returns and recalls", () => {
  assert.match(migration, /create table inventory\.lots/);
  assert.match(migration, /create table commerce\.pos_sessions/);
  assert.match(migration, /create table inventory\.landed_costs/);
  assert.match(migration, /create table commerce\.returns/);
  assert.match(migration, /create table inventory\.recalls/);
  assert.match(migration, /'return_out', -quantity_value/);
  assert.match(migration, /update inventory\.lots set status = 'recalled'/);
});

test("family resellers use explicit price lists rather than fake commission", () => {
  assert.match(migration, /'family_reseller'/);
  assert.match(migration, /function public\.donaanna_upsert_price_list/);
  assert.match(migration, /function public\.donaanna_set_price/);
  assert.doesNotMatch(migration, /rule_type in \([^)]*reseller_price/);
});

test("private schemas explicitly deny browser access after hardening", () => {
  assert.match(hardeningMigration, /n\.nspname in \('commerce', 'inventory', 'integrations'\)/);
  assert.match(hardeningMigration, /create policy deny_direct_browser_access/);
  assert.match(hardeningMigration, /as restrictive for all to anon, authenticated/);
  assert.match(hardeningMigration, /using \(false\) with check \(false\)/);
});

test("every unindexed module foreign key receives a covering index", () => {
  assert.match(indexMigration, /constraint_row\.contype = 'f'/);
  assert.match(indexMigration, /nspname in \('commerce', 'inventory', 'integrations'\)/);
  assert.match(indexMigration, /index_row\.indisvalid/);
  assert.match(indexMigration, /create index if not exists/);
});

test("order fulfillment is partial, idempotent, cost-aware and lot-safe", () => {
  assert.match(operationalMigration, /function public\.donaanna_fulfill_order/);
  assert.match(operationalMigration, /correlation_id = event_id/);
  assert.match(operationalMigration, /'partially_fulfilled'/);
  assert.match(operationalMigration, /fulfilled_quantity = fulfilled_quantity \+ quantity_value/);
  assert.match(operationalMigration, /owner_organization_id is not distinct from order_row\.seller_organization_id/);
  assert.match(operationalMigration, /movement_cost_value/);
  assert.match(operationalMigration, /status = 'released'/);
  assert.match(operationalMigration, /when quantity - quantity_value <= 0 then quantity/);
  assert.match(operationalMigration, /then 'committed' else 'active'/);
});

test("stock activity stays server-only and immutable movements remain authoritative", () => {
  assert.match(operationalMigration, /function public\.donaanna_stock_activity/);
  assert.match(operationalMigration, /security invoker/);
  assert.match(operationalMigration, /revoke execute on function public\.donaanna_stock_activity\(text, integer\) from public, anon, authenticated/);
  assert.match(operationalMigration, /grant execute on function public\.donaanna_stock_activity\(text, integer\) to service_role/);
  assert.match(operationalMigration, /create or replace view inventory\.available_stock/);
  assert.match(operationalMigration, /coalesce\(lot\.status, 'blocked'\) <> 'released'/);
});
