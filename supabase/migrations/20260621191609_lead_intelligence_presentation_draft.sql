-- Lead Intelligence presentation draft foundation.
--
-- This migration is additive and draft-only. It creates internal customer
-- presentation and message draft records after a Freddy-approved shortlist.
-- It intentionally does not send email, create leads/contacts, publish a
-- presentation, start property matching jobs, or expose browser access.

create extension if not exists pgcrypto;

do $$
declare
  marker text := 'Lead Intelligence presentation draft foundation v1';
  required_table text;
begin
  foreach required_table in array array[
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates',
    'lead_property_shortlists',
    'lead_property_shortlist_items'
  ] loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'LEAD_INTELLIGENCE_PRESENTATION_SCHEMA_NOT_READY: required table public.% is missing', required_table;
    end if;
  end loop;

  if coalesce(obj_description('public.lead_property_shortlists'::regclass, 'pg_class'), '') <> 'Lead Intelligence shortlist draft foundation v1'
     or coalesce(obj_description('public.lead_property_shortlist_items'::regclass, 'pg_class'), '') <> 'Lead Intelligence shortlist draft foundation v1' then
    raise exception 'LEAD_INTELLIGENCE_PRESENTATION_SCHEMA_INCOMPATIBLE: reviewed shortlist draft schema is required';
  end if;

  if to_regprocedure('public.set_lead_intelligence_updated_at()') is null then
    raise exception 'LEAD_INTELLIGENCE_PRESENTATION_SCHEMA_NOT_READY: public.set_lead_intelligence_updated_at() is missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
    raise exception 'LEAD_INTELLIGENCE_PRESENTATION_RUNTIME_ROLE_MISSING: runtime RLS must be active before presentation draft access';
  end if;

  foreach required_table in array array[
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  ] loop
    if to_regclass(format('public.%I', required_table)) is not null
       and coalesce(obj_description(format('public.%I', required_table)::regclass, 'pg_class'), '') <> marker then
      raise exception 'LEAD_INTELLIGENCE_PRESENTATION_SCHEMA_INCOMPATIBLE: public.% already exists without reviewed marker', required_table;
    end if;
  end loop;
end $$;

create table if not exists public.lead_customer_presentations (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  buyer_profile_id uuid not null references public.buyer_profiles(id) on delete cascade,
  shortlist_id uuid not null references public.lead_property_shortlists(id) on delete cascade,
  status text not null default 'draft',
  title text not null,
  presentation_json jsonb not null,
  idempotency_key text not null,
  payload_hash text not null,
  correlation_id text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_customer_presentations_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint lead_customer_presentations_status_check
    check (status in ('draft', 'approved', 'archived')),
  constraint lead_customer_presentations_title_check
    check (length(title) between 1 and 512),
  constraint lead_customer_presentations_json_shape_check
    check (
      jsonb_typeof(presentation_json) = 'object'
      and octet_length(presentation_json::text) <= 24000
    ),
  constraint lead_customer_presentations_idempotency_key_check
    check (length(idempotency_key) between 12 and 128),
  constraint lead_customer_presentations_payload_hash_check
    check (payload_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint lead_customer_presentations_correlation_id_check
    check (length(correlation_id) between 1 and 128),
  constraint lead_customer_presentations_approval_check
    check (
      (status = 'approved' and approved_by is not null and approved_at is not null and archived_at is null)
      or (status = 'draft' and approved_by is null and approved_at is null and archived_at is null)
      or (status = 'archived' and approved_by is null and approved_at is null and archived_at is not null)
    ),
  constraint lead_customer_presentations_brand_id_key unique (id, brand),
  constraint lead_customer_presentations_brand_idempotency_key_key unique (brand, idempotency_key),
  constraint lead_customer_presentations_brand_shortlist_fkey
    foreign key (shortlist_id, brand) references public.lead_property_shortlists(id, brand) on delete cascade
);

create table if not exists public.lead_customer_message_drafts (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  presentation_id uuid not null references public.lead_customer_presentations(id) on delete cascade,
  buyer_profile_id uuid not null references public.buyer_profiles(id) on delete cascade,
  shortlist_id uuid not null references public.lead_property_shortlists(id) on delete cascade,
  channel text not null default 'email',
  status text not null default 'draft',
  subject text not null,
  body_text text not null,
  body_html text,
  language text,
  idempotency_key text not null,
  payload_hash text not null,
  correlation_id text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_customer_message_drafts_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint lead_customer_message_drafts_channel_check
    check (channel in ('email')),
  constraint lead_customer_message_drafts_status_check
    check (status in ('draft', 'approved', 'cancelled')),
  constraint lead_customer_message_drafts_subject_check
    check (length(subject) between 1 and 512),
  constraint lead_customer_message_drafts_body_text_check
    check (length(body_text) between 1 and 12000),
  constraint lead_customer_message_drafts_body_html_check
    check (body_html is null or length(body_html) between 1 and 24000),
  constraint lead_customer_message_drafts_language_check
    check (language is null or language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint lead_customer_message_drafts_idempotency_key_check
    check (length(idempotency_key) between 12 and 128),
  constraint lead_customer_message_drafts_payload_hash_check
    check (payload_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint lead_customer_message_drafts_correlation_id_check
    check (length(correlation_id) between 1 and 128),
  constraint lead_customer_message_drafts_lifecycle_check
    check (
      (status = 'draft' and approved_by is null and approved_at is null and sent_at is null and cancelled_at is null)
      or (status = 'approved' and approved_by is not null and approved_at is not null and sent_at is null and cancelled_at is null)
      or (status = 'cancelled' and sent_at is null and cancelled_at is not null)
    ),
  constraint lead_customer_message_drafts_brand_presentation_fkey
    foreign key (presentation_id, brand) references public.lead_customer_presentations(id, brand) on delete cascade,
  constraint lead_customer_message_drafts_brand_shortlist_fkey
    foreign key (shortlist_id, brand) references public.lead_property_shortlists(id, brand) on delete cascade,
  constraint lead_customer_message_drafts_brand_idempotency_key_key unique (brand, idempotency_key)
);

create index if not exists idx_lead_customer_presentations_brand_status_created
  on public.lead_customer_presentations (brand, status, created_at desc);
create index if not exists idx_lead_customer_presentations_shortlist
  on public.lead_customer_presentations (shortlist_id, created_at desc);
create index if not exists idx_lead_customer_presentations_profile
  on public.lead_customer_presentations (buyer_profile_id, created_at desc);
create index if not exists idx_lead_customer_message_drafts_presentation
  on public.lead_customer_message_drafts (presentation_id, created_at desc);
create index if not exists idx_lead_customer_message_drafts_brand_status_created
  on public.lead_customer_message_drafts (brand, status, created_at desc);

alter table public.lead_customer_presentations enable row level security;
alter table public.lead_customer_message_drafts enable row level security;

revoke all on public.lead_customer_presentations from public, anon, authenticated;
revoke all on public.lead_customer_message_drafts from public, anon, authenticated;

grant select, insert, update, delete on public.lead_customer_presentations to service_role;
grant select, insert, update, delete on public.lead_customer_message_drafts to service_role;

revoke all on public.lead_customer_presentations from realtyflow_lead_intelligence_runtime;
revoke all on public.lead_customer_message_drafts from realtyflow_lead_intelligence_runtime;
grant select, insert on public.lead_customer_presentations to realtyflow_lead_intelligence_runtime;
grant select, insert on public.lead_customer_message_drafts to realtyflow_lead_intelligence_runtime;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.lead_customer_presentations'::regclass
      and tgname = 'trg_lead_customer_presentations_updated_at'
  ) then
    create trigger trg_lead_customer_presentations_updated_at
      before update on public.lead_customer_presentations
      for each row execute function public.set_lead_intelligence_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.lead_customer_message_drafts'::regclass
      and tgname = 'trg_lead_customer_message_drafts_updated_at'
  ) then
    create trigger trg_lead_customer_message_drafts_updated_at
      before update on public.lead_customer_message_drafts
      for each row execute function public.set_lead_intelligence_updated_at();
  end if;
end $$;

drop policy if exists lead_customer_presentations_runtime_select on public.lead_customer_presentations;
create policy lead_customer_presentations_runtime_select
  on public.lead_customer_presentations
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists lead_customer_presentations_runtime_insert on public.lead_customer_presentations;
create policy lead_customer_presentations_runtime_insert
  on public.lead_customer_presentations
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'draft'
    and exists (
      select 1
      from public.lead_property_shortlists shortlist
      join public.buyer_profiles profile
        on profile.id = lead_customer_presentations.buyer_profile_id
       and profile.brand = lead_customer_presentations.brand
      where shortlist.id = lead_customer_presentations.shortlist_id
        and shortlist.brand = lead_customer_presentations.brand
        and shortlist.buyer_profile_id = lead_customer_presentations.buyer_profile_id
        and shortlist.status = 'draft'
        and profile.status = 'approved'
    )
  );

drop policy if exists lead_customer_message_drafts_runtime_select on public.lead_customer_message_drafts;
create policy lead_customer_message_drafts_runtime_select
  on public.lead_customer_message_drafts
  for select
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
  );

drop policy if exists lead_customer_message_drafts_runtime_insert on public.lead_customer_message_drafts;
create policy lead_customer_message_drafts_runtime_insert
  on public.lead_customer_message_drafts
  for insert
  to realtyflow_lead_intelligence_runtime
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'draft'
    and exists (
      select 1
      from public.lead_customer_presentations presentation
      where presentation.id = lead_customer_message_drafts.presentation_id
        and presentation.brand = lead_customer_message_drafts.brand
        and presentation.buyer_profile_id = lead_customer_message_drafts.buyer_profile_id
        and presentation.shortlist_id = lead_customer_message_drafts.shortlist_id
        and presentation.status = 'draft'
    )
  );

comment on table public.lead_customer_presentations is 'Lead Intelligence presentation draft foundation v1';
comment on table public.lead_customer_message_drafts is 'Lead Intelligence presentation draft foundation v1';
comment on policy lead_customer_presentations_runtime_select on public.lead_customer_presentations is
  'Lead Intelligence runtime can select presentation drafts only for server-validated app.lead_intelligence_brand.';
comment on policy lead_customer_presentations_runtime_insert on public.lead_customer_presentations is
  'Lead Intelligence runtime can insert draft presentations only for draft shortlists and approved buyer profiles in the server-validated brand.';
comment on policy lead_customer_message_drafts_runtime_select on public.lead_customer_message_drafts is
  'Lead Intelligence runtime can select customer message drafts only for server-validated app.lead_intelligence_brand.';
comment on policy lead_customer_message_drafts_runtime_insert on public.lead_customer_message_drafts is
  'Lead Intelligence runtime can insert draft email messages only for matching draft presentations in the server-validated brand.';

do $$
begin
  if has_table_privilege('anon', 'public.lead_customer_presentations', 'select')
     or has_table_privilege('authenticated', 'public.lead_customer_presentations', 'select')
     or has_table_privilege('anon', 'public.lead_customer_message_drafts', 'select')
     or has_table_privilege('authenticated', 'public.lead_customer_message_drafts', 'select')
     or exists (
       select 1
       from pg_class c
       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
       where c.oid in (
         'public.lead_customer_presentations'::regclass,
         'public.lead_customer_message_drafts'::regclass
       )
         and acl.grantee = 0
         and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     ) then
    raise exception 'LEAD_INTELLIGENCE_PRESENTATION_PRIVILEGE_DRIFT: browser/public roles must not have presentation draft table access';
  end if;

  if has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'update')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'delete')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'update')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'delete') then
    raise exception 'LEAD_INTELLIGENCE_PRESENTATION_PRIVILEGE_DRIFT: runtime role has unsafe presentation draft privileges';
  end if;
end $$;
