import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260801112121_social_intelligence_mvp.sql"),
  "utf8",
).toLowerCase();

const personalKnowledgeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260801120242_personal_knowledge_profile_intelligence.sql"),
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

const personalKnowledgeTables = [
  "social_knowledge_sources",
  "social_knowledge_items",
  "social_profile_goals",
  "social_target_audiences",
  "social_profile_variants",
  "social_profile_suggestions",
  "social_profile_variant_versions",
];

test("social intelligence migration creates an isolated additive schema", () => {
  for (const table of socialTables) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`comment on table public\\.${table} is 'realtyflow social intelligence mvp v1'`));
  }

  assert.doesNotMatch(migration, /alter table public\.(contacts|customers|leads|properties|crm_[a-z_]+)/);
  assert.match(migration, /browser access stays mediated by server-side apis/);
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

test("personal knowledge migration creates additive review and profile-builder tables", () => {
  for (const table of personalKnowledgeTables) {
    assert.match(personalKnowledgeMigration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(personalKnowledgeMigration, new RegExp(`comment on table public\\.${table} is 'realtyflow personal knowledge & profile intelligence v1'`));
  }

  assert.doesNotMatch(personalKnowledgeMigration, /alter table public\.(contacts|customers|leads|properties|crm_[a-z_]+)/);
  assert.match(personalKnowledgeMigration, /uploaded knowledge as\s+-- reviewable user data/i);
});

test("personal knowledge defaults imported facts to review with provenance and public-use gates", () => {
  assert.match(personalKnowledgeMigration, /content_hash text not null/);
  assert.match(personalKnowledgeMigration, /source_ref text/);
  assert.match(personalKnowledgeMigration, /source_excerpt text/);
  assert.match(personalKnowledgeMigration, /verification_status text not null default 'needs_review'/);
  assert.match(personalKnowledgeMigration, /public_use_allowed boolean not null default false/);
  assert.match(personalKnowledgeMigration, /sensitive boolean not null default false/);
  assert.match(personalKnowledgeMigration, /possible_duplicate_of uuid references public\.social_knowledge_items/);
  assert.match(personalKnowledgeMigration, /conflict_group text/);
  assert.match(personalKnowledgeMigration, /source_knowledge_ids uuid\[\] not null default '\{\}'::uuid\[\]/);
  assert.match(personalKnowledgeMigration, /source_summary_json jsonb not null default '\[\]'::jsonb/);
});

test("personal knowledge tables are RLS-protected and server-mediated", () => {
  for (const table of personalKnowledgeTables) {
    assert.match(personalKnowledgeMigration, new RegExp(`'${table}'`));
  }

  assert.match(personalKnowledgeMigration, /alter table public\.%i enable row level security/);
  assert.match(personalKnowledgeMigration, /revoke all on public\.%i from public, anon, authenticated/);
  assert.match(personalKnowledgeMigration, /grant select, insert, update, delete on public\.%i to service_role/);
  assert.match(personalKnowledgeMigration, /for all to anon, authenticated using \(false\) with check \(false\)/);
  assert.match(personalKnowledgeMigration, /notify pgrst, 'reload schema'/);
});
