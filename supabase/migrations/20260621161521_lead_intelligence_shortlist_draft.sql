-- Lead Intelligence shortlist draft foundation.
--
-- This migration is additive and intentionally does not create presentations,
-- email drafts, sent emails, leads, contacts, property matching jobs, or any
-- customer-facing side effect. Shortlists are server-mediated draft records only.

create extension if not exists pgcrypto;

do $$
declare
  marker text := 'Lead Intelligence shortlist draft foundation v1';
  target_table text;
begin
  foreach target_table in array array[
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'LEAD_INTELLIGENCE_SHORTLIST_SCHEMA_NOT_READY: required PR 3A table public.% is missing', target_table;
    end if;
  end loop;

  if to_regprocedure('public.set_lead_intelligence_updated_at()') is null then
    raise exception 'LEAD_INTELLIGENCE_SHORTLIST_SCHEMA_NOT_READY: public.set_lead_intelligence_updated_at() is missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
    raise exception 'LEAD_INTELLIGENCE_SHORTLIST_RUNTIME_ROLE_MISSING: runtime RLS must be active before shortlist draft access';
  end if;

  foreach target_table in array array[
    'lead_property_shortlists',
    'lead_property_shortlist_items'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
       and coalesce(obj_description(format('public.%I', target_table)::regclass, 'pg_class'), '') <> marker then
      raise exception 'LEAD_INTELLIGENCE_SHORTLIST_SCHEMA_INCOMPATIBLE: public.% already exists without reviewed marker', target_table;
    end if;
  end loop;
end $$;

create table if not exists public.lead_property_shortlists (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  buyer_profile_id uuid not null references public.buyer_profiles(id) on delete cascade,
  status text not null default 'draft',
  title text,
  idempotency_key text not null,
  payload_hash text not null,
  correlation_id text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_property_shortlists_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint lead_property_shortlists_status_check
    check (status in ('draft', 'approved', 'archived')),
  constraint lead_property_shortlists_idempotency_key_check
    check (length(idempotency_key) between 12 and 128),
  constraint lead_property_shortlists_payload_hash_check
    check (payload_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint lead_property_shortlists_correlation_id_check
    check (length(correlation_id) between 1 and 128),
  constraint lead_property_shortlists_approval_check
    check (
      (status = 'approved' and approved_by is not null and approved_at is not null and archived_at is null)
      or (status = 'draft' and approved_by is null and approved_at is null and archived_at is null)
      or (status = 'archived' and approved_by is null and approved_at is null and archived_at is not null)
    ),
  constraint lead_property_shortlists_brand_id_key unique (id, brand),
  constraint lead_property_shortlists_brand_idempotency_key_key unique (brand, idempotency_key)
);

create table if not exists public.lead_property_shortlist_items (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.lead_property_shortlists(id) on delete cascade,
  brand text not null,
  property_id uuid not null,
  property_reference text,
  property_title text,
  property_location text,
  property_price numeric,
  property_bedrooms numeric,
  property_bathrooms numeric,
  property_primary_image_url text,
  property_public_url text,
  rank integer not null,
  decision text not null,
  system_eligibility text not null,
  score integer not null,
  data_quality_score integer not null,
  reasons jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  questions_to_verify jsonb not null default '[]'::jsonb,
  selected_by text not null,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint lead_property_shortlist_items_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint lead_property_shortlist_items_rank_check
    check (rank > 0 and rank <= 20),
  constraint lead_property_shortlist_items_decision_check
    check (decision in ('current', 'maybe', 'needs_research')),
  constraint lead_property_shortlist_items_eligibility_check
    check (system_eligibility in ('eligible', 'conditional', 'rejected')),
  constraint lead_property_shortlist_items_score_check
    check (
      score between 0 and 100
      and data_quality_score between 0 and 100
    ),
  constraint lead_property_shortlist_items_json_shape_check
    check (
      jsonb_typeof(reasons) = 'array'
      and jsonb_typeof(concerns) = 'array'
      and jsonb_typeof(questions_to_verify) = 'array'
      and jsonb_array_length(reasons) <= 20
      and jsonb_array_length(concerns) <= 20
      and jsonb_array_length(questions_to_verify) <= 20
    ),
  constraint lead_property_shortlist_items_brand_shortlist_fkey
    foreign key (shortlist_id, brand) references public.lead_property_shortlists(id, brand) on delete cascade,
  constraint lead_property_shortlist_items_shortlist_property_key unique (shortlist_id, property_id),
  constraint lead_property_shortlist_items_shortlist_rank_key unique (shortlist_id, rank)
);

create index if not exists idx_lead_property_shortlists_brand_status_created
  on public.lead_property_shortlists (brand, status, created_at desc);
create index if not exists idx_lead_property_shortlists_profile
  on public.lead_property_shortlists (buyer_profile_id, created_at desc);
create index if not exists idx_lead_property_shortlist_items_shortlist_rank
  on public.lead_property_shortlist_items (shortlist_id, rank);
create index if not exists idx_lead_property_shortlist_items_property
  on public.lead_property_shortlist_items (property_id, created_at desc);

alter table public.lead_property_shortlists enable row level security;
alter table public.lead_property_shortlist_items enable row level security;

revoke all on public.lead_property_shortlists from public, anon, authenticated;
revoke all on public.lead_property_shortlist_items from public, anon, authenticated;

grant select, insert, update, delete on public.lead_property_shortlists to service_role;
grant select, insert, update, delete on public.lead_property_shortlist_items to service_role;

revoke all on public.lead_property_shortlists from realtyflow_lead_intelligence_runtime;
revoke all on public.lead_property_shortlist_items from realtyflow_lead_intelligence_runtime;
grant select, insert on public.lead_property_shortlists to realtyflow_lead_intelligence_runtime;
grant select, insert on public.lead_property_shortlist_items to realtyflow_lead_intelligence_runtime;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.lead_property_shortlists'::regclass
      and tgname = 'trg_lead_property_shortlists_updated_at'
  ) then
    create trigger trg_lead_property_shortlists_updated_at
      before update on public.lead_property_shortlists
      for each row execute function public.set_lead_intelligence_updated_at();
  end if;
end $$;

drop policy if exists lead_property_shortlists_runtime_select on public.lead_property_shortlists;
create policy lead_property_shortlists_runtime_select
  on public.lead_property_shortlists
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists lead_property_shortlists_runtime_insert on public.lead_property_shortlists;
create policy lead_property_shortlists_runtime_insert
  on public.lead_property_shortlists
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and exists (
      select 1
      from public.buyer_profiles profile
      where profile.id = lead_property_shortlists.buyer_profile_id
        and profile.brand = lead_property_shortlists.brand
        and profile.status = 'approved'
    )
  );

drop policy if exists lead_property_shortlist_items_runtime_select on public.lead_property_shortlist_items;
create policy lead_property_shortlist_items_runtime_select
  on public.lead_property_shortlist_items
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    exists (
      select 1
      from public.lead_property_shortlists shortlist
      where shortlist.id = lead_property_shortlist_items.shortlist_id
        and shortlist.brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    )
  );

drop policy if exists lead_property_shortlist_items_runtime_insert on public.lead_property_shortlist_items;
create policy lead_property_shortlist_items_runtime_insert
  on public.lead_property_shortlist_items
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and exists (
      select 1
      from public.lead_property_shortlists shortlist
      where shortlist.id = lead_property_shortlist_items.shortlist_id
        and shortlist.brand = lead_property_shortlist_items.brand
    )
  );

comment on table public.lead_property_shortlists is 'Lead Intelligence shortlist draft foundation v1';
comment on table public.lead_property_shortlist_items is 'Lead Intelligence shortlist draft foundation v1';
comment on policy lead_property_shortlists_runtime_select on public.lead_property_shortlists is
  'Lead Intelligence runtime can select shortlist drafts only for server-validated app.lead_intelligence_brand.';
comment on policy lead_property_shortlists_runtime_insert on public.lead_property_shortlists is
  'Lead Intelligence runtime can insert shortlist drafts only for approved buyer profiles in the server-validated brand.';
comment on policy lead_property_shortlist_items_runtime_select on public.lead_property_shortlist_items is
  'Lead Intelligence runtime can select shortlist items only through brand-matching shortlists.';
comment on policy lead_property_shortlist_items_runtime_insert on public.lead_property_shortlist_items is
  'Lead Intelligence runtime can insert shortlist items only through brand-matching shortlists.';

do $$
begin
  if has_table_privilege('anon', 'public.lead_property_shortlists', 'select')
     or has_table_privilege('authenticated', 'public.lead_property_shortlists', 'select')
     or has_table_privilege('anon', 'public.lead_property_shortlist_items', 'select')
     or has_table_privilege('authenticated', 'public.lead_property_shortlist_items', 'select')
     or exists (
       select 1
       from pg_class c
       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
       where c.oid in (
         'public.lead_property_shortlists'::regclass,
         'public.lead_property_shortlist_items'::regclass
       )
         and acl.grantee = 0
         and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     ) then
    raise exception 'LEAD_INTELLIGENCE_SHORTLIST_PRIVILEGE_DRIFT: browser/public roles must not have shortlist table access';
  end if;

  if has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlists', 'delete')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'delete')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'update') then
    raise exception 'LEAD_INTELLIGENCE_SHORTLIST_PRIVILEGE_DRIFT: runtime role has unsafe shortlist privileges';
  end if;
end $$;
