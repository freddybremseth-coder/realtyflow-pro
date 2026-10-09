-- Multi-image support for Content Hub. Existing ai_image_url remains the
-- single-image compatibility source; no existing publication is rewritten.
alter table public.content_publications
  add column if not exists visual_format text not null default 'single_image'
  check (visual_format in ('single_image','collage','carousel'));
alter table public.content_publications
  add column if not exists media_revision integer not null default 0;

create table if not exists public.content_publication_media (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.content_publications(id) on delete cascade,
  position integer not null check (position >= 0 and position < 10),
  media_type text not null default 'image' check (media_type = 'image'),
  source_url text not null check (length(source_url) > 0),
  thumbnail_url text,
  source_kind text not null default 'library'
    check (source_kind in ('property','openart','library','upload','website')),
  overlay_text text,
  alt_text text,
  processing_status text not null default 'ready'
    check (processing_status in ('pending','ready','failed')),
  created_at timestamptz not null default now(),
  unique (publication_id,position)
);
create index if not exists content_publication_media_publication_idx
 on public.content_publication_media(publication_id,position);
alter table public.content_publication_media enable row level security;
-- No public grants/policies: access only via existing authenticated server API.

-- Atomic reordering: either all positions change, or none do.
create or replace function public.reorder_content_publication_media(
  p_publication_id uuid, p_media_ids uuid[]
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_count integer;
  v_index integer;
begin
  if array_length(p_media_ids,1) is null or array_length(p_media_ids,1) > 10 then
    raise exception 'Invalid media count';
  end if;
  perform 1 from public.content_publications where id = p_publication_id and status in ('draft','failed') for update;
  if not found then raise exception 'Draft missing or not editable'; end if;
  select count(*) into v_count from public.content_publication_media
    where publication_id = p_publication_id;
  if v_count <> array_length(p_media_ids,1)
      or (select count(distinct x) from unnest(p_media_ids) x) <> v_count
      or (select count(*) from public.content_publication_media
            where publication_id = p_publication_id and id = any(p_media_ids)) <> v_count then
    raise exception 'Media sequence is stale';
  end if;
  -- Delete+reinsert is unnecessary; assign temporary negative slots inside one transaction.
  -- The signed staging range is allowed by the check constraint below.
  for v_index in 1..v_count loop
    update public.content_publication_media set position = -v_index
      where publication_id = p_publication_id and id = p_media_ids[v_index];
  end loop;
  for v_index in 1..v_count loop
    update public.content_publication_media set position = v_index - 1
      where publication_id = p_publication_id and id = p_media_ids[v_index];
  end loop;
  update public.content_publications
    set media_revision = media_revision + 1,
        ai_image_url=(select source_url from public.content_publication_media
          where publication_id=p_publication_id order by position limit 1),
        thumbnail_url=(select coalesce(thumbnail_url,source_url) from public.content_publication_media
          where publication_id=p_publication_id order by position limit 1)
    where id = p_publication_id;
end;
$$;
alter table public.content_publication_media
  drop constraint if exists content_publication_media_position_check;
alter table public.content_publication_media
  add constraint content_publication_media_position_check check (position >= -10 and position < 10);
revoke all on function public.reorder_content_publication_media(uuid,uuid[]) from public;
revoke all on function public.reorder_content_publication_media(uuid,uuid[]) from anon, authenticated;
grant execute on function public.reorder_content_publication_media(uuid,uuid[]) to service_role;

-- Remove one item and compact positions in a single transaction.
create or replace function public.remove_content_publication_media(
  p_publication_id uuid, p_media_id uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_index integer;
  v_remaining integer;
begin
  perform 1 from public.content_publications
    where id=p_publication_id and status in ('draft','failed') for update;
  if not found then raise exception 'Publication missing or published'; end if;
  delete from public.content_publication_media
    where publication_id=p_publication_id and id=p_media_id
    returning position into v_index;
  if v_index is null then raise exception 'Media item missing'; end if;
  -- Stage remaining rows in disjoint negative slots to avoid unique collisions.
  update public.content_publication_media
    set position = -(position + 1)
    where publication_id=p_publication_id and position > v_index;
  update public.content_publication_media
    set position = (-position) - 2
    where publication_id=p_publication_id and position < 0;
  select count(*) into v_remaining from public.content_publication_media
    where publication_id=p_publication_id;
  update public.content_publications set
    visual_format=case when v_remaining >= 2 then 'carousel' else 'single_image' end,
    media_revision=media_revision + 1,
    ai_image_url=(select source_url from public.content_publication_media
      where publication_id=p_publication_id order by position limit 1),
    thumbnail_url=(select coalesce(thumbnail_url,source_url) from public.content_publication_media
      where publication_id=p_publication_id order by position limit 1)
  where id=p_publication_id;
end;
$$;
revoke all on function public.remove_content_publication_media(uuid,uuid) from public;
revoke all on function public.remove_content_publication_media(uuid,uuid) from anon, authenticated;
grant execute on function public.remove_content_publication_media(uuid,uuid) to service_role;

-- Atomic append: legacy cover, new slide, format and revision commit together.
create or replace function public.append_content_publication_media(
  p_publication_id uuid, p_source_url text, p_thumbnail_url text,
  p_source_kind text, p_alt_text text
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_draft public.content_publications%rowtype;
  v_count integer;
begin
  select * into v_draft from public.content_publications
    where id = p_publication_id and status in ('draft','failed')
    for update;
  if not found then raise exception 'Draft missing or not editable'; end if;
  select count(*) into v_count from public.content_publication_media
    where publication_id = p_publication_id;
  if v_count = 0 and nullif(v_draft.ai_image_url,'') is not null then
    insert into public.content_publication_media
      (publication_id,position,source_url,thumbnail_url,source_kind)
      values (p_publication_id,0,v_draft.ai_image_url,v_draft.thumbnail_url,'library');
    v_count := 1;
  end if;
  if v_count >= 10 then raise exception 'Carousel maximum is 10 images'; end if;
  insert into public.content_publication_media
    (publication_id,position,source_url,thumbnail_url,source_kind,alt_text)
    values (p_publication_id,v_count,p_source_url,p_thumbnail_url,p_source_kind,p_alt_text);
  update public.content_publications set
    visual_format=case when v_count >= 1 then 'carousel' else 'single_image' end,
    media_revision=media_revision+1,
    ai_image_url=(select source_url from public.content_publication_media
      where publication_id=p_publication_id order by position limit 1),
    thumbnail_url=(select coalesce(thumbnail_url,source_url) from public.content_publication_media
      where publication_id=p_publication_id order by position limit 1)
  where id=p_publication_id;
end;
$$;
revoke all on function public.append_content_publication_media(uuid,text,text,text,text) from public;
revoke all on function public.append_content_publication_media(uuid,text,text,text,text) from anon, authenticated;
grant execute on function public.append_content_publication_media(uuid,text,text,text,text) to service_role;
