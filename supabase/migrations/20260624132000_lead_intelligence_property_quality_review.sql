-- Lead Intelligence property quality review gate.
--
-- Adds Freddy-controlled quality review metadata to persisted shortlist items.
-- This migration is additive and does not create leads, contacts, email sends,
-- presentations, property matching jobs, or any customer-facing side effect.

do $$
declare
  marker text := 'Lead Intelligence shortlist draft foundation v1';
begin
  if to_regclass('public.lead_property_shortlist_items') is null then
    raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_SCHEMA_NOT_READY: public.lead_property_shortlist_items is missing';
  end if;

  if coalesce(obj_description('public.lead_property_shortlist_items'::regclass, 'pg_class'), '') <> marker then
    raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_SCHEMA_INCOMPATIBLE: reviewed shortlist item schema is required';
  end if;
end $$;

alter table public.lead_property_shortlist_items
  add column if not exists quality_review_status text not null default 'needs_review',
  add column if not exists quality_review_note text,
  add column if not exists quality_review_checked_at timestamptz,
  add column if not exists quality_review_checked_by text;

do $$
declare
  col record;
begin
  for col in
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_property_shortlist_items'
      and column_name in (
        'quality_review_status',
        'quality_review_note',
        'quality_review_checked_at',
        'quality_review_checked_by'
      )
  loop
    if col.column_name in ('quality_review_status', 'quality_review_note', 'quality_review_checked_by')
       and col.data_type <> 'text' then
      raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_SCHEMA_INCOMPATIBLE: %.% has unexpected type %',
        'lead_property_shortlist_items', col.column_name, col.data_type;
    end if;

    if col.column_name = 'quality_review_checked_at'
       and col.data_type <> 'timestamp with time zone' then
      raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_SCHEMA_INCOMPATIBLE: %.% has unexpected type %',
        'lead_property_shortlist_items', col.column_name, col.data_type;
    end if;

    if col.column_name = 'quality_review_status'
       and col.is_nullable <> 'NO' then
      raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_SCHEMA_INCOMPATIBLE: quality_review_status must be NOT NULL';
    end if;
  end loop;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_property_shortlist_items'
      and column_name in (
        'quality_review_status',
        'quality_review_note',
        'quality_review_checked_at',
        'quality_review_checked_by'
      )
  ) <> 4 then
    raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_SCHEMA_INCOMPATIBLE: quality review columns were not created';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_property_shortlist_items'::regclass
      and conname = 'lead_property_shortlist_items_quality_review_status_check'
  ) then
    alter table public.lead_property_shortlist_items
      add constraint lead_property_shortlist_items_quality_review_status_check
      check (
        quality_review_status in (
          'client_ready',
          'needs_review',
          'rejected',
          'ask_agent',
          'verify_price_availability'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_property_shortlist_items'::regclass
      and conname = 'lead_property_shortlist_items_quality_review_note_check'
  ) then
    alter table public.lead_property_shortlist_items
      add constraint lead_property_shortlist_items_quality_review_note_check
      check (quality_review_note is null or length(quality_review_note) <= 512);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_property_shortlist_items'::regclass
      and conname = 'lead_property_shortlist_items_quality_review_metadata_check'
  ) then
    alter table public.lead_property_shortlist_items
      add constraint lead_property_shortlist_items_quality_review_metadata_check
      check (
        quality_review_status = 'needs_review'
        or (
          quality_review_checked_at is not null
          and quality_review_checked_by is not null
          and length(quality_review_checked_by) between 1 and 180
        )
      );
  end if;
end $$;

alter table public.lead_property_shortlist_items
  validate constraint lead_property_shortlist_items_quality_review_status_check;
alter table public.lead_property_shortlist_items
  validate constraint lead_property_shortlist_items_quality_review_note_check;
alter table public.lead_property_shortlist_items
  validate constraint lead_property_shortlist_items_quality_review_metadata_check;

comment on column public.lead_property_shortlist_items.quality_review_status is
  'Freddy-controlled quality review status. Only client_ready items may be used for customer presentation drafts.';
comment on column public.lead_property_shortlist_items.quality_review_note is
  'Freddy quality review note for internal advisory use. Never customer-sent automatically.';
comment on column public.lead_property_shortlist_items.quality_review_checked_at is
  'Timestamp when Freddy marked the property quality review state.';
comment on column public.lead_property_shortlist_items.quality_review_checked_by is
  'Admin identity that marked the property quality review state.';

do $$
begin
  if has_table_privilege('anon', 'public.lead_property_shortlist_items', 'select')
     or has_table_privilege('authenticated', 'public.lead_property_shortlist_items', 'select')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'update')
     or has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'delete') then
    raise exception 'LEAD_INTELLIGENCE_PROPERTY_QUALITY_PRIVILEGE_DRIFT: unexpected shortlist item privileges';
  end if;
end $$;
