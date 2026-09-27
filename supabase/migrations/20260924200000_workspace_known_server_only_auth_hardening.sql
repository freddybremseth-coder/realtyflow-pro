-- PRE-ACTIVATION hardening for direct Supabase Auth surfaces that this repo
-- demonstrably accesses through server/service-role routes only.
--
-- This migration is intentionally partial. It does NOT touch:
--   * property-documents / caecv-documents authenticated Storage policies
--   * olivia-field-observations authenticated Storage write policies
-- because those may be consumed outside this RealtyFlow repo and require a
-- separate regression review before production changes.
--
-- No workspace member is created or activated by this migration.

-- Approval data is served through guarded server routes. A generic Supabase
-- authenticated token must not be able to read the entire approval queue.
drop policy if exists "agentic_approvals_read" on public.agentic_approvals;

-- Plot metadata contains customer visibility/distribution controls. RealtyFlow
-- plot asset create/update/delete runs through authenticated server API routes
-- backed by the service-role client, so the generic authenticated table policy
-- is unnecessary and unsafe for a future WORKSPACE_MEMBER Auth identity.
drop policy if exists "plot_assets authenticated full access" on public.plot_assets;

-- Keep the bucket public-read behavior unchanged. Only remove direct browser
-- write/delete grants; server upload/delete uses the service-role client.
drop policy if exists "Authenticated write plot-assets" on storage.objects;
drop policy if exists "Authenticated delete plot-assets" on storage.objects;

-- Ad creative uploads are performed by server-side campaign generation using
-- the service-role client. Public asset delivery is unchanged; only generic
-- authenticated direct uploads are removed.
drop policy if exists "Authenticated write ad-creatives" on storage.objects;

comment on table public.agentic_approvals is
  'Approval queue is server-mediated; generic authenticated direct reads are intentionally disabled.';
comment on table public.plot_assets is
  'Plot asset administration is server-mediated; public website visibility remains controlled by explicit public-read policy.';
