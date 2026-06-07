-- Codify the production Re-Master image-bank hotfix in repo migrations.
--
-- Production already has this table. This migration is intentionally
-- idempotent and additive so it is safe for empty, partial, and current
-- production-like databases.

create extension if not exists pgcrypto;

create table if not exists public.user_image_bank (
  id uuid primary key default gen_random_uuid(),
  owner text not null default 'system',
  url text not null,
  thumbnail_url text,
  name text,
  kind text not null default 'image',
  tags text[] not null default '{}',
  size_bytes bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  archive_status text not null default 'active',
  archive_destination text,
  archived_at timestamptz
);

alter table public.user_image_bank add column if not exists id uuid default gen_random_uuid();
alter table public.user_image_bank add column if not exists owner text default 'system';
alter table public.user_image_bank add column if not exists url text;
alter table public.user_image_bank add column if not exists thumbnail_url text;
alter table public.user_image_bank add column if not exists name text;
alter table public.user_image_bank add column if not exists kind text default 'image';
alter table public.user_image_bank add column if not exists tags text[] default '{}';
alter table public.user_image_bank add column if not exists size_bytes bigint;
alter table public.user_image_bank add column if not exists width integer;
alter table public.user_image_bank add column if not exists height integer;
alter table public.user_image_bank add column if not exists created_at timestamptz default now();
alter table public.user_image_bank add column if not exists last_used_at timestamptz;
alter table public.user_image_bank add column if not exists use_count integer default 0;
alter table public.user_image_bank add column if not exists archive_status text default 'active';
alter table public.user_image_bank add column if not exists archive_destination text;
alter table public.user_image_bank add column if not exists archived_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    alter table public.user_image_bank alter column id set default gen_random_uuid();
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'owner' and data_type = 'text'
  ) then
    alter table public.user_image_bank alter column owner set default 'system';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'kind' and data_type = 'text'
  ) then
    alter table public.user_image_bank alter column kind set default 'image';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'tags' and data_type = 'ARRAY' and udt_name = '_text'
  ) then
    alter table public.user_image_bank alter column tags set default '{}';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'created_at' and data_type = 'timestamp with time zone'
  ) then
    alter table public.user_image_bank alter column created_at set default now();
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'use_count' and data_type = 'integer'
  ) then
    alter table public.user_image_bank alter column use_count set default 0;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'archive_status' and data_type = 'text'
  ) then
    alter table public.user_image_bank alter column archive_status set default 'active';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_image_bank'::regclass
      and contype = 'p'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'id' and data_type = 'uuid'
  )
  and not exists (
    select 1
    from public.user_image_bank
    where id is null
  )
  and not exists (
    select 1
    from public.user_image_bank
    group by id
    having count(*) > 1
  ) then
    alter table public.user_image_bank add constraint user_image_bank_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'id' and data_type = 'uuid'
  )
  and not exists (select 1 from public.user_image_bank where id is null) then
    alter table public.user_image_bank alter column id set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'owner' and data_type = 'text'
  )
  and not exists (select 1 from public.user_image_bank where owner is null) then
    alter table public.user_image_bank alter column owner set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'url' and data_type = 'text'
  )
  and not exists (select 1 from public.user_image_bank where url is null) then
    alter table public.user_image_bank alter column url set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'kind' and data_type = 'text'
  )
  and not exists (select 1 from public.user_image_bank where kind is null) then
    alter table public.user_image_bank alter column kind set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'tags' and data_type = 'ARRAY' and udt_name = '_text'
  )
  and not exists (select 1 from public.user_image_bank where tags is null) then
    alter table public.user_image_bank alter column tags set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'created_at' and data_type = 'timestamp with time zone'
  )
  and not exists (select 1 from public.user_image_bank where created_at is null) then
    alter table public.user_image_bank alter column created_at set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'use_count' and data_type = 'integer'
  )
  and not exists (select 1 from public.user_image_bank where use_count is null) then
    alter table public.user_image_bank alter column use_count set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'archive_status' and data_type = 'text'
  )
  and not exists (select 1 from public.user_image_bank where archive_status is null) then
    alter table public.user_image_bank alter column archive_status set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'kind' and data_type = 'text'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_image_bank'::regclass
      and conname = 'user_image_bank_kind_check'
  ) then
    alter table public.user_image_bank
      add constraint user_image_bank_kind_check
      check (kind in ('image', 'logo', 'thumbnail', 'product', 'variant'))
      not valid;
  end if;

  if not exists (
    select 1
    from public.user_image_bank
    where kind is not null
      and kind <> all (array['image', 'logo', 'thumbnail', 'product', 'variant'])
  ) then
    alter table public.user_image_bank validate constraint user_image_bank_kind_check;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_image_bank'
      and column_name = 'use_count' and data_type = 'integer'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_image_bank'::regclass
      and conname = 'user_image_bank_use_count_check'
  ) then
    alter table public.user_image_bank
      add constraint user_image_bank_use_count_check
      check (use_count >= 0)
      not valid;
  end if;

  if not exists (
    select 1
    from public.user_image_bank
    where use_count < 0
  ) then
    alter table public.user_image_bank validate constraint user_image_bank_use_count_check;
  end if;
end $$;

create index if not exists idx_user_image_bank_owner
  on public.user_image_bank (owner);

create index if not exists idx_user_image_bank_kind
  on public.user_image_bank (kind);

create index if not exists idx_user_image_bank_created_at
  on public.user_image_bank (created_at desc);

create index if not exists idx_user_image_bank_owner_kind_created
  on public.user_image_bank (owner, kind, created_at desc);

alter table public.user_image_bank enable row level security;

comment on table public.user_image_bank is
  'Reusable Re-Master and RealtyFlow image assets. Accessed through authenticated server APIs using the service role.';
