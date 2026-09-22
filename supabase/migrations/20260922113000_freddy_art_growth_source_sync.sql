-- Synchronize ONLY published low-resolution gallery previews into Art's own
-- Growth OS sources. No private original masters and no automatic posting.
create or replace function public.sync_freddy_art_growth_sources()
returns integer
language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role only';
  end if;

  insert into public.marketing_source_queue
    (brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,blocked_reason,updated_at)
  select 'freddyart','artwork',w.id::text,
    'https://art.freddybremseth.com/verk/'||w.id::text||'/',
    left(coalesce(nullif(w.title_en,''),w.id::text),220),
    0.6,
    array['instagram']::text[],
    jsonb_build_object(
      'artwork_id',w.id,'preview_url','https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/'||w.public_preview_path,
      'detail_url','https://art.freddybremseth.com/verk/'||w.id::text||'/',
      'style',w.style_id,'collection',w.collection_id,
      'orientation',w.orientation,'source','art_gallery_works',
      'preview_only',true,'rights','owner_approved_published_preview'),
    'ready',null,now()
  from public.art_gallery_works w
  where w.published=true and w.public_preview_path ~ '^[a-z0-9][a-z0-9-]{0,120}/view[.]webp$'
    and w.id::text ~ '^[a-z0-9][a-z0-9-]{0,120}$'
  on conflict (brand_id,source_type,source_id) do update set
    source_url=excluded.source_url,title=excluded.title,
    payload=excluded.payload,priority=excluded.priority,
    recommended_channels=excluded.recommended_channels,
    status=case when public.marketing_source_queue.status in ('consumed','drafted')
      then public.marketing_source_queue.status else 'ready' end,
    blocked_reason=null,updated_at=now();
  get diagnostics v_count=row_count;

  update public.marketing_source_queue q set
    status='blocked',blocked_reason='ARTWORK_UNPUBLISHED_OR_PUBLIC_PREVIEW_MISSING',
    updated_at=now()
  where q.brand_id='freddyart' and q.source_type='artwork'
    and q.status<>'blocked'
    and not exists (
      select 1 from public.art_gallery_works w
      where w.id::text=q.source_id and w.published=true
        and w.public_preview_path ~ '^[a-z0-9][a-z0-9-]{0,120}/view[.]webp$'
    );
  return v_count;
end;
$$;
revoke all on function public.sync_freddy_art_growth_sources() from public,anon,authenticated;
grant execute on function public.sync_freddy_art_growth_sources() to service_role;
