import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260718154346_platform_core_tenancy_modules_entitlements.sql",
  ),
  "utf8",
).toLowerCase();

const tenantTables = [
  "tenant_subscriptions",
  "tenant_modules",
  "tenant_entitlements",
  "tenant_branding",
  "tenant_domains",
  "tenant_billing_organizations",
  "tenant_usage_events",
  "platform_audit_events",
];

const serverRpcs = [
  "platform_snapshot",
  "platform_upsert_tenant",
  "platform_upsert_membership",
  "platform_set_tenant_module",
  "platform_set_entitlement",
  "platform_upsert_branding",
  "platform_upsert_domain",
  "platform_upsert_subscription",
  "platform_record_usage",
];

test("platform core evolves the existing tenant foundation without duplicating it", () => {
  assert.match(migration, /alter table core\.tenants/);
  assert.match(migration, /alter table core\.apps/);
  assert.match(migration, /alter table core\.tenant_apps/);
  assert.doesNotMatch(migration, /create table core\.tenants/);
  assert.doesNotMatch(migration, /create schema (if not exists )?platform/);
});

test("platform core separates product apps, modules, plans and effective access", () => {
  assert.match(migration, /create table core\.modules/);
  assert.match(migration, /create table core\.app_modules/);
  assert.match(migration, /create table core\.plans/);
  assert.match(migration, /create table core\.plan_modules/);
  assert.match(migration, /create table core\.tenant_subscriptions/);
  assert.match(migration, /create table core\.tenant_modules/);
  assert.match(migration, /create table core\.tenant_entitlements/);
  assert.match(migration, /create table core\.tenant_branding/);
  assert.match(migration, /create table core\.tenant_domains/);
});

test("platform module and app seeds cover the reusable RealtyFlow products", () => {
  for (const moduleSlug of [
    "platform-core",
    "crm",
    "billing",
    "commissions",
    "real-estate",
    "author-studio",
    "commerce-inventory",
    "demosites",
    "remaster-studio",
  ]) {
    assert.match(migration, new RegExp(`\\('${moduleSlug}'`));
  }
  for (const appSlug of [
    "fakturering",
    "crm",
    "forfatterstudio",
    "remaster-freddy",
    "commerce-operations",
    "demosites",
  ]) {
    assert.match(migration, new RegExp(`\\('${appSlug}'`));
  }
  assert.match(migration, /prices are intentionally not invented/);
});

test("tenant platform data uses membership RLS and denies browser writes", () => {
  for (const table of tenantTables) {
    assert.match(migration, new RegExp(`alter table core\\.%i enable row level security`));
    assert.match(migration, new RegExp(`core_${table}_[a-z_]*member_read`));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = ''[\s\S]*core\.tenant_memberships/);
  assert.match(migration, /revoke insert, update, delete on core\.modules[\s\S]*from public, anon, authenticated/);
});

test("all platform administration RPCs are service-role only", () => {
  for (const rpc of serverRpcs) {
    assert.match(migration, new RegExp(`function public\\.${rpc}\\(`));
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${rpc}\\([^;]*from public, anon, authenticated`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${rpc}\\([^;]*to service_role`),
    );
  }
});

test("usage and audit histories are append-only and foreign keys are indexed", () => {
  assert.match(migration, /platform usage and audit events are append-only/);
  assert.match(migration, /before update or delete on core\.tenant_usage_events/);
  assert.match(migration, /before update or delete on core\.platform_audit_events/);
  assert.match(migration, /revoke update, delete on core\.tenant_usage_events, core\.platform_audit_events from service_role/);

  for (const index of [
    "core_profiles_default_tenant_idx",
    "core_tenant_apps_app_idx",
    "core_brands_tenant_idx",
    "core_module_dependencies_dependency_idx",
    "core_app_modules_module_idx",
    "core_plan_modules_module_idx",
    "core_tenant_subscriptions_app_idx",
    "core_tenant_subscriptions_plan_idx",
    "core_tenant_modules_module_idx",
    "core_tenant_modules_plan_idx",
    "core_tenant_entitlements_module_idx",
    "core_tenant_domains_tenant_idx",
    "core_tenant_domains_app_idx",
    "core_tenant_billing_organizations_organization_idx",
    "core_tenant_usage_events_module_idx",
  ]) {
    assert.match(migration, new RegExp(`create (unique )?index (if not exists )?${index}`));
  }
});
