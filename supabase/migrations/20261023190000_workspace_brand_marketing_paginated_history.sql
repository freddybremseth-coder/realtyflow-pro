-- Brand-scoped paginated publication history.
CREATE OR REPLACE FUNCTION public.workspace_brand_marketing_history(p_brand_key text, p_user_id uuid, p_email text, p_page integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_brand_id uuid;
  v_publications jsonb;
  v_channels jsonb;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['marketing.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'brand_id',p.brand_id,'content_type',p.content_type,
    'title',p.title,'description',p.description,'tags',p.tags,
    'thumbnail_url',p.thumbnail_url,'scheduled_platforms',p.scheduled_platforms,
    'status',p.status,'scheduled_at',p.scheduled_at,'published_at',p.published_at,
    'created_at',p.created_at,'updated_at',p.updated_at,
    'total_views',coalesce(p.total_views,0),'total_likes',coalesce(p.total_likes,0),
    'total_comments',coalesce(p.total_comments,0),'total_shares',coalesce(p.total_shares,0)
  ) order by p.updated_at desc nulls last,p.id),'[]'::jsonb)
  into v_publications
  from (
    select cp.id,cp.brand_id,cp.content_type,cp.title,cp.description,cp.tags,
      cp.thumbnail_url,cp.scheduled_platforms,cp.status,cp.scheduled_at,
      cp.published_at,cp.created_at,cp.updated_at,cp.total_views,cp.total_likes,
      cp.total_comments,cp.total_shares
    from public.content_publications cp
    where cp.brand_id=p_brand_key
    order by cp.updated_at desc nulls last,cp.id
    limit 100 offset (least(greatest(coalesce(p_page, 0), 0), 100) * 100)
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
    'platform',c.platform,'display_name',c.display_name,'is_active',true
  ) order by c.platform,c.display_name),'[]'::jsonb)
  into v_channels
  from public.social_channels c
  where c.brand_id=p_brand_key and c.is_active=true
    and c.platform in ('facebook','instagram','linkedin','youtube','tiktok','pinterest');

  return jsonb_build_object('publications',v_publications,'channels',v_channels);
end; $function$
;
REVOKE ALL ON FUNCTION public.workspace_brand_marketing_history(text,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_brand_marketing_history(text,uuid,text,integer) TO service_role;
