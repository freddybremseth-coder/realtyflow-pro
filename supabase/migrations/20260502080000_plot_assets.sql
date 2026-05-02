-- ─── Plot Assets ──────────────────────────────────────────────────
-- Documents and images attached to land plots, with per-asset visibility
-- controls so the user can decide whether each file should appear on the
-- public website, in the customer portal, or stay archived.

create table if not exists plot_assets (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references land_plots(id) on delete cascade,

  -- file
  filename text not null,
  content_type text,
  size_bytes bigint default 0,
  storage_path text not null,
  public_url text not null,

  -- categorization
  kind text default 'document'
    check (kind in ('image', 'document', 'video', 'plan', 'photo', 'other')),
  title text,
  description text,
  tags text[] default '{}',
  display_order int default 0,

  -- distribution / visibility
  show_on_website boolean default false,           -- public website
  visible_in_portal boolean default false,         -- customer "Min side"
  visible_to_customer_ids uuid[] default '{}',     -- specific customers can see it

  -- audit trail of where this asset has been pushed
  distribution_log jsonb default '[]'::jsonb,
    -- [{target: "customer"|"content_studio"|"email"|"portal", target_id?, sent_at, status}]

  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_plot_assets_plot on plot_assets(plot_id);
create index if not exists idx_plot_assets_kind on plot_assets(kind);
create index if not exists idx_plot_assets_public on plot_assets(show_on_website) where show_on_website = true;
create index if not exists idx_plot_assets_portal on plot_assets(visible_in_portal) where visible_in_portal = true;

-- Auto-update updated_at
create or replace function touch_plot_assets()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_plot_assets on plot_assets;
create trigger trg_touch_plot_assets
  before update on plot_assets
  for each row execute function touch_plot_assets();


-- ─── Storage bucket ───────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('plot-assets', 'plot-assets', true)
on conflict (id) do nothing;

drop policy if exists "Public read plot-assets" on storage.objects;
create policy "Public read plot-assets"
  on storage.objects for select
  using (bucket_id = 'plot-assets');

drop policy if exists "Authenticated write plot-assets" on storage.objects;
create policy "Authenticated write plot-assets"
  on storage.objects for insert
  with check (
    bucket_id = 'plot-assets'
    and (auth.role() = 'authenticated' or auth.role() = 'service_role')
  );

drop policy if exists "Authenticated delete plot-assets" on storage.objects;
create policy "Authenticated delete plot-assets"
  on storage.objects for delete
  using (
    bucket_id = 'plot-assets'
    and (auth.role() = 'authenticated' or auth.role() = 'service_role')
  );


-- ─── RLS on plot_assets ───────────────────────────────────────────
alter table plot_assets enable row level security;

drop policy if exists "plot_assets authenticated full access" on plot_assets;
create policy "plot_assets authenticated full access"
  on plot_assets for all
  using (auth.role() in ('authenticated', 'service_role'))
  with check (auth.role() in ('authenticated', 'service_role'));

-- Public read of assets that are explicitly marked for the website
drop policy if exists "plot_assets public read public-only" on plot_assets;
create policy "plot_assets public read public-only"
  on plot_assets for select
  using (show_on_website = true);
