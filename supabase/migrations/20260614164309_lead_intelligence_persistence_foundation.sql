-- Lead Intelligence persistence foundation.
--
-- This migration is additive and intentionally does not touch public.leads,
-- existing contacts, property matching, email sending, or production data.
-- Browser access remains mediated by server-side APIs: RLS is enabled and no
-- open anon/authenticated policies are created.

create extension if not exists pgcrypto;

create table if not exists public.lead_intake_messages (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  source text not null,
  raw_text_encrypted_or_restricted text,
  language text,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  correlation_id text
);

alter table public.lead_intake_messages add column if not exists id uuid default gen_random_uuid();
alter table public.lead_intake_messages add column if not exists brand text;
alter table public.lead_intake_messages add column if not exists source text;
alter table public.lead_intake_messages add column if not exists raw_text_encrypted_or_restricted text;
alter table public.lead_intake_messages add column if not exists language text;
alter table public.lead_intake_messages add column if not exists status text default 'draft';
alter table public.lead_intake_messages add column if not exists created_by text;
alter table public.lead_intake_messages add column if not exists created_at timestamptz default now();
alter table public.lead_intake_messages add column if not exists updated_at timestamptz default now();
alter table public.lead_intake_messages add column if not exists correlation_id text;

create table if not exists public.lead_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.lead_intake_messages(id) on delete cascade,
  prompt_version text not null,
  model text not null,
  result_json jsonb not null default '{}'::jsonb,
  validation_status text not null default 'valid',
  repaired boolean not null default false,
  duration_ms integer,
  approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.lead_analysis_runs add column if not exists id uuid default gen_random_uuid();
alter table public.lead_analysis_runs add column if not exists intake_id uuid;
alter table public.lead_analysis_runs add column if not exists prompt_version text;
alter table public.lead_analysis_runs add column if not exists model text;
alter table public.lead_analysis_runs add column if not exists result_json jsonb default '{}'::jsonb;
alter table public.lead_analysis_runs add column if not exists validation_status text default 'valid';
alter table public.lead_analysis_runs add column if not exists repaired boolean default false;
alter table public.lead_analysis_runs add column if not exists duration_ms integer;
alter table public.lead_analysis_runs add column if not exists approved boolean default false;
alter table public.lead_analysis_runs add column if not exists approved_by text;
alter table public.lead_analysis_runs add column if not exists approved_at timestamptz;
alter table public.lead_analysis_runs add column if not exists created_at timestamptz default now();

create table if not exists public.buyer_profiles (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  contact_id uuid,
  intake_id uuid not null references public.lead_intake_messages(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);

alter table public.buyer_profiles add column if not exists id uuid default gen_random_uuid();
alter table public.buyer_profiles add column if not exists brand text;
alter table public.buyer_profiles add column if not exists contact_id uuid;
alter table public.buyer_profiles add column if not exists intake_id uuid;
alter table public.buyer_profiles add column if not exists version integer default 1;
alter table public.buyer_profiles add column if not exists status text default 'draft';
alter table public.buyer_profiles add column if not exists purchase_readiness text default 'unknown';
alter table public.buyer_profiles add column if not exists budget_amount numeric;
alter table public.buyer_profiles add column if not exists budget_currency text;
alter table public.buyer_profiles add column if not exists budget_includes_costs boolean;
alter table public.buyer_profiles add column if not exists budget_approximate boolean default false;
alter table public.buyer_profiles add column if not exists location_flexible boolean default false;
alter table public.buyer_profiles add column if not exists summary text;
alter table public.buyer_profiles add column if not exists created_by text;
alter table public.buyer_profiles add column if not exists approved_by text;
alter table public.buyer_profiles add column if not exists approved_at timestamptz;
alter table public.buyer_profiles add column if not exists created_at timestamptz default now();
alter table public.buyer_profiles add column if not exists updated_at timestamptz default now();

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
  updated_at timestamptz not null default now()
);

alter table public.buyer_profile_criteria add column if not exists id uuid default gen_random_uuid();
alter table public.buyer_profile_criteria add column if not exists buyer_profile_id uuid;
alter table public.buyer_profile_criteria add column if not exists criterion_type text;
alter table public.buyer_profile_criteria add column if not exists key text;
alter table public.buyer_profile_criteria add column if not exists other_key text;
alter table public.buyer_profile_criteria add column if not exists operator text default 'unknown';
alter table public.buyer_profile_criteria add column if not exists value jsonb default 'null'::jsonb;
alter table public.buyer_profile_criteria add column if not exists weight numeric;
alter table public.buyer_profile_criteria add column if not exists severity text;
alter table public.buyer_profile_criteria add column if not exists applies_to_property_types text[] default '{}'::text[];
alter table public.buyer_profile_criteria add column if not exists source text;
alter table public.buyer_profile_criteria add column if not exists source_text text;
alter table public.buyer_profile_criteria add column if not exists confidence numeric;
alter table public.buyer_profile_criteria add column if not exists customer_confirmed boolean default false;
alter table public.buyer_profile_criteria add column if not exists approval_status text default 'pending';
alter table public.buyer_profile_criteria add column if not exists approved_by text;
alter table public.buyer_profile_criteria add column if not exists approved_at timestamptz;
alter table public.buyer_profile_criteria add column if not exists active boolean default true;
alter table public.buyer_profile_criteria add column if not exists created_at timestamptz default now();
alter table public.buyer_profile_criteria add column if not exists updated_at timestamptz default now();

create table if not exists public.lead_contact_candidates (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.lead_intake_messages(id) on delete cascade,
  contact_id uuid,
  match_type text not null,
  match_value_hash text not null,
  score numeric not null,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'suggested',
  created_at timestamptz not null default now()
);

alter table public.lead_contact_candidates add column if not exists id uuid default gen_random_uuid();
alter table public.lead_contact_candidates add column if not exists intake_id uuid;
alter table public.lead_contact_candidates add column if not exists contact_id uuid;
alter table public.lead_contact_candidates add column if not exists match_type text;
alter table public.lead_contact_candidates add column if not exists match_value_hash text;
alter table public.lead_contact_candidates add column if not exists score numeric;
alter table public.lead_contact_candidates add column if not exists reasons jsonb default '[]'::jsonb;
alter table public.lead_contact_candidates add column if not exists status text default 'suggested';
alter table public.lead_contact_candidates add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_intake_messages'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.lead_intake_messages where id is null)
  and not exists (
    select 1 from public.lead_intake_messages group by id having count(*) > 1
  ) then
    alter table public.lead_intake_messages add constraint lead_intake_messages_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_analysis_runs'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.lead_analysis_runs where id is null)
  and not exists (
    select 1 from public.lead_analysis_runs group by id having count(*) > 1
  ) then
    alter table public.lead_analysis_runs add constraint lead_analysis_runs_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.buyer_profiles where id is null)
  and not exists (
    select 1 from public.buyer_profiles group by id having count(*) > 1
  ) then
    alter table public.buyer_profiles add constraint buyer_profiles_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.buyer_profile_criteria where id is null)
  and not exists (
    select 1 from public.buyer_profile_criteria group by id having count(*) > 1
  ) then
    alter table public.buyer_profile_criteria add constraint buyer_profile_criteria_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_contact_candidates'::regclass
      and contype = 'p'
  )
  and not exists (select 1 from public.lead_contact_candidates where id is null)
  and not exists (
    select 1 from public.lead_contact_candidates group by id having count(*) > 1
  ) then
    alter table public.lead_contact_candidates add constraint lead_contact_candidates_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_analysis_runs'::regclass
      and conname = 'lead_analysis_runs_intake_id_fkey'
  ) then
    alter table public.lead_analysis_runs
      add constraint lead_analysis_runs_intake_id_fkey
      foreign key (intake_id) references public.lead_intake_messages(id) on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and conname = 'buyer_profiles_intake_id_fkey'
  ) then
    alter table public.buyer_profiles
      add constraint buyer_profiles_intake_id_fkey
      foreign key (intake_id) references public.lead_intake_messages(id) on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_buyer_profile_id_fkey'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_buyer_profile_id_fkey
      foreign key (buyer_profile_id) references public.buyer_profiles(id) on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_contact_candidates'::regclass
      and conname = 'lead_contact_candidates_intake_id_fkey'
  ) then
    alter table public.lead_contact_candidates
      add constraint lead_contact_candidates_intake_id_fkey
      foreign key (intake_id) references public.lead_intake_messages(id) on delete cascade
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_intake_messages'::regclass
      and conname = 'lead_intake_messages_status_check'
  ) then
    alter table public.lead_intake_messages
      add constraint lead_intake_messages_status_check
      check (status in ('draft', 'analyzed', 'reviewed', 'approved', 'rejected', 'archived'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_intake_messages'::regclass
      and conname = 'lead_intake_messages_source_check'
  ) then
    alter table public.lead_intake_messages
      add constraint lead_intake_messages_source_check
      check (source in ('phone_call', 'whatsapp', 'email', 'sms', 'meeting_note', 'other'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_analysis_runs'::regclass
      and conname = 'lead_analysis_runs_validation_status_check'
  ) then
    alter table public.lead_analysis_runs
      add constraint lead_analysis_runs_validation_status_check
      check (validation_status in ('pending', 'valid', 'invalid', 'failed'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_analysis_runs'::regclass
      and conname = 'lead_analysis_runs_duration_check'
  ) then
    alter table public.lead_analysis_runs
      add constraint lead_analysis_runs_duration_check
      check (duration_ms is null or duration_ms >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_analysis_runs'::regclass
      and conname = 'lead_analysis_runs_approval_check'
  ) then
    alter table public.lead_analysis_runs
      add constraint lead_analysis_runs_approval_check
      check (
        (approved is false and approved_at is null)
        or (approved is true and approved_by is not null and approved_at is not null)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and conname = 'buyer_profiles_status_check'
  ) then
    alter table public.buyer_profiles
      add constraint buyer_profiles_status_check
      check (status in ('draft', 'approved', 'superseded', 'archived'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and conname = 'buyer_profiles_purchase_readiness_check'
  ) then
    alter table public.buyer_profiles
      add constraint buyer_profiles_purchase_readiness_check
      check (purchase_readiness in ('cold', 'warm', 'hot', 'ready_to_buy', 'unknown'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and conname = 'buyer_profiles_budget_check'
  ) then
    alter table public.buyer_profiles
      add constraint buyer_profiles_budget_check
      check (
        (budget_amount is null or budget_amount >= 0)
        and (budget_currency is null or budget_currency ~ '^[A-Z]{3}$')
        and version > 0
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and conname = 'buyer_profiles_approval_check'
  ) then
    alter table public.buyer_profiles
      add constraint buyer_profiles_approval_check
      check (
        (status <> 'approved' and approved_at is null)
        or (status = 'approved' and approved_by is not null and approved_at is not null)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_type_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_type_check
      check (criterion_type in ('hard_requirement', 'preference', 'exclusion', 'missing_information'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_key_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_key_check
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
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_operator_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_operator_check
      check (operator in ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'exists', 'unknown'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_property_types_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_property_types_check
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
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_source_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_source_check
      check (source in ('ai_suggestion', 'manual', 'customer_confirmed'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_confidence_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_confidence_check
      check (
        (confidence is null or confidence between 0 and 1)
        and (weight is null or weight between 0 and 1)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_shape_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_shape_check
      check (
        (criterion_type <> 'preference' or weight is not null)
        and (criterion_type = 'preference' or weight is null)
        and (criterion_type <> 'exclusion' or severity in ('reject', 'major_penalty', 'minor_penalty'))
        and (criterion_type = 'exclusion' or severity is null)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profile_criteria'::regclass
      and conname = 'buyer_profile_criteria_approval_check'
  ) then
    alter table public.buyer_profile_criteria
      add constraint buyer_profile_criteria_approval_check
      check (
        approval_status in ('pending', 'approved', 'rejected', 'edited')
        and (approval_status <> 'rejected' or active is false)
        and (
          (approval_status = 'approved' and approved_by is not null and approved_at is not null)
          or (approval_status <> 'approved' and approved_at is null)
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_contact_candidates'::regclass
      and conname = 'lead_contact_candidates_match_type_check'
  ) then
    alter table public.lead_contact_candidates
      add constraint lead_contact_candidates_match_type_check
      check (match_type in ('exact_phone', 'exact_email', 'name_similarity', 'manual', 'other'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_contact_candidates'::regclass
      and conname = 'lead_contact_candidates_status_check'
  ) then
    alter table public.lead_contact_candidates
      add constraint lead_contact_candidates_status_check
      check (status in ('suggested', 'selected', 'rejected', 'ignored'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_contact_candidates'::regclass
      and conname = 'lead_contact_candidates_score_check'
  ) then
    alter table public.lead_contact_candidates
      add constraint lead_contact_candidates_score_check
      check (
        score between 0 and 1
        and length(match_value_hash) between 16 and 128
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.buyer_profiles'::regclass
      and conname = 'buyer_profiles_intake_version_key'
  )
  and not exists (
    select 1 from public.buyer_profiles
    group by intake_id, version
    having count(*) > 1
  ) then
    alter table public.buyer_profiles
      add constraint buyer_profiles_intake_version_key unique (intake_id, version);
  end if;
end $$;

create index if not exists idx_lead_intake_messages_brand_status_created
  on public.lead_intake_messages (brand, status, created_at desc);
create index if not exists idx_lead_intake_messages_created_by
  on public.lead_intake_messages (created_by, created_at desc);
create index if not exists idx_lead_intake_messages_correlation
  on public.lead_intake_messages (correlation_id)
  where correlation_id is not null;

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
  on public.lead_contact_candidates (contact_id)
  where contact_id is not null;
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
