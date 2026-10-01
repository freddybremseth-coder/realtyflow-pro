create table if not exists core.brand_workspace_responsibilities (
  brand_id uuid not null,
  user_id uuid not null,
  responsibilities text[] not null default '{}',
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id,user_id),
  foreign key (brand_id,user_id)
    references core.brand_workspace_memberships(brand_id,user_id)
    on delete cascade,
  check (responsibilities <@ array[
    'new-leads','property-matching','seo-content','social-reels',
    'newsletter','corporate','nexus-review'
  ]::text[])
);

alter table core.brand_workspace_responsibilities enable row level security;
revoke all on core.brand_workspace_responsibilities from public, anon, authenticated, service_role;
grant select, insert, update, delete on core.brand_workspace_responsibilities to service_role;

create table if not exists core.brand_workspace_responsibility_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  user_id uuid not null,
  responsibilities text[] not null,
  actor_email text not null,
  at timestamptz not null default now()
);
alter table core.brand_workspace_responsibility_audit enable row level security;
revoke all on core.brand_workspace_responsibility_audit from public, anon, authenticated, service_role;
grant select, insert on core.brand_workspace_responsibility_audit to service_role;

create or replace function core.audit_brand_workspace_responsibilities()
returns trigger language plpgsql security definer set search_path = '' as $workspace_responsibility_audit$
begin
  insert into core.brand_workspace_responsibility_audit
    (brand_id,user_id,responsibilities,actor_email)
  values (new.brand_id,new.user_id,new.responsibilities,new.updated_by_email);
  return new;
end; $workspace_responsibility_audit$;

drop trigger if exists trg_brand_workspace_responsibility_audit on core.brand_workspace_responsibilities;
create trigger trg_brand_workspace_responsibility_audit
after insert or update on core.brand_workspace_responsibilities
for each row execute function core.audit_brand_workspace_responsibilities();

revoke execute on function core.audit_brand_workspace_responsibilities()
  from public, anon, authenticated, service_role;

create index if not exists brand_workspace_responsibilities_user_idx
  on core.brand_workspace_responsibilities(user_id,brand_id);

comment on table core.brand_workspace_responsibilities is
  'Non-authorising owner-assigned work priorities for one workspace user inside one brand. Permissions remain the sole authorisation source.';
