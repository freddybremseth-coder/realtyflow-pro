-- Personal Intelligence OS — atomic claim correction runtime.

create or replace function personal_core.correct_claim(
  p_owner_user_id uuid,
  p_claim_id uuid,
  p_source_id uuid,
  p_value_text text default null,
  p_value_json jsonb default null,
  p_confidence numeric default 0.9500,
  p_privacy_level text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  prior personal_core.claims%rowtype;
  replacement_id uuid;
begin
  select * into prior
  from personal_core.claims
  where id = p_claim_id
    and owner_user_id = p_owner_user_id
  for update;

  if not found then
    raise exception 'Claim not found for owner';
  end if;

  if p_value_text is null and p_value_json is null then
    raise exception 'Correction requires text or JSON value';
  end if;

  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence must be between 0 and 1';
  end if;

  if p_source_id is not null and not exists (
    select 1 from personal_core.sources s
    where s.id = p_source_id and s.owner_user_id = p_owner_user_id
  ) then
    raise exception 'Source does not belong to owner';
  end if;

  update personal_core.claims
  set status = 'superseded',
      valid_to = coalesce(valid_to, now()),
      updated_at = now()
  where id = prior.id;

  insert into personal_core.claims (
    owner_user_id,
    subject_entity_id,
    predicate,
    value_text,
    value_json,
    claim_type,
    status,
    confidence,
    source_id,
    valid_from,
    supersedes_claim_id,
    privacy_level,
    requires_confirmation,
    confirmed_at
  ) values (
    p_owner_user_id,
    prior.subject_entity_id,
    prior.predicate,
    p_value_text,
    p_value_json,
    prior.claim_type,
    'validated',
    p_confidence,
    p_source_id,
    now(),
    prior.id,
    coalesce(p_privacy_level, prior.privacy_level),
    false,
    now()
  )
  returning id into replacement_id;

  return replacement_id;
end;
$$;

revoke all on function personal_core.correct_claim(uuid, uuid, uuid, text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function personal_core.correct_claim(uuid, uuid, uuid, text, jsonb, numeric, text) to service_role;

comment on function personal_core.correct_claim(uuid, uuid, uuid, text, jsonb, numeric, text)
is 'Atomically supersedes one owned personal claim and creates a validated replacement preserving provenance and history.';

notify pgrst, 'reload schema';
