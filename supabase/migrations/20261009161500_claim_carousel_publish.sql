-- Claim a carousel publication only once. On ambiguous Meta outcomes, retain
-- 'publishing' for manual reconciliation rather than risking a duplicate post.
create or replace function public.claim_content_carousel_publish(p_publication_id uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare v_claimed integer;
begin
  update public.content_publications set status='publishing',updated_at=now()
  where id=p_publication_id and status in ('draft','failed')
    and visual_format='carousel';
  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;
revoke all on function public.claim_content_carousel_publish(uuid) from public;
revoke all on function public.claim_content_carousel_publish(uuid) from anon, authenticated;
grant execute on function public.claim_content_carousel_publish(uuid) to service_role;
