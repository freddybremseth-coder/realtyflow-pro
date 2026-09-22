-- Weekly low-volume, first-person editorial candidates for the professional
-- Freddy Bremseth Facebook Page. Candidate ONLY, no external Meta side effect.
-- Source has to remain verifiably published. The existing personal umbrella
-- Growth plan is approval_required; this function never changes it.
create or replace function public.curate_freddy_creative_editorial_sources()
returns integer
language plpgsql security definer set search_path=public
as $$
declare
  v_start timestamptz := date_trunc('week',now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  v_week integer := extract(week from now() at time zone 'Europe/Madrid');
  v_created integer := 0;
  v_source record;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role only'; end if;

  -- Two candidates per Madrid week, never two identical subjects.
  if (select count(*) from public.marketing_source_queue
       where brand_id='freddyb' and source_type='creative_spotlight'
         and created_at>=v_start) >= 2 then return 0; end if;

  select q.source_id,q.source_url,q.title,q.payload
  into v_source from public.marketing_source_queue q
  join public.art_gallery_works a on a.id::text=q.source_id
  where q.brand_id='freddyart' and q.source_type='artwork' and q.status='ready'
    and a.published=true and a.public_preview_path ~ '^[a-z0-9][a-z0-9-]{0,120}/view[.]webp$'
    and not exists (select 1 from public.marketing_source_queue prior
      where prior.brand_id='freddyb' and prior.source_type='creative_spotlight'
        and prior.source_id='art:'||q.source_id)
  order by md5(v_start::text||q.source_id) limit 1;

  if v_source.source_id is not null then
    insert into public.marketing_source_queue
    (brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,updated_at)
    values ('freddyb','creative_spotlight','art:'||v_source.source_id,v_source.source_url,
      'Freddy story: '||left(v_source.title,180),0.8,array['facebook']::text[],
      jsonb_build_object('source_brand','freddyart','source_type','artwork',
        'source_id',v_source.source_id,'verified_url',v_source.source_url,
        'approved_art_preview',v_source.payload->>'preview_url',
        'editorial_angle','Personal artist introduction: explain why this artwork is worth sharing; do not invent creation dates or a backstory.',
        'suggested_copy','Jeg deler et verk fra kunstgalleriet mitt. Se hele bildet og flere arbeider i galleriet.',
        'publishing_policy','approval_required_rewrite_no_identical_crosspost','private_facebook_profile',false),
      'ready',now()) on conflict (brand_id,source_type,source_id) do nothing;
    if found then v_created:=v_created+1; end if;
  end if;

  if (select count(*) from public.marketing_source_queue
       where brand_id='freddyb' and source_type='creative_spotlight'
         and created_at>=v_start) >= 2 then return v_created; end if;

  if mod(v_week,2)=0 then
    select q.source_id,q.source_url,q.title,q.payload into v_source
    from public.marketing_source_queue q
    join public.songs s on s.id::text=q.source_id
    where q.brand_id='remasterfreddy' and q.source_type='song'
      and q.status='ready' and s.brand='remasterfreddy' and s.file_url is not null
      and s.youtube_url=q.source_url and q.source_url like 'https://www.youtube.com/watch?v=%'
      and not exists (select 1 from public.marketing_source_queue prior
        where prior.brand_id='freddyb' and prior.source_type='creative_spotlight'
          and prior.source_id='music:'||q.source_id)
    order by md5(v_start::text||q.source_id) limit 1;
  else
    select q.source_id,q.source_url,q.title,q.payload into v_source
    from public.marketing_source_queue q
    join public.book_titles b on b.id::text=q.source_id
    where q.brand_id='freddyb' and q.source_type='book' and q.status='ready'
      and b.status='published'
      and q.source_url like 'https://books.freddybremseth.com/book/%'
      and not exists (select 1 from public.marketing_source_queue prior
        where prior.brand_id='freddyb' and prior.source_type='creative_spotlight'
          and prior.source_id='book:'||q.source_id)
    order by md5(v_start::text||q.source_id) limit 1;
  end if;

  if v_source.source_id is not null then
    insert into public.marketing_source_queue
    (brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,updated_at)
    values ('freddyb','creative_spotlight',
      case when mod(v_week,2)=0 then 'music:' else 'book:' end ||v_source.source_id,
      v_source.source_url,'Freddy story: '||left(v_source.title,180),0.75,
      array['facebook']::text[],
      jsonb_build_object('source_brand',case when mod(v_week,2)=0 then 'remasterfreddy' else 'freddypublishing' end,
        'source_type',case when mod(v_week,2)=0 then 'song' else 'book' end,
        'source_id',v_source.source_id,'verified_url',v_source.source_url,
        'editorial_angle','First-person owner perspective on the verified music or published book; do not invent personal motivation, sales or reviews.',
        'suggested_copy',case when mod(v_week,2)=0
          then 'Jeg deler en låt fra musikkprosjektet mitt Re-Master Freddy.'
          else 'Jeg deler en bok fra forfatterskapet mitt. Les mer om boken her.' end,
        'publishing_policy','approval_required_rewrite_no_identical_crosspost','private_facebook_profile',false),
      'ready',now()) on conflict (brand_id,source_type,source_id) do nothing;
    if found then v_created:=v_created+1; end if;
  end if;
  return v_created;
end;
$$;
revoke all on function public.curate_freddy_creative_editorial_sources() from public,anon,authenticated;
grant execute on function public.curate_freddy_creative_editorial_sources() to service_role;
