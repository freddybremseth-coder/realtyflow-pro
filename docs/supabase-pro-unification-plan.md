# Supabase Pro Unification Plan (Phase-by-Phase)

## Status (verified 2026-05-08)
- `https://ereapsfcsqtdmzosgnnn.supabase.co/rest/v1/` returns `200`
- Storage API returns `200`
- Auth health returns `200`
- Core tables respond without timeout

## Target Architecture
- One Supabase project as primary source of truth.
- Shared `auth.users` identity across all SaaS apps.
- Logical separation by schema (`core`, `publishing`, `growth`, `olivia`, `integrations`).
- Tenant isolation via RLS (row-level security), not by separate projects.

## Phase 1 (implemented)
- Added multi-tenant foundation migration:
  - `core.tenants`
  - `core.profiles`
  - `core.tenant_memberships`
  - `core.apps`
  - `core.tenant_apps`
  - `core.brands`
  - `core.is_tenant_member(...)`
  - RLS baseline policies
  - `public.brand_tenant_map` compatibility view

## Phase 2 (next)
1. Map current brands into `core.tenants` + `core.brands`.
2. Add `tenant_id` to high-value public tables (`content_publications`, `ad_campaigns`, `publishing_books`, etc).
3. Backfill `tenant_id` using existing `brand_id` mappings.
4. Add RLS policies based on `core.is_tenant_member(tenant_id)`.

## Phase 3 (automation + AI)
1. Add `integrations.event_bus` table for cross-app events.
2. Use RPC/functions to emit events (example: new expense -> Olivia monthly analysis refresh).
3. Add queue workers (Edge Functions/Cron) to process events asynchronously.
4. Add vector knowledge tables for ChatGenius in a shared schema with tenant guardrails.

## Phase 4 (commercial SaaS readiness)
1. Stripe customer/subscription mapping by tenant.
2. Usage metering tables (tokens, posts, campaigns, AI runs).
3. Plan/limit enforcement per tenant in DB policies/functions.
4. Unified Business Overview from one API endpoint with aggregated truth.

## Operational Rules
- Keep one project while traffic is manageable and integration speed matters most.
- Split to a second project only if:
  - strict legal/data residency requires it, or
  - noisy-neighbor workload becomes persistent even after optimization.
- Keep cron safe mode available for incident control.

