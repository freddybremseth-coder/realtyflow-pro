-- Lead Intelligence persistence foundation.
--
-- This migration is additive and intentionally does not touch public.leads,
-- existing contacts, property matching, email sending, or production data.
-- Browser access remains mediated by server-side APIs: RLS is enabled and no
-- open anon/authenticated policies are created.

create extension if not exists pgcrypto;

do $$
declare
  target_table text;
  marker text := 'Lead Intelligence persistence foundation v1';
begin
  foreach target_table in array array[
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
       and coalesce(obj_description(format('public.%I', target_table)::regclass, 'pg_class'), '') <> marker then
      raise exception 'LEAD_INTELLIGENCE_SCHEMA_INCOMPATIBLE: public.% already exists without reviewed foundation marker', target_table;
    end if;
  end loop;
end $$;

create table if not exists public.lead_intake_messages (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  source text not null,
  raw_text_restricted text,
  raw_text_retention_until timestamptz,
  redacted_at timestamptz,
  language text,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  correlation_id text not null,
  idempotency_key text not null,
  constraint lead_intake_messages_status_check
    check (status in ('draft', 'analyzed', 'reviewed', 'approved', 'rejected', 'archived')),
  constraint lead_intake_messages_source_check
    check (source in ('phone_call', 'whatsapp', 'email', 'sms', 'meeting_note', 'other')),
  constraint lead_intake_messages_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint lead_intake_messages_idempotency_key_check
    check (length(idempotency_key) between 12 and 128),
  constraint lead_intake_messages_correlation_id_check
    check (length(correlation_id) between 1 and 128),
  constraint lead_intake_messages_redaction_check
    check (
      redacted_at is null
      or raw_text_restricted is null
      or raw_text_restricted = '[REDACTED]'
    ),
  constraint lead_intake_messages_brand_id_key unique (id, brand),
  constraint lead_intake_messages_brand_idempotency_key_key unique (brand, idempotency_key)
);

create table if not exists public.lead_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.lead_intake_messages(id) on delete cascade,
  idempotency_key text not null,
  prompt_version text not null,
  model text not null,
  result_json jsonb not null default '{}'::jsonb,
  validation_status text not null default 'valid',
  repaired boolean not null default false,
  duration_ms integer,
  approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_analysis_runs_validation_status_check
    check (validation_status in ('pending', 'valid', 'invalid', 'failed')),
  constraint lead_analysis_runs_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint lead_analysis_runs_idempotency_key_check
    check (length(idempotency_key) between 12 and 128),
  constraint lead_analysis_runs_approval_check
    check (
      (approved is true and approved_by is not null and approved_at is not null)
      or (approved is false and approved_by is null and approved_at is null)
    ),
  constraint lead_analysis_runs_intake_id_idempotency_key_key unique (intake_id, idempotency_key)
);

create table if not exists public.buyer_profiles (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  contact_id uuid,
  intake_id uuid not null,
  version integer not null default 1,
  status text not null default 'draft',
  purchase_readiness text not null default 'unknown',
  budget_amount numeric,
  budget_currency text,
  budget_includes_costs boolean,
  budget_approximate boolean not null default false,
  location_flexible boolean not null default false,
  summary text,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_profiles_intake_brand_fkey
    foreign key (intake_id, brand) references public.lead_intake_messages(id, brand) on delete cascade,
  constraint buyer_profiles_status_check
    check (status in ('draft', 'approved', 'superseded', 'archived')),
  constraint buyer_profiles_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint buyer_profiles_purchase_readiness_check
    check (purchase_readiness in ('cold', 'warm', 'hot', 'ready_to_buy', 'unknown')),
  constraint buyer_profiles_budget_check
    check (
      (budget_amount is null or budget_amount >= 0)
      and (budget_currency is null or budget_currency ~ '^[A-Z]{3}$')
      and version > 0
    ),
  constraint buyer_profiles_approval_check
    check (
      (status = 'approved' and approved_by is not null and approved_at is not null)
      or (status <> 'approved' and approved_by is null and approved_at is null)
    ),
  constraint buyer_profiles_intake_version_key unique (intake_id, version)
);

create table if not exists public.buyer_profile_criteria (
  id uuid primary key default gen_random_uuid(),
  buyer_profile_id uuid not null references public.buyer_profiles(id) on delete cascade,
  criterion_type text not null,
  key text not null,
  other_key text,
  operator text not null default 'unknown',
  value jsonb not null default 'null'::jsonb,
  weight numeric,
  severity text,
  applies_to_property_types text[] not null default '{}'::text[],
  source text not null,
  source_text text,
  confidence numeric,
  customer_confirmed boolean not null default false,
  approval_status text not null default 'pending',
  approved_by text,
  approved_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_profile_criteria_type_check
    check (criterion_type in ('hard_requirement', 'preference', 'exclusion', 'missing_information')),
  constraint buyer_profile_criteria_key_check
    check (
      key in (
        'bedrooms',
        'bathrooms',
        'property_type',
        'location',
        'total_budget',
        'purchase_price',
        'estimated_total_cost',
        'floor_position',
        'has_lift',
        'terrace_area_m2',
        'terrace_access',
        'view_quality',
        'orientation',
        'parking',
        'pool',
        'new_build_or_resale',
        'availability_status',
        'availability_verified_at',
        'adjacent_plot_status',
        'future_building_risk',
        'view_privacy_loss_risk',
        'view_obstruction_risk',
        'legal_notes',
        'living_area_m2',
        'plot_area_m2',
        'distance_to_beach',
        'stairs',
        'other',
        'unknown'
      )
      and ((key = 'other' and other_key is not null) or (key <> 'other' and other_key is null))
    ),
  constraint buyer_profile_criteria_operator_check
    check (operator in ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'exists', 'unknown')),
  constraint buyer_profile_criteria_property_types_check
    check (
      applies_to_property_types <@ array[
        'end_townhouse',
        'townhouse',
        'apartment',
        'penthouse',
        'villa',
        'duplex',
        'bungalow',
        'finca',
        'country_house',
        'plot',
        'commercial',
        'other',
        'unknown'
      ]::text[]
    ),
  constraint buyer_profile_criteria_source_check
    check (source in ('ai_suggestion', 'manual', 'customer_confirmed')),
  constraint buyer_profile_criteria_confidence_check
    check (
      (confidence is null or confidence between 0 and 1)
      and (weight is null or weight between 0 and 1)
    ),
  constraint buyer_profile_criteria_shape_check
    check (
      (criterion_type <> 'preference' or weight is not null)
      and (criterion_type = 'preference' or weight is null)
      and (criterion_type <> 'exclusion' or severity in ('reject', 'major_penalty', 'minor_penalty'))
      and (criterion_type = 'exclusion' or severity is null)
    ),
  constraint buyer_profile_criteria_approval_check
    check (
      approval_status in ('pending', 'approved', 'rejected', 'edited')
      and (approval_status <> 'rejected' or active is false)
      and (
        (approval_status = 'approved' and approved_by is not null and approved_at is not null)
        or (approval_status <> 'approved' and approved_by is null and approved_at is null)
      )
    )
);

create table if not exists public.lead_contact_candidates (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  intake_id uuid not null,
  contact_id uuid not null,
  match_type text not null,
  match_value_hash text not null,
  score numeric not null,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'suggested',
  created_at timestamptz not null default now(),
  constraint lead_contact_candidates_intake_brand_fkey
    foreign key (intake_id, brand) references public.lead_intake_messages(id, brand) on delete cascade,
  constraint lead_contact_candidates_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint lead_contact_candidates_match_type_check
    check (match_type in ('exact_phone', 'exact_email', 'name_similarity', 'manual', 'other')),
  constraint lead_contact_candidates_status_check
    check (status in ('suggested', 'selected', 'rejected', 'ignored')),
  constraint lead_contact_candidates_score_check
    check (
      score between 0 and 1
      and match_value_hash ~ '^hmac-sha256:v1:[0-9a-f]{64}$'
    ),
  constraint lead_contact_candidates_intake_match_hash_key unique (intake_id, match_type, match_value_hash)
);

create index if not exists idx_lead_intake_messages_brand_status_created
  on public.lead_intake_messages (brand, status, created_at desc);
create index if not exists idx_lead_intake_messages_created_by
  on public.lead_intake_messages (created_by, created_at desc);
create index if not exists idx_lead_intake_messages_correlation
  on public.lead_intake_messages (correlation_id);

create index if not exists idx_lead_analysis_runs_intake_created
  on public.lead_analysis_runs (intake_id, created_at desc);
create index if not exists idx_lead_analysis_runs_validation
  on public.lead_analysis_runs (validation_status, created_at desc);

create index if not exists idx_buyer_profiles_brand_status_created
  on public.buyer_profiles (brand, status, created_at desc);
create index if not exists idx_buyer_profiles_intake
  on public.buyer_profiles (intake_id, version desc);
create index if not exists idx_buyer_profiles_contact
  on public.buyer_profiles (contact_id)
  where contact_id is not null;

create index if not exists idx_buyer_profile_criteria_profile_type_active
  on public.buyer_profile_criteria (buyer_profile_id, criterion_type, active);
create index if not exists idx_buyer_profile_criteria_approval
  on public.buyer_profile_criteria (approval_status, updated_at desc);

create index if not exists idx_lead_contact_candidates_intake_status_score
  on public.lead_contact_candidates (intake_id, status, score desc);
create index if not exists idx_lead_contact_candidates_contact
  on public.lead_contact_candidates (contact_id);
create index if not exists idx_lead_contact_candidates_lookup
  on public.lead_contact_candidates (match_type, match_value_hash);

create or replace function public.set_lead_intelligence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.lead_intake_messages'::regclass
      and tgname = 'trg_lead_intake_messages_updated_at'
  ) then
    create trigger trg_lead_intake_messages_updated_at
      before update on public.lead_intake_messages
      for each row execute function public.set_lead_intelligence_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.buyer_profiles'::regclass
      and tgname = 'trg_buyer_profiles_updated_at'
  ) then
    create trigger trg_buyer_profiles_updated_at
      before update on public.buyer_profiles
      for each row execute function public.set_lead_intelligence_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.buyer_profile_criteria'::regclass
      and tgname = 'trg_buyer_profile_criteria_updated_at'
  ) then
    create trigger trg_buyer_profile_criteria_updated_at
      before update on public.buyer_profile_criteria
      for each row execute function public.set_lead_intelligence_updated_at();
  end if;
end $$;

alter table public.lead_intake_messages enable row level security;
alter table public.lead_analysis_runs enable row level security;
alter table public.buyer_profiles enable row level security;
alter table public.buyer_profile_criteria enable row level security;
alter table public.lead_contact_candidates enable row level security;

revoke all on public.lead_intake_messages from public, anon, authenticated;
revoke all on public.lead_analysis_runs from public, anon, authenticated;
revoke all on public.buyer_profiles from public, anon, authenticated;
revoke all on public.buyer_profile_criteria from public, anon, authenticated;
revoke all on public.lead_contact_candidates from public, anon, authenticated;

grant select, insert, update, delete on public.lead_intake_messages to service_role;
grant select, insert, update, delete on public.lead_analysis_runs to service_role;
grant select, insert, update, delete on public.buyer_profiles to service_role;
grant select, insert, update, delete on public.buyer_profile_criteria to service_role;
grant select, insert, update, delete on public.lead_contact_candidates to service_role;

revoke execute on function public.set_lead_intelligence_updated_at() from public;
revoke execute on function public.set_lead_intelligence_updated_at() from anon;
revoke execute on function public.set_lead_intelligence_updated_at() from authenticated;
grant execute on function public.set_lead_intelligence_updated_at() to service_role;

comment on table public.lead_intake_messages is 'Lead Intelligence persistence foundation v1';
comment on table public.lead_analysis_runs is 'Lead Intelligence persistence foundation v1';
comment on table public.buyer_profiles is 'Lead Intelligence persistence foundation v1';
comment on table public.buyer_profile_criteria is 'Lead Intelligence persistence foundation v1';
comment on table public.lead_contact_candidates is 'Lead Intelligence persistence foundation v1';
