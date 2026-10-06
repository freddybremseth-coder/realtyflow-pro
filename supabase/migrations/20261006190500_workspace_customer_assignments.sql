create table if not exists core.workspace_customer_assignments (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  brand_id uuid not null references core.brands(id) on delete cascade,
  brand_key text not null,
  user_id uuid not null,
  email text not null,
  assigned_at timestamptz not null default now(),
  assigned_by text not null,
  reason text,
  updated_at timestamptz not null default now(),
  constraint workspace_customer_assignments_brand_key_check check (brand_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint workspace_customer_assignments_email_check check (email = lower(btrim(email)) and email like '%@%')
);

create index if not exists workspace_customer_assignments_user_brand_idx
  on core.workspace_customer_assignments(user_id, brand_id, assigned_at desc);

revoke all on core.workspace_customer_assignments from public, anon, authenticated;
grant select, insert, update, delete on core.workspace_customer_assignments to service_role;

insert into core.workspace_customer_assignments (
  contact_id, brand_id, brand_key, user_id, email, assigned_at, assigned_by, reason, updated_at
)
select
  c.id,
  b.id,
  b.brand_key,
  'c7777680-b020-44f3-bd65-415e8bd44f5d'::uuid,
  'andrea.thorsnes94@gmail.com',
  coalesce((x.event->>'assignedAt')::timestamptz, now()),
  coalesce(nullif(x.event->>'assignedBy',''),'freddy.bremseth@gmail.com'),
  'no_email_or_dialog',
  now()
from public.contacts c
join core.brands b on b.brand_key = coalesce(c.brand_id,c.brand)
join lateral (
  select event
  from jsonb_array_elements(coalesce((
    select settings->'events'
    from public.brand_settings
    where brand_id='team-workload:assignments'
  ),'[]'::jsonb)) event
  where event->>'resourceType'='CONTACT'
    and event->>'resourceId'=c.id::text
    and lower(coalesce(event->>'ownerEmail',''))='andrea.thorsnes94@gmail.com'
  order by event->>'assignedAt' desc
  limit 1
) x on true
on conflict (contact_id) do update
set brand_id=excluded.brand_id,
    brand_key=excluded.brand_key,
    user_id=excluded.user_id,
    email=excluded.email,
    assigned_at=excluded.assigned_at,
    assigned_by=excluded.assigned_by,
    reason=excluded.reason,
    updated_at=now();

comment on table core.workspace_customer_assignments is
  'Canonical scoped customer ownership for employee workspaces. Does not itself grant access; workspace permission and current Auth identity are still required.';