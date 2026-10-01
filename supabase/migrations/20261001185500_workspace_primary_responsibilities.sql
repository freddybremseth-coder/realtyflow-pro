alter table core.brand_workspace_responsibilities
  add column if not exists primary_responsibilities text[] not null default '{}';

alter table core.brand_workspace_responsibilities
  drop constraint if exists brand_workspace_responsibilities_primary_subset_check;

alter table core.brand_workspace_responsibilities
  add constraint brand_workspace_responsibilities_primary_subset_check
  check (primary_responsibilities <@ responsibilities);

alter table core.brand_workspace_responsibility_audit
  add column if not exists primary_responsibilities text[] not null default '{}';

create or replace function core.audit_brand_workspace_responsibilities()
returns trigger language plpgsql security definer set search_path = '' as $workspace_responsibility_audit$
begin
  insert into core.brand_workspace_responsibility_audit
    (brand_id,user_id,responsibilities,primary_responsibilities,actor_email)
  values (new.brand_id,new.user_id,new.responsibilities,new.primary_responsibilities,new.updated_by_email);
  return new;
end; $workspace_responsibility_audit$;

revoke execute on function core.audit_brand_workspace_responsibilities()
  from public, anon, authenticated, service_role;

comment on column core.brand_workspace_responsibilities.primary_responsibilities is
  'Subset of assigned responsibilities that the user owns as primary work. This affects prioritisation only, never authorisation.';
