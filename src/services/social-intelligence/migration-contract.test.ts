import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260801112121_social_intelligence_mvp.sql"),
  "utf8",
).toLowerCase();

const socialTables = [
  "social_brand_profiles",
  "social_profile_imports",
  "social_profile_sections",
  "social_profile_versions",
  "social_skills",
  "social_content_pillars",
  "social_content_ideas",
  "social_posts",
  "social_post_versions",
  "social_post_metrics",
  "social_ai_recommendations",
  "social_entity_links",
  "social_audit_events",
];

test("social intelligence migration creates an isolated additive schema", () => {
  for (const table of socialTables) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`comment on table public\\.${table} is 'realtyflow social intelligence mvp v1'`));
  }

  assert.doesNotMatch(migration, /alter table public\.(contacts|customers|leads|properties|crm_[a-z_]+)/);
  assert.match(migration, /browser access stays[\s-]+mediated by server-side apis/);
});

test("social intelligence tables are RLS-protected and server-mediated", () => {
  for (const table of socialTables) {
    assert.match(migration, new RegExp(`'${table}'`));
  }

  assert.match(migration, /alter table public\.%i enable row level security/);
  assert.match(migration, /revoke all on public\.%i from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.%i to service_role/);
  assert.match(migration, /for all to anon, authenticated using \(false\) with check \(false\)/);
  assert.match(migration, /revoke execute on function public\.set_social_intelligence_updated_at\(\) from authenticated/);
});

test("social intelligence stores provenance, versions, and CRM links without scraping assumptions", () => {
  assert.match(migration, /content_hash text not null/);
  assert.match(migration, /content_hash ~ '\^sha256:v1:\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /create table if not exists public\.social_profile_versions/);
  assert.match(migration, /create table if not exists public\.social_post_versions/);
  assert.match(migration, /prompt_version text/);
  assert.match(migration, /create table if not exists public\.social_entity_links/);
  assert.match(migration, /social_entity_links_unique_key unique/);
  assert.match(migration, /create table if not exists public\.social_audit_events/);
});

test("social intelligence indexes tenant scope and work queues", () => {
  for (const indexName of [
    "idx_social_brand_profiles_org_user",
    "idx_social_imports_org_user_created",
    "idx_social_sections_org_user",
    "idx_social_posts_org_user_status",
    "idx_social_metrics_post_recorded",
    "idx_social_recommendations_org_user_status",
    "idx_social_entity_links_crm",
  ]) {
    assert.match(migration, new RegExp(`create (unique )?index if not exists ${indexName}`));
  }
});
