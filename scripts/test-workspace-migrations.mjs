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
  "20260924190000_workspace_staff_security_preflight.sql",
  "20260924200000_workspace_known_server_only_auth_hardening.sql",
  "20260924210000_workspace_user_directory_and_admin.sql",
  "20260927143000_workspace_marketing_modules.sql",
  "20260927160000_workspace_content_studio.sql",
  "20260927190000_workspace_email_reach.sql",
  "20260928103000_workspace_social_publish.sql",
  "20260928205000_workspace_external_collaborators.sql",
  "20260928213000_workspace_reels_studio.sql",
  "20260929213000_workspace_youtube_studio.sql",
  "20260930143000_workspace_nexus_insights.sql",
  "20260930220000_workspace_newsletter_marketing.sql",
  "20260930223500_workspace_newsletter_segments_tracking.sql",
  "20261001170019_workspace_staff_preflight_public_art_metadata_exception.sql",
  "20261001171200_workspace_shared_safe_property_catalogue.sql",
  "20261001185327_workspace_personal_responsibilities.sql",
  "20261004204500_workspace_email_inbox_primary_sender.sql",
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
const managedUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
  await sql("drop schema if exists storage cascade");
  await sql("drop schema if exists olivia_private cascade");
  await sql("drop schema if exists olivia cascade");
  await sql("drop schema if exists public cascade");
  await sql("create schema public");
  await sql("grant all on schema public to public");
  await sql("create schema auth; create schema core; create schema storage; create schema olivia; create schema olivia_private");
  await sql("create table auth.users (id uuid primary key, email text)");
  await sql("create or replace function auth.uid() returns uuid language sql stable set search_path='' as $authuid$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $authuid$");
  await sql("create table olivia.user_profiles (id uuid primary key, role text not null)");
  await sql("alter table olivia.user_profiles enable row level security");
  await sql("create or replace function olivia_private.is_internal_user() returns boolean language sql stable security definer set search_path='' as $internal$ select exists (select 1 from olivia.user_profiles p where p.id=(select auth.uid()) and p.role in ('farmer','super_admin')) $internal$");
  await sql("revoke execute on function olivia_private.is_internal_user() from public, anon; grant execute on function olivia_private.is_internal_user() to authenticated");
  await sql("grant usage on schema olivia_private to authenticated");
  await sql("create table core.brands (id uuid primary key, brand_key text not null unique, display_name text not null)");
  await sql("create table public.contacts (id uuid primary key default gen_random_uuid(), name text not null, email text, phone text, brand_id text, brand text, pipeline_status text default 'NEW', source text default 'manual', do_not_contact boolean not null default false, email_suppressed boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now())");
  await sql("create table public.content_publications (id uuid primary key default gen_random_uuid(), brand_id text not null, content_type text not null, title text, description text, tags text[], media_urls text[], thumbnail_url text, scheduled_platforms text[], status text default 'draft' check (status in ('draft','processing','published','scheduled','failed')), scheduled_at timestamptz, published_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), total_views integer default 0, total_likes integer default 0, total_comments integer default 0, total_shares integer default 0, ai_generated boolean default false, ai_title text, ai_description text, ai_tags text[], ai_image_url text, publish_attempts integer not null default 0, last_publish_error text, content_features jsonb not null default '{}'::jsonb)");
  await sql("create table public.social_channels (id uuid primary key default gen_random_uuid(), brand_id text not null, platform text not null, external_id text not null, display_name text not null, metadata jsonb not null default '{}'::jsonb, is_active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now())");
  await sql("grant select,insert,update on public.content_publications to service_role; grant select on public.social_channels to service_role");
  await sql("create table public.properties (id uuid primary key default gen_random_uuid(), ref text, title text, town text, location text, price numeric, bedrooms integer, bathrooms integer, area_m2 numeric, plot_size numeric, property_type text, primary_image text, images text[], gallery text[], source text default 'redsp', status text not null default 'TILGJENGELIG', created_at timestamptz default now(), show_on_website boolean not null default true, website_visible boolean not null default true)");
  await sql("create table public.media_assets (id uuid primary key default gen_random_uuid(), brand_id text, public_url text, thumbnail_url text, signed_url_required boolean not null default false, deleted_at timestamptz)");
  await sql("create table public.property_brand_visibility (property_id uuid not null references public.properties(id) on delete cascade, brand_id text not null, visible boolean not null default true, created_at timestamptz default now(), primary key(property_id,brand_id))");
  await sql("create table public.work_items (id uuid primary key default gen_random_uuid(), title text not null, description text, status text not null default 'TO_DO' check (status in ('TO_DO','IN_PROGRESS','REVIEW','DONE','CANCELLED')), priority text not null default 'MEDIUM' check (priority in ('CRITICAL','HIGH','MEDIUM','LOW')), due_date date, brand_id text, source_type text not null default 'manual' check (source_type in ('manual','ai_agent','content','automation','market_intelligence')), source_id text, assigned_agent text, next_action text, metadata jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  await sql("create table public.search_discovery_events (id uuid primary key default gen_random_uuid(), brand_id text not null, source text not null, path text not null, occurred_at timestamptz not null default now())");
  await sql("create table public.automation_logs (id uuid primary key default gen_random_uuid(), action text not null, agent_name text, status text not null, details jsonb, created_at timestamptz default now())");
  await sql("create table public.corporate_prospects (id uuid primary key default gen_random_uuid(), brand_id text not null, company_name text not null, organization_type text not null default 'company', country_code text not null default 'NO', city text, industry text, employee_count integer, member_count integer, website_url text, linkedin_company_url text, status text not null default 'RESEARCHED', fit_score smallint not null default 50, fit_tier text not null default 'B', fit_reasons text[] not null default '{}', evidence_gaps text[] not null default '{}', decision_roles text[] not null default '{}', source_url text, evidence jsonb not null default '{}'::jsonb, next_action text, next_followup timestamptz, updated_at timestamptz not null default now())");
  await sql("create table public.corporate_partner_prospects (id uuid primary key default gen_random_uuid(), brand_id text not null, company_name text not null, partner_type text not null default 'other', country_code text not null default 'NO', city text, industry text, employee_count integer, website_url text, status text not null default 'DISCOVERED', fit_score smallint not null default 50, fit_tier text not null default 'B', fit_reasons text[] not null default '{}', evidence_gaps text[] not null default '{}', referral_angle text, source_url text, evidence jsonb not null default '{}'::jsonb, next_action text, next_followup timestamptz, updated_at timestamptz not null default now())");
  await sql("create table public.ad_campaigns (id uuid primary key default gen_random_uuid(), brand_id text, name text not null, product_name text not null, target_markets text[], audience_segments text[], funnel_stage text, offer text, status text not null default 'draft', total_creatives integer default 0, estimated_cost_usd numeric, growth_goal text default 'unspecified', created_at timestamptz default now(), updated_at timestamptz default now())");
  await sql("create table public.portal_messages (id uuid primary key default gen_random_uuid())");
  await sql("create table public.brand_settings (brand_id text primary key, settings jsonb)");
  await sql("create table public.brand_email_configs (id uuid primary key default gen_random_uuid(), brand_id text not null, email_address text not null, is_active boolean not null default true, updated_at timestamptz default now())");
  await sql("create table public.agentic_approvals (id uuid primary key default gen_random_uuid(), title text)");
  await sql("create table public.plot_assets (id uuid primary key default gen_random_uuid(), show_on_website boolean default false)");
  await sql("alter table public.contacts enable row level security; alter table public.work_items enable row level security; alter table public.portal_messages enable row level security; alter table public.brand_settings enable row level security; alter table public.agentic_approvals enable row level security; alter table public.plot_assets enable row level security");
  await sql("create table storage.buckets (id text primary key, name text not null, public boolean not null default false)");
  await sql("create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text)");
  await sql("alter table storage.objects enable row level security");
  // Match production Storage role capabilities closely enough to exercise RLS.
  await sql("grant usage on schema storage to authenticated, service_role");
  await sql("grant select, insert, update, delete on storage.objects to authenticated");
  // Production service_role can inspect Storage metadata; this privilege comes
  // from the platform, not from the workspace migration.
  await sql("grant select on storage.buckets to service_role");
  await sql("insert into storage.buckets(id,name,public) values ('property-documents','property-documents',false),('caecv-documents','caecv-documents',false),('plot-assets','plot-assets',true),('ad-creatives','ad-creatives',true),('olivia-field-observations','olivia-field-observations',true)");
  await sql("create policy \"agentic_approvals_read\" on public.agentic_approvals for select to authenticated using (true)");
  await sql("create policy \"plot_assets authenticated full access\" on public.plot_assets for all to public using (current_user in ('authenticated','service_role')) with check (current_user in ('authenticated','service_role'))");
  await sql("create policy \"Authenticated write plot-assets\" on storage.objects for insert to public with check (bucket_id='plot-assets' and current_user in ('authenticated','service_role'))");
  await sql("create policy \"Authenticated delete plot-assets\" on storage.objects for delete to public using (bucket_id='plot-assets' and current_user in ('authenticated','service_role'))");
  await sql("create policy \"Authenticated write ad-creatives\" on storage.objects for insert to public with check (bucket_id='ad-creatives' and current_user in ('authenticated','service_role'))");
  for (const bucket of ["property-documents","caecv-documents"]) {
    const label = bucket === "property-documents" ? "property documents" : "caecv documents";
    await sql(`create policy "Allow authenticated read ${label} storage" on storage.objects for select to authenticated using (bucket_id='${bucket}')`);
    await sql(`create policy "Allow authenticated insert ${label} storage" on storage.objects for insert to authenticated with check (bucket_id='${bucket}')`);
    await sql(`create policy "Allow authenticated update ${label} storage" on storage.objects for update to authenticated using (bucket_id='${bucket}') with check (bucket_id='${bucket}')`);
    await sql(`create policy "Allow authenticated delete ${label} storage" on storage.objects for delete to authenticated using (bucket_id='${bucket}')`);
  }
  await sql("create policy \"Olivia authenticated users can upload field observation images\" on storage.objects for insert to authenticated with check (bucket_id='olivia-field-observations')");
  await sql("create policy \"Olivia authenticated users can update field observation images\" on storage.objects for update to authenticated using (bucket_id='olivia-field-observations') with check (bucket_id='olivia-field-observations')");
  await sql("create policy \"Olivia authenticated users can delete field observation images\" on storage.objects for delete to authenticated using (bucket_id='olivia-field-observations')");
  // Reproduce production grant drift: these server/trigger-only SECURITY DEFINER
  // functions were explicitly executable by browser roles despite their original
  // migrations revoking PUBLIC. Workspace hardening must remove those grants.
  await sql("create function public.nexus_commercial_activation_contact_guard(uuid,text,timestamptz) returns boolean language sql security definer as $guard$ select true $guard$");
  await sql("create function public.ensure_nexus_commercial_activation_work_item(uuid,text,timestamptz,text,text,text,text,text,integer,jsonb) returns boolean language sql security definer as $ensure$ select true $ensure$");
  await sql("create function public.sync_email_admission_review_work_item() returns trigger language plpgsql security definer as $sync$ begin return new; end $sync$");
  await sql("grant execute on function public.nexus_commercial_activation_contact_guard(uuid,text,timestamptz) to anon,authenticated");
  await sql("grant execute on function public.ensure_nexus_commercial_activation_work_item(uuid,text,timestamptz,text,text,text,text,text,integer,jsonb) to anon,authenticated");
  await sql("grant execute on function public.sync_email_admission_review_work_item() to anon,authenticated");
  await sql("grant usage on schema core to service_role");
  await sql("grant select on core.brands to service_role");
  await sql("grant select, insert, update on public.contacts to service_role");
  await sql("grant select, insert, update on public.work_items to service_role");
  await sql("grant select on public.search_discovery_events, public.automation_logs, public.corporate_prospects, public.corporate_partner_prospects, public.ad_campaigns to service_role");
  await sql("grant select on public.properties, public.property_brand_visibility, public.media_assets to service_role");
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
    "workspace_brand_property_catalogue", "workspace_staff_security_preflight",
    "workspace_brand_marketing_snapshot", "workspace_brand_marketing_draft_create",
    "workspace_brand_marketing_draft_create_v2",
    "workspace_brand_growth_snapshot", "workspace_brand_growth_work_create",
    "workspace_brand_content_snapshot", "workspace_brand_content_draft_save",
    "workspace_brand_content_publish_payload", "workspace_brand_content_publish_finalize",
    "workspace_brand_content_versions", "workspace_brand_content_restore_version",
    "workspace_brand_email_target_resolve", "workspace_brand_email_snapshot",
    "workspace_brand_email_inbox_snapshot", "workspace_brand_email_message_resolve",
    "workspace_brand_email_mark_read",
    "workspace_brand_email_draft_save", "workspace_brand_email_send_prepare",
    "workspace_brand_email_send_finalize",
    "workspace_brand_social_publish_snapshot", "workspace_brand_social_publish_prepare",
    "workspace_brand_social_publish_finalize", "workspace_user_configure_v2"]) {
    const grants = await sql(
      "select has_function_privilege('anon',p.oid,'EXECUTE') as anon, has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated, has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",
      [func],
    );
    verify(!grants.rows[0].anon && !grants.rows[0].authenticated && grants.rows[0].service,
      func + ": privileged execute grant leaked");
  }
  for (const table of ["brand_workspace_memberships", "brand_workspace_membership_audit",
    "brand_workspace_access_plans", "brand_workspace_access_plan_audit",
    "workspace_user_directory", "workspace_user_directory_audit",
    "zeneco_joint_lead_cohort", "zeneco_joint_lead_review_audit",
    "zeneco_joint_contact_edit_audit", "zeneco_joint_work_items",
    "brand_workspace_contact_write_audit", "brand_workspace_marketing_draft_audit",
    "brand_workspace_growth_work_audit",
    "brand_workspace_content_drafts", "brand_workspace_content_versions",
    "brand_workspace_email_drafts", "brand_workspace_social_publish_attempts"]) {
    const rls = await sql("select relrowsecurity from pg_class where oid=$1::regclass", ["core." + table]);
    verify(rls.rows[0]?.relrowsecurity === true, table + " must use RLS");
  }
  for (const auditTable of ["zeneco_joint_lead_review_audit", "zeneco_joint_contact_edit_audit",
    "brand_workspace_contact_write_audit", "brand_workspace_marketing_draft_audit",
    "brand_workspace_growth_work_audit"]) {
    const privileges = await sql(
      "select has_table_privilege('service_role',$1,'SELECT') as sel, has_table_privilege('service_role',$1,'INSERT') as ins, has_table_privilege('service_role',$1,'UPDATE') as upd, has_table_privilege('service_role',$1,'DELETE') as del",
      ["core." + auditTable],
    );
    verify(privileges.rows[0].sel && privileges.rows[0].ins &&
      !privileges.rows[0].upd && !privileges.rows[0].del,
      auditTable + " must be append-only for service_role");
  }
  const contentDraftPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_content_drafts','SELECT') as sel, " +
    "has_table_privilege('service_role','core.brand_workspace_content_drafts','INSERT') as ins, " +
    "has_table_privilege('service_role','core.brand_workspace_content_drafts','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.brand_workspace_content_drafts','DELETE') as del",
  );
  verify(contentDraftPrivileges.rows[0].sel && contentDraftPrivileges.rows[0].ins &&
    contentDraftPrivileges.rows[0].upd && !contentDraftPrivileges.rows[0].del,
    "Content drafts must be editable but never hard-deletable by service_role");
  const contentVersionPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_content_versions','SELECT') as sel, " +
    "has_table_privilege('service_role','core.brand_workspace_content_versions','INSERT') as ins, " +
    "has_table_privilege('service_role','core.brand_workspace_content_versions','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.brand_workspace_content_versions','DELETE') as del",
  );
  verify(contentVersionPrivileges.rows[0].sel && contentVersionPrivileges.rows[0].ins &&
    !contentVersionPrivileges.rows[0].upd && !contentVersionPrivileges.rows[0].del,
    "Content versions must be append-only for service_role");

  const emailDraftPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_email_drafts','SELECT') as sel, " +
    "has_table_privilege('service_role','core.brand_workspace_email_drafts','INSERT') as ins, " +
    "has_table_privilege('service_role','core.brand_workspace_email_drafts','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.brand_workspace_email_drafts','DELETE') as del",
  );
  verify(emailDraftPrivileges.rows[0].sel && emailDraftPrivileges.rows[0].ins &&
    emailDraftPrivileges.rows[0].upd && !emailDraftPrivileges.rows[0].del,
    "Email drafts must be editable but never hard-deletable by service_role");

  const socialPublishPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_social_publish_attempts','SELECT') as sel, " +
    "has_table_privilege('service_role','core.brand_workspace_social_publish_attempts','INSERT') as ins, " +
    "has_table_privilege('service_role','core.brand_workspace_social_publish_attempts','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.brand_workspace_social_publish_attempts','DELETE') as del",
  );
  verify(socialPublishPrivileges.rows[0].sel && socialPublishPrivileges.rows[0].ins &&
    socialPublishPrivileges.rows[0].upd && !socialPublishPrivileges.rows[0].del,
    "Social publish attempts must be auditable but never hard-deletable by service_role");

  const planAuditPrivileges = await sql(
    "select has_table_privilege('service_role','core.brand_workspace_access_plan_audit','SELECT') as sel, has_table_privilege('service_role','core.brand_workspace_access_plan_audit','INSERT') as ins, has_table_privilege('service_role','core.brand_workspace_access_plan_audit','UPDATE') as upd, has_table_privilege('service_role','core.brand_workspace_access_plan_audit','DELETE') as del",
  );
  verify(planAuditPrivileges.rows[0].sel && !planAuditPrivileges.rows[0].ins &&
    !planAuditPrivileges.rows[0].upd && !planAuditPrivileges.rows[0].del,
    "brand_workspace_access_plan_audit must be trigger-owned and read-only to service_role");
  await sql("insert into auth.users(id,email) values ($1,'staff@example.test')", [member]);
  await sql("insert into auth.users(id,email) values ($1,'managed@example.test')", [managedUser]);
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
  const legacyTasks = await sql("select count(*)::int as total from public.work_items");
  verify(legacyTasks.rows[0].total === 0,
    "Joint task create/complete must never insert into legacy public.work_items");
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
  const readBrandProperties = (search = "") => serviceSql(
    "select public.workspace_brand_property_catalogue($1::text,$2::uuid,$3::text,$4::integer,$5::text) as result",
    ["pinosoecolife", member, "staff@example.test", 0, search],
  ).then(r => r.rows[0].result);
  verify(await readBrandContacts() === null,
    "Pinoso CRM was readable without an active Pinoso membership");
  verify(await readBrandProperties() === null,
    "Pinoso property catalogue was readable without an active Pinoso membership");
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
  verify(await readBrandProperties() === null,
    "CRM-only Pinoso membership read the property catalogue without its own permission");
  await sql(
    "update core.brand_workspace_memberships set permissions=array['crm.read','crm.write','properties.catalog.read']::text[] where brand_id=$1 and user_id=$2",
    [pinoso, member],
  );

  const pinosoProperty = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const zenProperty = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const hiddenProperty = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const overrideHiddenProperty = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
  await sql(
    "insert into public.properties(id,ref,title,town,location,price,bedrooms,bathrooms,area_m2,plot_size,property_type,primary_image,created_at,show_on_website,website_visible) values " +
    "($1,'PIN-1','Pinoso Villa','Pinoso','Alicante',365000,3,2,180,10000,'villa','https://example.test/p1.jpg',$5,true,true)," +
    "($2,'ZEN-1','Coastal Villa','Altea','Alicante',850000,4,3,260,1200,'villa','https://example.test/p2.jpg',$5,true,true)," +
    "($3,'PIN-HIDDEN','Hidden Pinoso','Pinoso','Alicante',300000,3,2,170,9000,'villa','https://example.test/p3.jpg',$5,false,true)," +
    "($4,'PIN-OFF','Manual hidden Pinoso','Pinoso','Alicante',310000,3,2,175,9500,'villa','https://example.test/p4.jpg',$5,true,true)",
    [pinosoProperty, zenProperty, hiddenProperty, overrideHiddenProperty, newer],
  );
  await sql(
    "insert into public.property_brand_visibility(property_id,brand_id,visible) values " +
    "($1,'pinosoecolife',true),($2,'zeneco',true),($3,'pinosoecolife',true),($4,'pinosoecolife',false)",
    [pinosoProperty, zenProperty, hiddenProperty, overrideHiddenProperty],
  );
  const scopedProperties = await readBrandProperties();
  verify(scopedProperties?.properties?.length === 3 &&
    scopedProperties.properties.some(row =>
      row.id === pinosoProperty &&
      row.title === "Pinoso Villa" &&
      row.can_market_on_workspace_brand === true &&
      row.marketable_by_brands.includes("pinosoecolife")) &&
    scopedProperties.properties.some(row =>
      row.id === zenProperty &&
      row.title === "Coastal Villa" &&
      row.can_market_on_workspace_brand === false &&
      row.marketable_by_brands.includes("zeneco")) &&
    scopedProperties.properties.some(row =>
      row.id === overrideHiddenProperty &&
      row.can_market_on_workspace_brand === false) &&
    !scopedProperties.properties.some(row => row.id === hiddenProperty) &&
    scopedProperties.hasMore === false,
    "Shared property catalogue failed safe all-inventory matching or brand marketing flags");
  const searchedProperties = await readBrandProperties("pinoso");
  verify(searchedProperties?.properties?.length === 2 &&
    searchedProperties.properties.some(row => row.id === pinosoProperty) &&
    searchedProperties.properties.some(row => row.id === overrideHiddenProperty) &&
    searchedProperties.properties.every(row => row.source === "redsp"),
    "Shared property catalogue search did not preserve public-only safe inventory");
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

  // Property catalogue reads also serialize with owner membership revocation.
  const pinosoPropertyBlocker = new Client({
    connectionString: localUrl,
    application_name: "isolated_pinoso_membership_revoke_property_race",
  });
  await pinosoPropertyBlocker.connect();
  let pendingPinosoProperties;
  let pinosoPropertyCommitted = false;
  try {
    await pinosoPropertyBlocker.query("begin");
    await pinosoPropertyBlocker.query(
      "select user_id from core.brand_workspace_memberships where brand_id=$1 and user_id=$2 for update",
      [pinoso, member],
    );
    pendingPinosoProperties = readBrandProperties().catch(error => error);
    let waiting = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await pinosoPropertyBlocker.query("select pg_sleep(0.05)");
      const state = await pinosoPropertyBlocker.query(
        "select wait_event_type from pg_stat_activity where pid=$1", [activePid],
      );
      if (state.rows[0]?.wait_event_type === "Lock") { waiting = true; break; }
    }
    verify(waiting, "Pinoso property catalogue did not serialize against membership revocation");
    await pinosoPropertyBlocker.query(
      "update core.brand_workspace_memberships set status='revoked' where brand_id=$1 and user_id=$2",
      [pinoso, member],
    );
    await pinosoPropertyBlocker.query("commit");
    pinosoPropertyCommitted = true;
    verify((await pendingPinosoProperties) === null,
      "Pinoso property catalogue returned inventory after employee membership was revoked");
  } finally {
    if (!pinosoPropertyCommitted) await pinosoPropertyBlocker.query("rollback").catch(() => undefined);
    await pinosoPropertyBlocker.end();
    if (pendingPinosoProperties) await pendingPinosoProperties.catch(() => undefined);
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
  verify(await readBrandProperties() === null,
    "Revoked Pinoso membership still read brand property catalogue");
  verify(await createBrandContact() === null,
    "Revoked Pinoso membership still created a customer");

  const staffSecurityPreflight = await serviceSql(
    "select public.workspace_staff_security_preflight() as result",
  );
  const security = staffSecurityPreflight.rows[0].result;
  verify(security?.required_customer_tables_rls === true &&
    security?.private_document_buckets_present === true &&
    security?.private_document_buckets_private === true,
    "Staff security preflight did not validate required RLS/private buckets");
  verify(security?.private_document_authenticated_policies === 0 &&
    security?.operational_storage_authenticated_write_policies === 0 &&
    security?.direct_customer_policy_risk === 0 &&
    security?.direct_internal_policy_risk === 0 &&
    security?.direct_security_definer_risk === 0 &&
    security?.safe_for_workspace_auth === true,
    "Identity-bound Olivia Storage plus server-only hardening should satisfy the workspace Auth preflight");
  const removedPolicies = await sql(
    "select policyname from pg_policies where (schemaname='public' and policyname in ('agentic_approvals_read','plot_assets authenticated full access')) or " +
    "(schemaname='storage' and policyname in ('Authenticated write plot-assets','Authenticated delete plot-assets','Authenticated write ad-creatives'))",
  );
  verify(removedPolicies.rowCount === 0,
    "Server-only Auth hardening migration left a broad direct policy behind");

  const unsafeSecurityDefinerGrants = await sql(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace " +
    "where n.nspname='public' and p.proname in ('nexus_commercial_activation_contact_guard','ensure_nexus_commercial_activation_work_item','sync_email_admission_review_work_item') " +
    "and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))",
  );
  verify(unsafeSecurityDefinerGrants.rowCount === 0,
    "Workspace hardening left a server/trigger-only SECURITY DEFINER callable by browser roles");

  const oliviaStoragePolicies = await sql(
    "select policyname,cmd,coalesce(qual,'') as qual,coalesce(with_check,'') as with_check from pg_policies " +
    "where schemaname='storage' and tablename='objects' and (" +
    "coalesce(qual,'') ilike any(array['%property-documents%','%caecv-documents%','%olivia-field-observations%']) or " +
    "coalesce(with_check,'') ilike any(array['%property-documents%','%caecv-documents%','%olivia-field-observations%']))",
  );
  verify(oliviaStoragePolicies.rowCount === 11 &&
    oliviaStoragePolicies.rows.every(row =>
      (!["ALL","SELECT","UPDATE","DELETE"].includes(row.cmd) || row.qual.includes("olivia_private.is_internal_user")) &&
      (!["ALL","INSERT","UPDATE"].includes(row.cmd) || row.with_check.includes("olivia_private.is_internal_user"))),
    "Every retained Olivia direct-Auth Storage policy must require the internal-user gate");

  const oliviaInternal = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await sql("insert into olivia.user_profiles(id,role) values ($1,'super_admin')", [oliviaInternal]);
  await sql("set role authenticated");
  let workspaceDocumentWriteBlocked = false;
  let workspaceObservationWriteBlocked = false;
  try {
    await sql("select set_config('request.jwt.claim.sub',$1,false)", [oliviaInternal]);
    await sql("insert into storage.objects(bucket_id) values ('property-documents'),('olivia-field-observations')");
    const internalVisible = await sql(
      "select count(*)::int as total from storage.objects where bucket_id='property-documents'",
    );
    verify(internalVisible.rows[0].total === 1,
      "Existing Olivia internal user lost private document Storage read/write access");

    await sql("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    const workspaceVisible = await sql(
      "select count(*)::int as total from storage.objects where bucket_id='property-documents'",
    );
    verify(workspaceVisible.rows[0].total === 0,
      "Workspace identity could directly read Olivia private documents");
    try {
      await sql("insert into storage.objects(bucket_id) values ('property-documents')");
    } catch (error) {
      workspaceDocumentWriteBlocked = /row-level security|policy/i.test(String(error?.message || error));
    }
    try {
      await sql("insert into storage.objects(bucket_id) values ('olivia-field-observations')");
    } catch (error) {
      workspaceObservationWriteBlocked = /row-level security|policy/i.test(String(error?.message || error));
    }
    verify(workspaceDocumentWriteBlocked && workspaceObservationWriteBlocked,
      "Workspace identity could directly write an Olivia Storage surface");
  } finally {
    await sql("reset role");
    await sql("select set_config('request.jwt.claim.sub','',false)");
  }


  // Owner-managed username/password access module. Passwords remain entirely
  // outside SQL; directory/configuration only stores identity and permissions.
  const directoryColumns = await sql(
    "select column_name from information_schema.columns where table_schema='core' and table_name='workspace_user_directory'",
  );
  verify(!directoryColumns.rows.some(row =>
    ["password","password_hash","secret","token"].includes(row.column_name)),
    "Workspace user directory must never store password material");
  const directoryAuditColumns = await sql(
    "select column_name from information_schema.columns where table_schema='core' and table_name='workspace_user_directory_audit'",
  );
  verify(!directoryAuditColumns.rows.some(row =>
    ["password","password_hash","secret","token"].includes(row.column_name)),
    "Workspace user audit must never store password material");

  const directoryPrivileges = await sql(
    "select has_table_privilege('service_role','core.workspace_user_directory','SELECT') as sel, " +
    "has_table_privilege('service_role','core.workspace_user_directory','INSERT') as ins, " +
    "has_table_privilege('service_role','core.workspace_user_directory','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.workspace_user_directory','DELETE') as del",
  );
  verify(directoryPrivileges.rows[0].sel && directoryPrivileges.rows[0].ins &&
    directoryPrivileges.rows[0].upd && !directoryPrivileges.rows[0].del,
    "Workspace directory must be lifecycle-updatable but never hard-deletable by service_role");
  const directoryAuditPrivileges = await sql(
    "select has_table_privilege('service_role','core.workspace_user_directory_audit','SELECT') as sel, " +
    "has_table_privilege('service_role','core.workspace_user_directory_audit','INSERT') as ins, " +
    "has_table_privilege('service_role','core.workspace_user_directory_audit','UPDATE') as upd, " +
    "has_table_privilege('service_role','core.workspace_user_directory_audit','DELETE') as del",
  );
  verify(directoryAuditPrivileges.rows[0].sel && !directoryAuditPrivileges.rows[0].ins &&
    !directoryAuditPrivileges.rows[0].upd && !directoryAuditPrivileges.rows[0].del,
    "Workspace directory audit must be read-only to service_role");

  const configureManaged = async (brandAccess, username = "andrea.test") => {
    const result = await serviceSql(
      "select public.workspace_user_configure($1::uuid,$2::text,$3::text,$4::text,$5::jsonb,$6::text) as ok",
      [managedUser, username, "managed@example.test", "Managed Workspace User",
        JSON.stringify(brandAccess), "owner@example.test"],
    );
    return result.rows[0].ok;
  };
  verify(await configureManaged([
    { brandKey: "pinosoecolife", permissions: ["crm.read","crm.write","properties.catalog.read"] },
    { brandKey: "zeneco", permissions: ["crm.joint.read","crm.joint.write","tasks.joint.read","tasks.joint.write","properties.catalog.read"] },
  ]) === true, "Valid multi-brand workspace user configuration failed");

  const managedDirectory = await serviceSql(
    "select public.workspace_login_directory($1::text) as result", ["andrea.test"],
  );
  verify(managedDirectory.rows[0].result?.user_id === managedUser &&
    managedDirectory.rows[0].result?.email === "managed@example.test" &&
    managedDirectory.rows[0].result?.status === "active",
    "Username login directory did not resolve the configured identity");
  const managedDirectoryByEmail = await serviceSql(
    "select public.workspace_login_directory($1::text) as result", ["managed@example.test"],
  );
  verify(managedDirectoryByEmail.rows[0].result?.username === "andrea.test",
    "Email login directory did not resolve the configured username");

  const configureExternal = async (expiresAt) => {
    const result = await serviceSql(
      "select public.workspace_user_configure_v2($1::uuid,$2::text,$3::text,$4::text,$5::jsonb,$6::text,$7::text,$8::text,$9::timestamptz) as ok",
      [managedUser, "andrea.test", "managed@example.test", "Managed Workspace User",
        JSON.stringify([{ brandKey: "pinosoecolife", permissions: ["crm.read","properties.catalog.read"] }]),
        "owner@example.test", "external", "Search Partner AS", expiresAt],
    );
    return result.rows[0].ok;
  };
  verify(await configureExternal("2099-12-31T23:59:59Z") === true,
    "External collaborator metadata configuration failed");
  const externalDirectory = await serviceSql(
    "select public.workspace_login_directory($1::text) as result", ["andrea.test"],
  );
  verify(externalDirectory.rows[0].result?.status === "active" &&
    externalDirectory.rows[0].result?.account_kind === "external" &&
    externalDirectory.rows[0].result?.organization === "Search Partner AS" &&
    externalDirectory.rows[0].result?.expired === false,
    "External collaborator directory metadata was not exposed safely");

  verify(await configureExternal("2020-01-01T00:00:00Z") === true,
    "Expired external collaborator fixture could not be configured");
  const expiredDirectory = await serviceSql(
    "select public.workspace_login_directory($1::text) as result", ["andrea.test"],
  );
  verify(expiredDirectory.rows[0].result?.status === "disabled" &&
    expiredDirectory.rows[0].result?.expired === true,
    "Expired external collaborator remained login-active");

  const restoreManaged = await serviceSql(
    "select public.workspace_user_configure_v2($1::uuid,$2::text,$3::text,$4::text,$5::jsonb,$6::text,$7::text,$8::text,$9::timestamptz) as ok",
    [managedUser, "andrea.test", "managed@example.test", "Managed Workspace User",
      JSON.stringify([
        { brandKey: "pinosoecolife", permissions: ["crm.read","crm.write","properties.catalog.read"] },
        { brandKey: "zeneco", permissions: ["crm.joint.read","crm.joint.write","tasks.joint.read","tasks.joint.write","properties.catalog.read"] },
      ]),
      "owner@example.test", "staff", null, null],
  );
  verify(restoreManaged.rows[0].ok === true, "Workspace user fixture restore failed");

  const managedMemberships = await sql(
    "select b.brand_key,m.status,m.permissions from core.brand_workspace_memberships m " +
    "join core.brands b on b.id=m.brand_id where m.user_id=$1 order by b.brand_key",
    [managedUser],
  );
  verify(managedMemberships.rowCount === 2 &&
    managedMemberships.rows.every(row => row.status === "active"),
    "Configured workspace user did not receive exactly two active brand memberships");
  const managedZen = managedMemberships.rows.find(row => row.brand_key === "zeneco");
  verify(managedZen?.permissions.includes("crm.joint.read") && !managedZen?.permissions.includes("crm.read"),
    "Zen managed user scope incorrectly inherited generic CRM");

  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["crm.read"] }]) === false,
    "Workspace user configure accepted generic Zen CRM");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.read"] }]) === true,
    "Workspace user configure rejected implemented marketing read access");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.draft"] }]) === false,
    "Workspace user configure accepted marketing draft without read access");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.read","marketing.draft"] }]) === true,
    "Workspace user configure rejected implemented marketing draft access");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.publish"] }]) === false,
    "Workspace user configure accepted social publishing without marketing read/draft");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.read","marketing.publish"] }]) === false,
    "Workspace user configure accepted social publishing without marketing draft");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.read","marketing.draft","marketing.publish"] }]) === true,
    "Workspace user configure rejected complete social publishing scope");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["reels.create"] }]) === false,
    "Workspace user configure accepted Reel create without read");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["reels.read","reels.publish"] }]) === false,
    "Workspace user configure accepted Reel publish without create");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["reels.read","reels.create","reels.publish"] }]) === true,
    "Workspace user configure rejected complete Pinoso Reel scope");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["reels.read","reels.create"] }]) === true,
    "Workspace user configure rejected Zen Reel scope");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["youtube.publish"] }]) === false,
    "Workspace user configure accepted YouTube publish without read");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["youtube.read"] }]) === false,
    "Workspace user configure accepted phase-one YouTube access on Pinoso");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["youtube.read","youtube.publish"] }]) === true,
    "Workspace user configure rejected complete Zen YouTube scope");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["nexus.read"] }]) === true,
    "Workspace user configure rejected read-only Pinoso Nexus insight scope");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["nexus.read"] }]) === true,
    "Workspace user configure rejected read-only Zen Nexus insight scope");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["nexus.write"] }]) === false,
    "Workspace user configure accepted nonexistent Nexus write permission");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["marketing.read","marketing.draft","marketing.publish"] }]) === true,
    "Workspace user configure fixture did not restore marketing scope after Reel permission tests");

  await sql("insert into public.content_publications(brand_id,content_type,title,description,status) values ('pinosoecolife','social','Pinoso draft','Safe Pinoso content','draft'),('zeneco','social','Private Zen','Must not leak','published')");
  await sql("insert into public.social_channels(brand_id,platform,external_id,display_name,is_active) values ('pinosoecolife','facebook','fb-pinoso','Pinoso Facebook',true),('pinosoecolife','youtube','yt-pinoso','Pinoso YouTube',false),('zeneco','facebook','fb-zen','Zen Facebook',true)");
  const marketingSnapshot = await serviceSql(
    "select public.workspace_brand_marketing_snapshot($1::text,$2::uuid,$3::text) as result",
    ["pinosoecolife", managedUser, "managed@example.test"],
  );
  verify(marketingSnapshot.rows[0].result?.publications?.length === 1 &&
    marketingSnapshot.rows[0].result.publications[0].title === "Pinoso draft" &&
    marketingSnapshot.rows[0].result.channels?.length === 1 &&
    marketingSnapshot.rows[0].result.channels[0].platform === "facebook" &&
    !JSON.stringify(marketingSnapshot.rows[0].result).includes("Private Zen") &&
    !JSON.stringify(marketingSnapshot.rows[0].result).includes("fb-pinoso"),
    "Marketing snapshot leaked another brand or private channel identifier");

  const createdMarketingDraft = await serviceSql(
    "select public.workspace_brand_marketing_draft_create($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text[],$7::text[]) as result",
    ["pinosoecolife", managedUser, "managed@example.test", "Staff draft", "Draft only body",
      ["pinoso","villa"], ["facebook"]],
  );
  verify(createdMarketingDraft.rows[0].result?.ok === true &&
    createdMarketingDraft.rows[0].result?.publication?.brand_id === "pinosoecolife" &&
    createdMarketingDraft.rows[0].result?.publication?.status === "draft",
    "Scoped marketing draft creation failed or escaped draft status");
  const marketingAudit = await sql(
    "select count(*)::int as total from core.brand_workspace_marketing_draft_audit where actor_user_id=$1",
    [managedUser],
  );
  verify(marketingAudit.rows[0].total === 1,
    "Marketing draft audit did not record the managed workspace actor");

  const inactiveChannelDraft = await serviceSql(
    "select public.workspace_brand_marketing_draft_create($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text[],$7::text[]) as result",
    ["pinosoecolife", managedUser, "managed@example.test", "Blocked draft", "Inactive channel",
      [], ["youtube"]],
  );
  verify(inactiveChannelDraft.rows[0].result?.ok === false &&
    inactiveChannelDraft.rows[0].result?.error === "CHANNEL_NOT_ACTIVE_FOR_BRAND",
    "Marketing draft accepted an inactive brand channel");

  await sql(
    "insert into public.social_channels(brand_id,platform,external_id,display_name,is_active) values ('pinosoecolife','instagram','ig-pinoso','Pinoso Instagram',true)",
  );
  const pinosoFacebookId = (await sql(
    "select id from public.social_channels where brand_id='pinosoecolife' and platform='facebook' and is_active=true limit 1",
  )).rows[0].id;
  const pinosoInstagramId = (await sql(
    "select id from public.social_channels where brand_id='pinosoecolife' and platform='instagram' and is_active=true limit 1",
  )).rows[0].id;
  const zenFacebookId = (await sql(
    "select id from public.social_channels where brand_id='zeneco' and platform='facebook' and is_active=true limit 1",
  )).rows[0].id;
  const staffSocialDraftId = createdMarketingDraft.rows[0].result.publication.id;

  const instagramMissingImageDraft = await serviceSql(
    "select public.workspace_brand_marketing_draft_create_v2($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text[],$7::text[],$8::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test","Instagram missing image",
      "Image required test",[],["instagram"],null],
  );
  verify(instagramMissingImageDraft.rows[0].result?.ok === false &&
    instagramMissingImageDraft.rows[0].result?.error === "INSTAGRAM_IMAGE_REQUIRED",
    "Workspace marketing v2 accepted Instagram target without an image");

  const unapprovedInstagramDraft = await serviceSql(
    "select public.workspace_brand_marketing_draft_create_v2($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text[],$7::text[],$8::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test","Instagram foreign image",
      "Must reject unrelated media",[],["instagram"],"https://cdn.example.test/unapproved.jpg"],
  );
  verify(unapprovedInstagramDraft.rows[0].result?.ok === false &&
    unapprovedInstagramDraft.rows[0].result?.error === "IMAGE_NOT_APPROVED_FOR_BRAND",
    "Workspace marketing v2 accepted an arbitrary external image URL");

  const instagramDraft = await serviceSql(
    "select public.workspace_brand_marketing_draft_create_v2($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text[],$7::text[],$8::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test","Instagram with image",
      "Safe Instagram image post",[],["instagram"],"https://example.test/p1.jpg"],
  );
  const instagramDraftId = instagramDraft.rows[0].result?.publication?.id;
  verify(Boolean(instagramDraftId) &&
    instagramDraft.rows[0].result?.publication?.thumbnail_url === "https://example.test/p1.jpg",
    "Workspace marketing v2 did not persist the brand-approved Instagram image");

  const ownerSocialDraft = await sql(
    "insert into public.content_publications(brand_id,content_type,title,description,scheduled_platforms,status) values ('pinosoecolife','social','Owner same-brand draft','Staff must not publish this',array['facebook']::text[],'draft') returning id",
  );
  const ownerSocialDraftId = ownerSocialDraft.rows[0].id;
  const websiteDraft = await sql(
    "insert into public.content_publications(brand_id,content_type,title,description,status) values ('pinosoecolife','website_magazine','Private website draft','Must never reach social publisher','draft') returning id",
  );
  const websiteDraftId = websiteDraft.rows[0].id;
  const reelDraft = await sql(
    "insert into public.content_publications(brand_id,content_type,title,description,status) values ('pinosoecolife','reel','Separate Reels module','Must remain in Reels Studio','draft') returning id",
  );
  const reelDraftId = reelDraft.rows[0].id;

  const socialSnapshot = await serviceSql(
    "select public.workspace_brand_social_publish_snapshot($1::text,$2::uuid,$3::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test"],
  );
  verify(socialSnapshot.rows[0].result?.channels?.length === 2 &&
    socialSnapshot.rows[0].result.channels.every(row =>
      ["facebook","instagram"].includes(row.platform) && !("id" in row) && !("externalId" in row)) &&
    JSON.stringify(socialSnapshot.rows[0].result).includes(staffSocialDraftId) &&
    JSON.stringify(socialSnapshot.rows[0].result).includes(instagramDraftId) &&
    !JSON.stringify(socialSnapshot.rows[0].result).includes(ownerSocialDraftId) &&
    !JSON.stringify(socialSnapshot.rows[0].result).includes(websiteDraftId) &&
    !JSON.stringify(socialSnapshot.rows[0].result).includes(reelDraftId),
    "Social publish snapshot leaked unsupported content/channel identifiers or omitted safe draft");

  const sameBrandOwnerBlocked = await serviceSql(
    "select public.workspace_brand_social_publish_prepare($1::text,$2::uuid,$3::text,$4::uuid,$5::text[]) as result",
    ["pinosoecolife",managedUser,"managed@example.test",ownerSocialDraftId,["facebook"]],
  );
  verify(sameBrandOwnerBlocked.rows[0].result?.ok === false &&
    sameBrandOwnerBlocked.rows[0].result?.error === "PUBLICATION_NOT_PUBLISHABLE",
    "Workspace member could publish a same-brand draft they did not create");

  const preparedInstagram = await serviceSql(
    "select public.workspace_brand_social_publish_prepare($1::text,$2::uuid,$3::text,$4::uuid,$5::text[]) as result",
    ["pinosoecolife",managedUser,"managed@example.test",instagramDraftId,["instagram"]],
  );
  const instagramAttemptId = preparedInstagram.rows[0].result?.attemptId;
  verify(preparedInstagram.rows[0].result?.ok === true &&
    preparedInstagram.rows[0].result?.imageUrl === "https://example.test/p1.jpg" &&
    preparedInstagram.rows[0].result?.channels?.[0]?.platform === "instagram",
    "Safe own Instagram draft did not prepare with its server-approved image");
  const finalizedInstagram = await serviceSql(
    "select public.workspace_brand_social_publish_finalize($1::text,$2::uuid,$3::text,$4::uuid,$5::boolean,$6::jsonb,$7::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test",instagramAttemptId,true,
      JSON.stringify([{platform:"instagram",success:true,postUrl:"https://instagram.example.test/p/1"}]),null],
  );
  verify(finalizedInstagram.rows[0].result?.status === "published",
    "Prepared Instagram workspace post could not be finalized");

  for (const blockedPublicationId of [websiteDraftId,reelDraftId]) {
    const blocked = await serviceSql(
      "select public.workspace_brand_social_publish_prepare($1::text,$2::uuid,$3::text,$4::uuid,$5::text[]) as result",
      ["pinosoecolife",managedUser,"managed@example.test",blockedPublicationId,["facebook"]],
    );
    verify(blocked.rows[0].result?.ok === false &&
      blocked.rows[0].result?.error === "PUBLICATION_NOT_PUBLISHABLE",
      "Non-social content escaped into employee social publishing");
  }

  const preparedSocial = await serviceSql(
    "select public.workspace_brand_social_publish_prepare($1::text,$2::uuid,$3::text,$4::uuid,$5::text[]) as result",
    ["pinosoecolife",managedUser,"managed@example.test",staffSocialDraftId,["facebook"]],
  );
  const socialAttemptId = preparedSocial.rows[0].result?.attemptId;
  verify(preparedSocial.rows[0].result?.ok === true &&
    preparedSocial.rows[0].result?.content === "Draft only body" &&
    preparedSocial.rows[0].result?.channels?.length === 1 &&
    preparedSocial.rows[0].result.channels[0].id === pinosoFacebookId &&
    preparedSocial.rows[0].result.channels[0].id !== zenFacebookId &&
    !JSON.stringify(preparedSocial.rows[0].result).includes("fb-pinoso"),
    "Social publish preparation failed exact brand/channel resolution");

  const processingRow = await sql(
    "select status from public.content_publications where id=$1", [staffSocialDraftId],
  );
  verify(processingRow.rows[0].status === "processing",
    "Social publish prepare did not reserve publication before external action");

  const duplicatePrepare = await serviceSql(
    "select public.workspace_brand_social_publish_prepare($1::text,$2::uuid,$3::text,$4::uuid,$5::text[]) as result",
    ["pinosoecolife",managedUser,"managed@example.test",staffSocialDraftId,["facebook"]],
  );
  verify(duplicatePrepare.rows[0].result?.error === "PUBLISH_ATTEMPT_REQUIRES_REVIEW",
    "Unresolved publish attempt did not block blind retry");

  const failedSocial = await serviceSql(
    "select public.workspace_brand_social_publish_finalize($1::text,$2::uuid,$3::text,$4::uuid,$5::boolean,$6::jsonb,$7::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test",socialAttemptId,false,
      JSON.stringify([{platform:"facebook",success:false,error:"test failure"}]),"test failure"],
  );
  verify(failedSocial.rows[0].result?.status === "failed",
    "Failed social publish was not finalized as failed");

  const retrySocial = await serviceSql(
    "select public.workspace_brand_social_publish_prepare($1::text,$2::uuid,$3::text,$4::uuid,$5::text[]) as result",
    ["pinosoecolife",managedUser,"managed@example.test",staffSocialDraftId,["facebook"]],
  );
  verify(retrySocial.rows[0].result?.ok === false &&
    retrySocial.rows[0].result?.error === "PUBLICATION_NOT_PUBLISHABLE",
    "Failed external publish remained blindly retryable from the employee surface");

  const publishAttempts = await sql(
    "select status from core.brand_workspace_social_publish_attempts where publication_id=$1 order by created_at,id",
    [staffSocialDraftId],
  );
  verify(publishAttempts.rowCount === 1 && publishAttempts.rows[0].status === "failed",
    "Social publish audit did not preserve the failed one-shot attempt");

  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["corporate.read"] }]) === false,
    "Workspace user configure accepted Corporate Homes outside Zen Eco Homes");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["corporate.plan"] }]) === false,
    "Workspace user configure accepted Corporate planning without Corporate read");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["visibility.plan"] }]) === false,
    "Workspace user configure accepted visibility planning without visibility read");
  verify(await configureManaged([{ brandKey: "zeneco", permissions: ["ads.draft"] }]) === false,
    "Workspace user configure accepted ad drafting without ad read");

  verify(await configureManaged([{
    brandKey: "zeneco",
    permissions: [
      "corporate.read","corporate.plan",
      "visibility.read","visibility.plan",
      "ads.read","ads.draft","events.plan",
    ],
  }]) === true, "Valid Zen Corporate/Growth workspace configuration failed");

  await sql("insert into public.corporate_prospects(brand_id,company_name,organization_type,country_code,city,industry,status,fit_score,fit_tier,fit_reasons,evidence_gaps,decision_roles,source_url,evidence,next_action) values ('zeneco','Nordic Growth AS','company','NO','Oslo','Technology','RESEARCHED',88,'A',array['distributed workforce'],array['benefit policy'],array['HR','CEO'],'https://example.test/nordic',jsonb_build_object('generic_company_contact',jsonb_build_object('generic_email','company@example.test','company_level_only',true,'personal_data_collected',false)),'Verify employee-benefit fit')");
  await sql("insert into public.corporate_partner_prospects(brand_id,company_name,partner_type,country_code,city,status,fit_score,fit_tier,fit_reasons,evidence_gaps,referral_angle,evidence,next_action) values ('zeneco','Partner Advisory AS','management_consulting','NO','Bergen','DISCOVERED',75,'B',array['corporate clients'],array['Spain demand'],'Employee benefit introductions',jsonb_build_object('generic_company_contact',jsonb_build_object('generic_email','partner@example.test','company_level_only',true,'personal_data_collected',false)),'Prepare referral brief')");
  await sql("insert into public.search_discovery_events(brand_id,source,path,occurred_at) values ('zeneco','google','/bedriftshytte-spania',now()),('zeneco','chatgpt','/corporate-homes',now()),('pinosoecolife','google','/pinoso-private',now())");
  await sql("insert into public.automation_logs(action,agent_name,status,details) values ('seo_gsc_live_read','Sam SEO Expert','partial',jsonb_build_object('google_search_console',jsonb_build_array(jsonb_build_object('brandId','zeneco','status','error','error','ZEN_GSC_STATUS'),jsonb_build_object('brandId','pinosoecolife','status','success','result',jsonb_build_object('clicks',99))), 'diagnostics',jsonb_build_array(jsonb_build_object('brandId','zeneco','kind','check','title','Zen measurement','category','measurement','finding','ZEN_DIAGNOSTIC','evidence','zen-only evidence','nextStep','Reconnect GSC'),jsonb_build_object('brandId','pinosoecolife','kind','check','title','Private Pinoso','category','measurement','finding','PINOSO_PRIVATE_DIAGNOSTIC','evidence','private','nextStep','private'))))");
  await sql("insert into public.work_items(title,description,status,priority,brand_id,source_type,assigned_agent,next_action) values ('Zen SEO priority','Improve Corporate Homes landing page','TO_DO','HIGH','zeneco','ai_agent','seo','Add HR-benefit search intent'),('Private Pinoso SEO','Must not leak','TO_DO','HIGH','pinosoecolife','ai_agent','seo','Private next action')");
  await sql("insert into public.ad_campaigns(brand_id,name,product_name,target_markets,status,total_creatives,estimated_cost_usd,growth_goal) values ('zeneco','Corporate HR campaign','Zen Corporate Homes',array['Norway'],'completed',5,120,'lead_generation'),('pinosoecolife','Private Pinoso Ad','Pinoso EcoLife',array['Norway'],'completed',3,75,'lead_generation')");

  const growthSnapshot = await serviceSql(
    "select public.workspace_brand_growth_snapshot($1::text,$2::uuid,$3::text) as result",
    ["zeneco", managedUser, "managed@example.test"],
  );
  const growth = growthSnapshot.rows[0].result;
  verify(growth?.corporate?.prospects?.length === 1 &&
    growth.corporate.prospects[0].companyName === "Nordic Growth AS" &&
    growth?.corporate?.partners?.length === 1 &&
    growth?.visibility?.seoWork?.length === 1 &&
    growth.visibility.seoWork[0].title === "Zen SEO priority" &&
    growth?.ads?.length === 1 &&
    growth.ads[0].name === "Corporate HR campaign" &&
    growth?.visibility?.seoSam?.gsc?.error === "ZEN_GSC_STATUS" &&
    growth?.visibility?.seoSam?.diagnostics?.[0]?.finding === "ZEN_DIAGNOSTIC" &&
    !JSON.stringify(growth).includes("Private Pinoso") &&
    !JSON.stringify(growth).includes("PINOSO_PRIVATE_DIAGNOSTIC") &&
    !JSON.stringify(growth).includes('"clicks":99'),
    "Growth snapshot leaked another brand or omitted granted Zen modules");

  for (const [kind,title] of [
    ["corporate","Research Nordic Growth AS"],
    ["seo","SEO Corporate Homes"],
    ["ads","Ad brief Corporate Homes"],
    ["video","Corporate video concept"],
    ["info_meeting","HR information webinar"],
  ]) {
    const created = await serviceSql(
      "select public.workspace_brand_growth_work_create($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::date,$9::text,$10::text) as result",
      ["zeneco", managedUser, "managed@example.test", kind, title,
        "Internal planning only", "Prepare next internal step", "2026-10-15", "HIGH", "source-" + kind],
    );
    verify(created.rows[0].result?.kind === kind &&
      created.rows[0].result?.status === "TO_DO",
      "Growth planning failed for kind " + kind);
  }
  const growthRows = await sql(
    "select assigned_agent,status,metadata from public.work_items where metadata->>'workspace_growth'='true' order by created_at,id",
  );
  verify(growthRows.rowCount === 5 &&
    growthRows.rows.every(row =>
      row.status === "TO_DO" &&
      row.metadata?.external_action === false &&
      row.metadata?.publishing_action === false &&
      row.metadata?.ad_spend_action === false),
    "Growth work escaped internal planning-only boundaries");
  const growthAudit = await sql(
    "select count(*)::int as total from core.brand_workspace_growth_work_audit where actor_user_id=$1",
    [managedUser],
  );
  verify(growthAudit.rows[0].total === 5,
    "Growth planning audit did not record every employee-created work item");

  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["content.edit"] }]) === false,
    "Workspace user configure accepted content edit without read");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["content.read","content.publish"] }]) === false,
    "Workspace user configure accepted content publish without edit");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["content.read","content.edit","content.publish"] }]) === true,
    "Workspace user configure rejected valid content publishing scope");

  const savedContentDraft = await serviceSql(
    "select public.workspace_brand_content_draft_save($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::text,$14::text[],$15::text,$16::text[],$17::text,$18::uuid) as result",
    ["pinosoecolife", managedUser, "managed@example.test", null,
      "magasin", "Magasin", "/magasin", "magazine",
      "Living in Pinoso", "living-in-pinoso", "A practical guide",
      "# Living in Pinoso\n\nUseful content.", "", ["pinoso","inland"],
      "living in pinoso", ["pinoso villa","inland spain"], "Norwegian buyers", null],
  );
  const contentDraftId = savedContentDraft.rows[0].result?.id;
  verify(Boolean(contentDraftId) && savedContentDraft.rows[0].result?.slug === "living-in-pinoso",
    "Scoped website content draft save failed");

  const pinosoContentSnapshot = await serviceSql(
    "select public.workspace_brand_content_snapshot($1::text,$2::uuid,$3::text) as result",
    ["pinosoecolife", managedUser, "managed@example.test"],
  );
  verify(pinosoContentSnapshot.rows[0].result?.drafts?.length === 1 &&
    pinosoContentSnapshot.rows[0].result.drafts[0].title === "Living in Pinoso",
    "Content snapshot did not return exact-brand draft");

  const zenContentSnapshot = await serviceSql(
    "select public.workspace_brand_content_snapshot($1::text,$2::uuid,$3::text) as result",
    ["zeneco", managedUser, "managed@example.test"],
  );
  verify(zenContentSnapshot.rows[0].result === null,
    "Content snapshot ignored missing exact-brand permission");

  const publishPayload = await serviceSql(
    "select public.workspace_brand_content_publish_payload($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["pinosoecolife", managedUser, "managed@example.test", contentDraftId],
  );
  verify(publishPayload.rows[0].result?.title === "Living in Pinoso" &&
    publishPayload.rows[0].result?.version === 1,
    "Content publish preparation did not resolve exact draft or store version first");
  const preparedVersions = await serviceSql(
    "select public.workspace_brand_content_versions($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["pinosoecolife", managedUser, "managed@example.test", contentDraftId],
  );
  verify(preparedVersions.rows[0].result?.length === 1,
    "Content version must exist before any external website publish");

  const finalized = await serviceSql(
    "select public.workspace_brand_content_publish_finalize($1::text,$2::uuid,$3::text,$4::uuid,$5::boolean,$6::text) as result",
    ["pinosoecolife", managedUser, "managed@example.test", contentDraftId, true, null],
  );
  verify(finalized.rows[0].result?.ok === true && finalized.rows[0].result?.version === 1,
    "Content publish finalize did not create first version");

  const publishedContent = await sql(
    "select brand_id,status,title,content_features from public.content_publications where id=$1",
    [finalized.rows[0].result.publicationId],
  );
  verify(publishedContent.rowCount === 1 &&
    publishedContent.rows[0].brand_id === "pinosoecolife" &&
    publishedContent.rows[0].status === "published" &&
    publishedContent.rows[0].content_features?.workspace_content_draft_id === contentDraftId,
    "Content publish escaped brand or lost draft provenance");

  const versions = await serviceSql(
    "select public.workspace_brand_content_versions($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["pinosoecolife", managedUser, "managed@example.test", contentDraftId],
  );
  verify(versions.rows[0].result?.length === 1 && versions.rows[0].result[0].version === 1,
    "Published content version history missing");

  await serviceSql(
    "select public.workspace_brand_content_draft_save($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::text,$14::text[],$15::text,$16::text[],$17::text,$18::uuid) as result",
    ["pinosoecolife", managedUser, "managed@example.test", contentDraftId,
      "magasin", "Magasin", "/magasin", "magazine",
      "Changed title", "living-in-pinoso", "Changed summary", "Changed body", "",
      ["pinoso"], "changed keyword", [], "Norwegian buyers", finalized.rows[0].result.publicationId],
  );
  const restored = await serviceSql(
    "select public.workspace_brand_content_restore_version($1::text,$2::uuid,$3::text,$4::uuid,$5::integer) as result",
    ["pinosoecolife", managedUser, "managed@example.test", contentDraftId, 1],
  );
  verify(restored.rows[0].result?.title === "Living in Pinoso" &&
    restored.rows[0].result?.markdown.includes("Useful content") &&
    restored.rows[0].result?.restoredVersion === 1,
    "Content rollback did not restore the published snapshot to draft");

  const afterRestorePublication = await sql(
    "select title from public.content_publications where id=$1",
    [finalized.rows[0].result.publicationId],
  );
  verify(afterRestorePublication.rows[0].title === "Living in Pinoso",
    "Restoring a version changed the live publication before explicit publish");

  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["email.draft"] }]) === false,
    "Workspace user configure accepted email draft without email read");
  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["email.read","email.send"] }]) === false,
    "Workspace user configure accepted email send without draft");

  await sql("update public.contacts set email='pinoso.email@example.test',do_not_contact=false,email_suppressed=false where id=$1", [other]);
  verify(await configureManaged([{
    brandKey: "pinosoecolife",
    permissions: ["crm.read","email.read","email.draft","email.send"],
  }]) === true, "Valid Pinoso email workspace configuration failed");

  const pinosoEmailSnapshot = await serviceSql(
    "select public.workspace_brand_email_snapshot($1::text,$2::uuid,$3::text,$4::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test",""],
  );
  const pinosoEmailTargets = pinosoEmailSnapshot.rows[0].result?.targets || [];
  const validPinosoEmailIds = new Set((await sql(
    "select id::text as id from public.contacts where brand_id='pinosoecolife' and brand='pinosoecolife' " +
    "and email is not null and do_not_contact=false and email_suppressed=false",
  )).rows.map(row => row.id));
  verify(pinosoEmailTargets.some(row =>
      row.id === other && row.email === "pinoso.email@example.test") &&
    pinosoEmailTargets.length > 0 &&
    pinosoEmailTargets.every(row =>
      row.type === "lead" && validPinosoEmailIds.has(row.id)) &&
    !JSON.stringify(pinosoEmailSnapshot.rows[0].result).includes("New Zen") &&
    !JSON.stringify(pinosoEmailSnapshot.rows[0].result).includes("zeneco"),
    "Pinoso email snapshot leaked another brand or omitted exact-brand lead");

  const savedEmailDraft = await serviceSql(
    "select public.workspace_brand_email_draft_save($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::uuid,$7::text,$8::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test",null,"lead",other,
      "Pinoso follow-up","Useful exact-brand follow-up"],
  );
  const emailDraftId = savedEmailDraft.rows[0].result?.id;
  verify(Boolean(emailDraftId) &&
    savedEmailDraft.rows[0].result?.recipientEmail === "pinoso.email@example.test",
    "Pinoso email draft did not resolve recipient server-side");

  await sql("update public.contacts set email_suppressed=true where id=$1", [other]);
  const suppressedTarget = await serviceSql(
    "select public.workspace_brand_email_target_resolve($1::text,$2::uuid,$3::text,$4::text,$5::uuid) as result",
    ["pinosoecolife",managedUser,"managed@example.test","lead",other],
  );
  verify(suppressedTarget.rows[0].result === null,
    "Suppressed CRM recipient remained a valid workspace email target");
  await sql("update public.contacts set email_suppressed=false where id=$1", [other]);

  const preparedEmail = await serviceSql(
    "select public.workspace_brand_email_send_prepare($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["pinosoecolife",managedUser,"managed@example.test",emailDraftId],
  );
  verify(preparedEmail.rows[0].result?.recipientEmail === "pinoso.email@example.test" &&
    preparedEmail.rows[0].result?.targetId === other,
    "Email send preparation did not re-resolve exact target");
  const failedFinalize = await serviceSql(
    "select public.workspace_brand_email_send_finalize($1::text,$2::uuid,$3::text,$4::uuid,$5::boolean,$6::text,$7::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test",emailDraftId,false,null,"SMTP test failure"],
  );
  verify(failedFinalize.rows[0].result?.status === "failed",
    "Failed email send was not recorded as failed");

  const preparedRetry = await serviceSql(
    "select public.workspace_brand_email_send_prepare($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["pinosoecolife",managedUser,"managed@example.test",emailDraftId],
  );
  verify(Boolean(preparedRetry.rows[0].result), "Failed email draft could not be safely retried");
  const sentFinalize = await serviceSql(
    "select public.workspace_brand_email_send_finalize($1::text,$2::uuid,$3::text,$4::uuid,$5::boolean,$6::text,$7::text) as result",
    ["pinosoecolife",managedUser,"managed@example.test",emailDraftId,true,"<test@example.test>",null],
  );
  verify(sentFinalize.rows[0].result?.status === "sent",
    "Successful email send was not finalized");

  verify(await configureManaged([{
    brandKey: "zeneco",
    permissions: ["corporate.read","email.read","email.draft","email.send"],
  }]) === true, "Valid Zen Corporate email workspace configuration failed");
  const zenEmailSnapshot = await serviceSql(
    "select public.workspace_brand_email_snapshot($1::text,$2::uuid,$3::text,$4::text) as result",
    ["zeneco",managedUser,"managed@example.test",""],
  );
  verify(zenEmailSnapshot.rows[0].result?.targets?.length === 2 &&
    zenEmailSnapshot.rows[0].result.targets.every(row => ["corporate","partner"].includes(row.type)) &&
    JSON.stringify(zenEmailSnapshot.rows[0].result).includes("company@example.test") &&
    JSON.stringify(zenEmailSnapshot.rows[0].result).includes("partner@example.test") &&
    !JSON.stringify(zenEmailSnapshot.rows[0].result).includes("pinoso.email@example.test"),
    "Zen Corporate email scope leaked Pinoso or omitted verified company-level channels");

  const corporateId = (await sql(
    "select id from public.corporate_prospects where company_name='Nordic Growth AS'",
  )).rows[0].id;
  const corporateDraft = await serviceSql(
    "select public.workspace_brand_email_draft_save($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::uuid,$7::text,$8::text) as result",
    ["zeneco",managedUser,"managed@example.test",null,"corporate",corporateId,
      "Employee benefit concept","A short company-level introduction"],
  );
  verify(corporateDraft.rows[0].result?.recipientEmail === "company@example.test",
    "Zen Corporate draft did not use verified generic company channel");

  verify(await configureManaged([{ brandKey: "pinosoecolife", permissions: ["crm.joint.read"] }]) === false,
    "Workspace user configure accepted Zen-only scope on Pinoso");

  const snapshot = await serviceSql("select public.workspace_user_admin_snapshot() as result");
  const managedSnapshot = snapshot.rows[0].result?.users?.find(user => user.user_id === managedUser);
  verify(managedSnapshot?.username === "andrea.test" &&
    Array.isArray(managedSnapshot?.memberships) &&
    !JSON.stringify(managedSnapshot).toLowerCase().includes("password"),
    "Owner workspace user snapshot missing identity/memberships or leaked password data");

  const disabled = await serviceSql(
    "select public.workspace_user_disable($1::uuid,$2::text) as ok",
    [managedUser, "owner@example.test"],
  );
  verify(disabled.rows[0].ok === true, "Owner could not disable managed workspace user");
  const disabledDirectory = await serviceSql(
    "select public.workspace_login_directory($1::text) as result", ["andrea.test"],
  );
  verify(disabledDirectory.rows[0].result?.status === "disabled",
    "Disabled workspace user remained active in login directory");
  const disabledMemberships = await sql(
    "select count(*)::int as total from core.brand_workspace_memberships where user_id=$1 and status='active'",
    [managedUser],
  );
  verify(disabledMemberships.rows[0].total === 0,
    "Disabling workspace user did not revoke every brand membership");
  const directoryAudit = await sql(
    "select action,new_status from core.workspace_user_directory_audit where user_id=$1 order by at,id",
    [managedUser],
  );
  verify(directoryAudit.rowCount >= 2 &&
    directoryAudit.rows[0].action === "created" &&
    directoryAudit.rows[directoryAudit.rows.length - 1]?.new_status === "disabled",
    "Workspace user lifecycle audit did not preserve create/disable history");

  process.stdout.write("Isolated workspace migration checks passed: " + checks + "\n");
} finally {
  await client.end();
}
