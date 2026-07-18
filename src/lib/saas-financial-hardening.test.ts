import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718170950_saas_stripe_financial_hardening.sql"),
  "utf8",
).toLowerCase();

test("legacy SaaS control-plane tables no longer allow browser access", () => {
  for (const table of [
    "saas_apps",
    "saas_subscriptions",
    "saas_analytics",
    "saas_opportunities",
    "saas_discovery_runs",
  ]) {
    assert.match(migration, new RegExp(`drop policy if exists "allow all on ${table}"`));
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table} from public, anon, authenticated`));
  }
  assert.doesNotMatch(migration, /create policy[^;]+using\s*\(true\)[\s\S]*?with check\s*\(true\)/);
});

test("Stripe events and invoice totals are idempotent database records", () => {
  assert.match(migration, /create table core\.stripe_webhook_events/);
  assert.match(migration, /event_id text primary key/);
  assert.match(migration, /create table core\.stripe_invoices/);
  assert.match(migration, /stripe_invoice_id text primary key/);
  assert.match(migration, /first_paid_transition/);
  assert.match(migration, /previous_invoice_status is distinct from 'paid'/);
  assert.match(migration, /saas_claim_stripe_event/);
  assert.match(migration, /saas_complete_stripe_event/);
  assert.match(migration, /saas_fail_stripe_event/);
});

test("payment failure uses grace, scheduled suspension and paid reactivation", () => {
  assert.match(migration, /access_status in \('active', 'grace', 'suspended'\)/);
  assert.match(migration, /when p_event_type = 'invoice\.payment_failed' then 'past_due'/);
  assert.match(migration, /now\(\) \+ make_interval\(days => p_grace_days\)/);
  assert.match(migration, /saas_enforce_subscription_grace_periods/);
  assert.match(migration, /when p_event_type = 'invoice\.paid' then 'active'/);
  assert.match(migration, /update core\.tenant_entitlements te set[\s\S]*status = 'active'/);
});

test("all financial lifecycle RPCs are service-role only", () => {
  for (const rpc of [
    "saas_claim_stripe_event",
    "saas_complete_stripe_event",
    "saas_fail_stripe_event",
    "saas_sync_stripe_billing_state",
    "saas_enforce_subscription_grace_periods",
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role`));
  }
});
