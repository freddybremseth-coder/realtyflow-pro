-- SoMe Studio multi-image draft enrichment.
-- Keeps the existing draft-create RPC stable and enriches only drafts created by the same workspace actor.

create or replace function public.workspace_brand_marketing_draft_media_enrich_v1(
  p_brand_key text,
  p_user_id uuid,
  p_email text,
  p_publication_id uuid,
  p_media_urls text[],
  p_content_features jsonb,
  p_source_property_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $workspace_draft_media_enrich$
declare
  v_brand_id uuid;
  v_urls text[] := coalesce(p_media_urls, '{}'::text[]);
  v_url text;
  v_cover text;
  v_org_id uuid;
  v_asset_id uuid;
  v_asset_metadata jsonb;
  v_index integer := 0;
  v_now timestamptz := now();
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_publication_id is null
    or cardinality(v_urls) > 10
    or coalesce(octet_length(coalesce(p_content_features, '{}'::jsonb)::text), 0) > 12000
  then
    return jsonb_build_object('ok', false, 'error', 'INVALID_MEDIA_ENRICH_REQUEST');
  end if;

  if exists (
    select 1 from unnest(v_urls) u
    where u is null
      or length(btrim(u)) < 1
      or length(btrim(u)) > 2000
      or btrim(u) !~ '^https://[^[:space:]]+$'
  )
  or (select count(*) from unnest(v_urls)) <> (select count(distinct btrim(u)) from unnest(v_urls) u)
  then
    return jsonb_build_object('ok', false, 'error', 'INVALID_MEDIA_URLS');
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id = m.brand_id and b.brand_key = p_brand_key
  where m.user_id = p_user_id
    and m.email = p_email
    and m.status = 'active'
    and m.permissions @> array['marketing.read','marketing.draft']::text[]
  for share of m;

  if v_brand_id is null then
    return jsonb_build_object('ok', false, 'error', 'ACCESS_DENIED');
  end if;

  if not exists (
    select 1
    from core.brand_workspace_marketing_draft_audit a
    join public.content_publications cp on cp.id = a.publication_id
    where a.brand_id = v_brand_id
      and a.publication_id = p_publication_id
      and a.actor_user_id = p_user_id
      and a.actor_email = p_email
      and cp.brand_id = p_brand_key
      and cp.status = 'draft'
  ) then
    return jsonb_build_object('ok', false, 'error', 'DRAFT_NOT_OWNED_BY_ACTOR');
  end if;

  if exists (
    select 1
    from unnest(v_urls) candidate(url)
    where not (
      exists (
        select 1
        from public.media_assets ma
        where ma.brand_id = p_brand_key
          and ma.deleted_at is null
          and coalesce(ma.signed_url_required, false) = false
          and candidate.url in (nullif(btrim(ma.public_url), ''), nullif(btrim(ma.thumbnail_url), ''))
      )
      or (
        p_source_property_id is not null
        and exists (
          select 1
          from public.property_brand_visibility pbv
          join public.properties p on p.id = pbv.property_id
          where pbv.property_id = p_source_property_id
            and pbv.brand_id = p_brand_key
            and pbv.visible = true
            and p.show_on_website = true
            and p.website_visible = true
            and (
              candidate.url = nullif(btrim(p.primary_image), '')
              or candidate.url = any(coalesce(p.images, '{}'::text[]))
              or candidate.url = any(coalesce(p.gallery, '{}'::text[]))
            )
        )
      )
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'IMAGE_NOT_APPROVED_FOR_BRAND');
  end if;

  v_cover := case when cardinality(v_urls) > 0 then v_urls[1] else null end;

  update public.content_publications
  set media_urls = v_urls,
      ai_image_url = v_cover,
      thumbnail_url = v_cover,
      content_features = coalesce(content_features, '{}'::jsonb)
        || coalesce(p_content_features, '{}'::jsonb)
        || jsonb_build_object(
          'multi_image', cardinality(v_urls) > 1,
          'media_asset_count', cardinality(v_urls)
        ),
      updated_at = v_now
  where id = p_publication_id and brand_id = p_brand_key;

  if cardinality(v_urls) = 0 then
    return jsonb_build_object('ok', true, 'mediaCount', 0);
  end if;

  select ma.organization_id into v_org_id
  from public.media_assets ma
  where ma.brand_id = p_brand_key
    and ma.organization_id is not null
    and ma.deleted_at is null
  order by ma.created_at asc
  limit 1;

  if v_org_id is null then
    return jsonb_build_object(
      'ok', true,
      'mediaCount', cardinality(v_urls),
      'warning', 'BRAND_MEDIA_ORGANIZATION_MISSING'
    );
  end if;

  foreach v_url in array v_urls loop
    v_index := v_index + 1;
    v_asset_id := null;
    v_asset_metadata := '{}'::jsonb;

    select ma.id, coalesce(ma.metadata_json, '{}'::jsonb)
      into v_asset_id, v_asset_metadata
    from public.media_assets ma
    where ma.brand_id = p_brand_key
      and ma.deleted_at is null
      and v_url in (nullif(btrim(ma.public_url), ''), nullif(btrim(ma.thumbnail_url), ''))
    order by ma.created_at asc
    limit 1;

    if v_asset_id is null then
      insert into public.media_assets (
        organization_id,
        user_id,
        brand_id,
        property_id,
        media_type,
        asset_type,
        title,
        description,
        public_url,
        signed_url_required,
        provider,
        ai_generated,
        ai_edited,
        metadata_json,
        tags,
        status,
        content_hub_publication_id,
        exported_to_content_hub_at
      ) values (
        v_org_id,
        p_user_id,
        p_brand_key,
        p_source_property_id,
        'image',
        'uploaded_reference',
        'SoMe Studio · draft media ' || v_index,
        'Godkjent brand-/Inventory-bilde koblet til et SoMe-utkast i Content Hub.',
        v_url,
        false,
        case when p_source_property_id is null then 'realtyflow-social-studio' else 'realtyflow-inventory' end,
        false,
        false,
        jsonb_build_object(
          'workspace_social_studio', true,
          'carousel_index', v_index - 1,
          'role', case when v_index = 1 then 'cover' else 'detail' end,
          'source_property_id', p_source_property_id,
          'source_url', v_url
        ) || coalesce(p_content_features, '{}'::jsonb),
        array['social-studio', p_brand_key, 'content-hub-media'],
        'active',
        p_publication_id,
        v_now
      )
      returning id, metadata_json into v_asset_id, v_asset_metadata;
    else
      update public.media_assets
      set content_hub_publication_id = p_publication_id,
          exported_to_content_hub_at = v_now,
          metadata_json = coalesce(v_asset_metadata, '{}'::jsonb)
            || jsonb_build_object(
              'workspace_social_studio', true,
              'carousel_index', v_index - 1,
              'role', case when v_index = 1 then 'cover' else 'detail' end,
              'source_property_id', p_source_property_id,
              'source_url', v_url
            )
            || coalesce(p_content_features, '{}'::jsonb)
      where id = v_asset_id;
    end if;

    insert into public.media_asset_links (
      organization_id,
      asset_id,
      entity_type,
      entity_id,
      relationship_type
    ) values (
      v_org_id,
      v_asset_id,
      'content_hub_draft',
      p_publication_id::text,
      'attached_to'
    )
    on conflict (asset_id, entity_type, entity_id, relationship_type) do nothing;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mediaCount', cardinality(v_urls),
    'publicationId', p_publication_id
  );
end;
$workspace_draft_media_enrich$;

revoke execute on function public.workspace_brand_marketing_draft_media_enrich_v1(
  text, uuid, text, uuid, text[], jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.workspace_brand_marketing_draft_media_enrich_v1(
  text, uuid, text, uuid, text[], jsonb, uuid
) to service_role;
