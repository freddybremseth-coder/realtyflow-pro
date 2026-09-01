-- Book OS phase 6.0: controlled ingest of completed publication packages.
-- Ingest registers canonical catalogue objects and assets, but never approves
-- a revision, metadata package, launch campaign, calendar item or release.

create table if not exists public.publishing_package_ingests (
  id uuid primary key default gen_random_uuid(),
  ingest_key text not null unique,
  work_id uuid not null references public.publishing_catalog_works(id) on delete cascade,
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  revision_id uuid not null references public.publishing_catalog_revisions(id) on delete restrict,
  package_fingerprint text not null check (package_fingerprint ~ '^[0-9a-f]{64}$'),
  source text not null default 'book_os_package_ingest',
  status text not null default 'applied' check (status in ('applied','superseded','rejected')),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  actor text not null check (length(trim(actor)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publishing_package_ingests_work_idx
  on public.publishing_package_ingests (work_id, created_at desc);
create index if not exists publishing_package_ingests_edition_idx
  on public.publishing_package_ingests (edition_id, created_at desc);
create index if not exists publishing_package_ingests_revision_idx
  on public.publishing_package_ingests (revision_id, created_at desc);

alter table public.publishing_package_ingests enable row level security;
revoke all on table public.publishing_package_ingests from public, anon, authenticated;
grant select on table public.publishing_package_ingests to service_role;
create policy "publishing_package_ingests_deny_direct"
  on public.publishing_package_ingests for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_ingest_publication_package(
  p_manifest jsonb,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingest_key text;
  v_work_key text;
  v_edition_key text;
  v_title text;
  v_subtitle text;
  v_series_name text;
  v_language text;
  v_format text;
  v_brand_id text;
  v_package_fingerprint text;
  v_revision_number integer;
  v_series_number integer;
  v_work_id uuid;
  v_edition_id uuid;
  v_revision_id uuid;
  v_ingest_id uuid;
  v_asset jsonb;
  v_asset_type text;
  v_storage_bucket text;
  v_storage_path text;
  v_external_url text;
  v_fingerprint text;
  v_role text;
  v_version integer;
  v_verified boolean;
  v_canonical boolean;
  v_asset_count integer := 0;
  v_existing public.publishing_package_ingests%rowtype;
begin
  if jsonb_typeof(p_manifest) <> 'object' then raise exception 'Publication package manifest must be an object'; end if;
  if nullif(trim(p_actor),'') is null then raise exception 'Package ingest actor is required'; end if;

  v_ingest_key := nullif(trim(p_manifest->>'ingestKey'),'');
  v_work_key := nullif(trim(p_manifest->>'workKey'),'');
  v_edition_key := nullif(trim(p_manifest->>'editionKey'),'');
  v_title := nullif(trim(p_manifest->>'title'),'');
  v_subtitle := nullif(trim(p_manifest->>'subtitle'),'');
  v_series_name := nullif(trim(p_manifest->>'seriesName'),'');
  v_language := coalesce(nullif(trim(p_manifest->>'language'),''),'en');
  v_format := coalesce(nullif(trim(p_manifest->>'format'),''),'ebook');
  v_brand_id := coalesce(nullif(trim(p_manifest->>'brandId'),''),'freddy_publishing');
  v_package_fingerprint := lower(coalesce(p_manifest->>'packageFingerprint',''));
  v_revision_number := coalesce((p_manifest->>'revisionNumber')::integer,1);
  v_series_number := nullif(p_manifest->>'seriesNumber','')::integer;

  if v_ingest_key is null or v_work_key is null or v_edition_key is null or v_title is null then
    raise exception 'ingestKey, workKey, editionKey and title are required';
  end if;
  if v_format not in ('ebook','paperback','hardcover','audio','other') then raise exception 'Unsupported edition format'; end if;
  if v_revision_number < 1 then raise exception 'revisionNumber must be positive'; end if;
  if v_package_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'packageFingerprint must be sha256 hex'; end if;
  if jsonb_typeof(p_manifest->'assets') <> 'array' or jsonb_array_length(p_manifest->'assets') = 0 then
    raise exception 'At least one package asset is required';
  end if;

  select * into v_existing from public.publishing_package_ingests where ingest_key=v_ingest_key;
  if found then
    if v_existing.package_fingerprint <> v_package_fingerprint then raise exception 'ingestKey already exists with a different fingerprint'; end if;
    return jsonb_build_object(
      'ingest_id',v_existing.id,'work_id',v_existing.work_id,'edition_id',v_existing.edition_id,
      'revision_id',v_existing.revision_id,'status',v_existing.status,'idempotent',true,'approved',false,'published',false
    );
  end if;

  insert into public.publishing_catalog_works
    (brand_id,work_key,canonical_title,series_name,series_number,status,metadata)
  values
    (v_brand_id,v_work_key,v_title,v_series_name,v_series_number,'active',
      jsonb_build_object('package_ingest',true,'last_ingest_key',v_ingest_key))
  on conflict (brand_id,work_key) do update set
    canonical_title=excluded.canonical_title,
    series_name=coalesce(excluded.series_name,public.publishing_catalog_works.series_name),
    series_number=coalesce(excluded.series_number,public.publishing_catalog_works.series_number),
    metadata=public.publishing_catalog_works.metadata || excluded.metadata,
    updated_at=now()
  returning id into v_work_id;

  insert into public.publishing_catalog_editions
    (work_id,edition_key,title,subtitle,language,format,status,metadata)
  values
    (v_work_id,v_edition_key,v_title,v_subtitle,v_language,v_format,'ready',
      jsonb_build_object('package_ingest',true,'last_ingest_key',v_ingest_key))
  on conflict (edition_key) do update set
    work_id=excluded.work_id,title=excluded.title,subtitle=excluded.subtitle,language=excluded.language,
    format=excluded.format,status='ready',metadata=public.publishing_catalog_editions.metadata || excluded.metadata,updated_at=now()
  returning id into v_edition_id;

  update public.publishing_catalog_revisions
    set is_canonical=false,status=case when status='approved' then 'superseded' else status end,updated_at=now()
  where edition_id=v_edition_id and is_canonical and revision_number<>v_revision_number;

  insert into public.publishing_catalog_revisions
    (edition_id,revision_key,revision_number,status,is_canonical,manuscript_updated_at,content_fingerprint,metadata)
  values
    (v_edition_id,v_edition_key || ':r' || v_revision_number::text,v_revision_number,'review',true,now(),
      nullif(lower(p_manifest->>'contentFingerprint'),''),
      jsonb_build_object('package_ingest',true,'ingest_key',v_ingest_key,'production_status',coalesce(p_manifest->>'productionStatus','production_ready')))
  on conflict (edition_id,revision_number) do update set
    revision_key=excluded.revision_key,status=case when public.publishing_catalog_revisions.status='approved' then 'approved' else 'review' end,
    is_canonical=true,manuscript_updated_at=excluded.manuscript_updated_at,
    content_fingerprint=coalesce(excluded.content_fingerprint,public.publishing_catalog_revisions.content_fingerprint),
    metadata=public.publishing_catalog_revisions.metadata || excluded.metadata,updated_at=now()
  returning id into v_revision_id;

  for v_asset in select value from jsonb_array_elements(p_manifest->'assets') loop
    v_asset_type := nullif(trim(v_asset->>'assetType'),'');
    v_storage_bucket := nullif(trim(v_asset->>'storageBucket'),'');
    v_storage_path := nullif(trim(v_asset->>'storagePath'),'');
    v_external_url := nullif(trim(v_asset->>'externalUrl'),'');
    v_fingerprint := nullif(lower(trim(v_asset->>'fingerprint')),'');
    v_role := coalesce(nullif(trim(v_asset->>'role'),''),v_asset_type);
    v_version := greatest(coalesce((v_asset->>'version')::integer,1),1);
    v_verified := coalesce((v_asset->>'verified')::boolean,false);
    v_canonical := coalesce((v_asset->>'canonical')::boolean,false);

    if v_asset_type not in ('source','manuscript_docx','epub','pdf','cover','sample','metadata','package_zip') then
      raise exception 'Unsupported assetType: %', v_asset_type;
    end if;
    if v_storage_path is null and v_external_url is null then raise exception 'Each asset requires storagePath or externalUrl'; end if;
    if v_fingerprint is not null and v_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Asset fingerprint must be sha256 hex'; end if;

    if v_canonical then
      update public.publishing_catalog_assets set is_canonical=false,updated_at=now()
      where edition_id=v_edition_id and asset_type=v_asset_type and is_canonical and status<>'retired';
    end if;

    insert into public.publishing_catalog_assets
      (edition_id,revision_id,asset_type,storage_bucket,storage_path,external_url,fingerprint,version,status,is_canonical,metadata)
    values
      (v_edition_id,v_revision_id,v_asset_type,v_storage_bucket,v_storage_path,v_external_url,v_fingerprint,v_version,
       case when v_verified then 'verified' else 'candidate' end,v_canonical,
       coalesce(v_asset->'metadata','{}'::jsonb) || jsonb_build_object('role',v_role,'ingest_key',v_ingest_key))
    on conflict do nothing;
    v_asset_count := v_asset_count + 1;
  end loop;

  insert into public.publishing_package_ingests
    (ingest_key,work_id,edition_id,revision_id,package_fingerprint,source,status,manifest,actor)
  values
    (v_ingest_key,v_work_id,v_edition_id,v_revision_id,v_package_fingerprint,
     coalesce(nullif(trim(p_manifest->>'source'),''),'book_os_package_ingest'),'applied',p_manifest,trim(p_actor))
  returning id into v_ingest_id;

  return jsonb_build_object(
    'ingest_id',v_ingest_id,'work_id',v_work_id,'edition_id',v_edition_id,'revision_id',v_revision_id,
    'status','applied','asset_count',v_asset_count,'idempotent',false,
    'revision_status','review','approved',false,'published',false,
    'next_gate','quality_center'
  );
end $$;

revoke all on function public.publishing_ingest_publication_package(jsonb,text) from public,anon,authenticated;
grant execute on function public.publishing_ingest_publication_package(jsonb,text) to service_role;

notify pgrst, 'reload schema';
