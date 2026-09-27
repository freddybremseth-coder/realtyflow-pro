-- PRE-ACTIVATION hardening for direct Supabase Auth surfaces.
--
-- RealtyFlow operational/admin writes are server-mediated. Olivia still has a
-- legitimate browser-authenticated workflow, so its Storage access is kept but
-- aligned with the same olivia_private.is_internal_user() gate already used by
-- Olivia table RLS (farmer/super_admin only).
--
-- No workspace member is created or activated by this migration.

-- Approval data is served through guarded server routes. A generic Supabase
-- authenticated token must not be able to read the entire approval queue.
drop policy if exists "agentic_approvals_read" on public.agentic_approvals;

-- Plot metadata contains customer visibility/distribution controls. RealtyFlow
-- plot asset create/update/delete runs through authenticated server API routes
-- backed by the service-role client, so generic authenticated table access is
-- unnecessary and unsafe for a future WORKSPACE_MEMBER Auth identity.
drop policy if exists "plot_assets authenticated full access" on public.plot_assets;

-- Keep plot/ad public-read delivery unchanged. Only direct browser writes are
-- removed; server upload/delete continues through the service-role client.
drop policy if exists "Authenticated write plot-assets" on storage.objects;
drop policy if exists "Authenticated delete plot-assets" on storage.objects;
drop policy if exists "Authenticated write ad-creatives" on storage.objects;

-- Production advisor drift check found three SECURITY DEFINER functions with
-- browser-role EXECUTE that are not browser APIs. Keep the dedicated restricted
-- runtime grant for Nexus Commercial Activation, and keep the email function as
-- trigger-only; remove PUBLIC/anon/authenticated execution when the functions
-- exist in the target database.
do $workspace_revoke_security_definers$
begin
  if to_regprocedure('public.nexus_commercial_activation_contact_guard(uuid,text,timestamp with time zone)') is not null then
    revoke execute on function public.nexus_commercial_activation_contact_guard(uuid, text, timestamptz)
      from public, anon, authenticated;
  end if;
  if to_regprocedure('public.ensure_nexus_commercial_activation_work_item(uuid,text,timestamp with time zone,text,text,text,text,text,integer,jsonb)') is not null then
    revoke execute on function public.ensure_nexus_commercial_activation_work_item(
      uuid, text, timestamptz, text, text, text, text, text, integer, jsonb
    ) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.sync_email_admission_review_work_item()') is not null then
    revoke execute on function public.sync_email_admission_review_work_item()
      from public, anon, authenticated;
  end if;
end;
$workspace_revoke_security_definers$;

-- Olivia private documents: preserve the existing authenticated client flow,
-- but require the same internal identity gate as olivia.property_documents and
-- olivia.caecv_documents. A normal RealtyFlow workspace account is not an
-- Olivia farmer/super_admin and therefore receives no direct Storage access.
drop policy if exists "Allow authenticated read property documents storage" on storage.objects;
create policy "Allow authenticated read property documents storage"
  on storage.objects for select to authenticated
  using (bucket_id = 'property-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated insert property documents storage" on storage.objects;
create policy "Allow authenticated insert property documents storage"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'property-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated update property documents storage" on storage.objects;
create policy "Allow authenticated update property documents storage"
  on storage.objects for update to authenticated
  using (bucket_id = 'property-documents' and olivia_private.is_internal_user())
  with check (bucket_id = 'property-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated delete property documents storage" on storage.objects;
create policy "Allow authenticated delete property documents storage"
  on storage.objects for delete to authenticated
  using (bucket_id = 'property-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated read caecv documents storage" on storage.objects;
create policy "Allow authenticated read caecv documents storage"
  on storage.objects for select to authenticated
  using (bucket_id = 'caecv-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated insert caecv documents storage" on storage.objects;
create policy "Allow authenticated insert caecv documents storage"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'caecv-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated update caecv documents storage" on storage.objects;
create policy "Allow authenticated update caecv documents storage"
  on storage.objects for update to authenticated
  using (bucket_id = 'caecv-documents' and olivia_private.is_internal_user())
  with check (bucket_id = 'caecv-documents' and olivia_private.is_internal_user());

drop policy if exists "Allow authenticated delete caecv documents storage" on storage.objects;
create policy "Allow authenticated delete caecv documents storage"
  on storage.objects for delete to authenticated
  using (bucket_id = 'caecv-documents' and olivia_private.is_internal_user());

-- Olivia field images stay available to the existing Olivia internal roles,
-- while generic authenticated workspace users cannot upload, replace or delete.
drop policy if exists "Olivia authenticated users can upload field observation images" on storage.objects;
create policy "Olivia authenticated users can upload field observation images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'olivia-field-observations' and olivia_private.is_internal_user());

drop policy if exists "Olivia authenticated users can update field observation images" on storage.objects;
create policy "Olivia authenticated users can update field observation images"
  on storage.objects for update to authenticated
  using (bucket_id = 'olivia-field-observations' and olivia_private.is_internal_user())
  with check (bucket_id = 'olivia-field-observations' and olivia_private.is_internal_user());

drop policy if exists "Olivia authenticated users can delete field observation images" on storage.objects;
create policy "Olivia authenticated users can delete field observation images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'olivia-field-observations' and olivia_private.is_internal_user());

comment on table public.agentic_approvals is
  'Approval queue is server-mediated; generic authenticated direct reads are intentionally disabled.';
comment on table public.plot_assets is
  'Plot asset administration is server-mediated; public website visibility remains controlled by explicit public-read policy.';
