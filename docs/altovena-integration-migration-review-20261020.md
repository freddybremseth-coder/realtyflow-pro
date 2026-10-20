# Altovena integration: database migration risk review
20 October 2026 · Review of draft PR #1476, not approval or execution.

## Existing authoritative RealtyFlow rules
Refer to `docs/realtyflow-production-migration-path.md` and
`docs/production-migration-workflow.md` (on main). Repository CI, Re-Master
migration tests and Vercel builds **do not currently apply production Supabase
migrations**. Production schema has historical drift. Never run the whole
`supabase/migrations` backlog against production. Execute only one reviewed,
checksummed file after independent schema preflight, explicit owner approval,
and an operator/verification plan.

**Implication:** merging application source does not prove a migration applied.
However it publishes API route code and may change unrelated RealtyFlow
behavior; separate feature flags and a protected release plan remain required.

## Reviewed Altovena-specific SQL
1. `20261014210000_altovena_brand_intake.sql`:
   - **Data write at migration time:** inserts active `core.tenants` and
     `core.brands` entries for Altovena, guarded by ON CONFLICT.
   - Defines receipt table, contacts/work-items intake RPC, task mutation RPC,
     health check, and a BEFORE DELETE trigger on shared `public.contacts`.
   - **High review priority**: shared-CRM FK and trigger side effects; no
     generic bulk rollback/drop of CRM data is acceptable.
2. `20261017212000_altovena_lead_alert_queue.sql`:
   - Additive alert and per-operator read state tables, reconciliation and
     acknowledgement RPCs. References existing shared `work_items`.
   - Check existing brand and schema and service role ACLs before apply.
3. `20261018094500_altovena_delivery_preflight.sql`:
   - Creates candidates/prepare/status RPCs; does **not send email**.
   - Depends on prior alert migration and service-side recipient authorization.
4. `20261018120500_altovena_smtp_attempt_boundary.sql`:
   - Creates durable unique SMTP attempt state and claim/finalize/status RPCs.
   - SMTP acceptance is **not delivery**; uncertain outcomes must not be
     automatically retried. Does not itself create a sender or schedule.
5. `20261020124500_altovena_staging_login_limiter.sql`:
   - Durable atomic HMAC-identifier login budget with RLS and a restricted
     service-role RPC. Intended only for **isolated staging**, not to be
     indiscriminately applied to production.

All five create named tables/functions with restricted service_role grants
and RLS; those properties have been statically inspected, but the **actual
production schema state, drift, function collisions, row ownership and
runtime lock impact have not yet been independently verified**.

## Safe separation of changes
- **Merge decision (code):** independently review effects on existing RealtyFlow
  modules, schema-dependent startup paths, environment-flag defaults and
  the exact `vercel.json` diff. Altovena background jobs are **not scheduled**
  in the integrated candidate.
- **Staging decision:** obtain actual Supabase cost quote and approval, then
  create an isolated project or preview branch; never reuse production
  service keys, production identities or customer data.
- **Migration decision:** use reviewed SQL one file at a time with a verified
  target, checksum, current-schema snapshot, narrow maintenance plan and
  recorded operator. First migration may add an active tenant/brand; this
  is not a no-op just because web intake remains off.
- **Launch decision:** separate human authorizations for actual intake,
  cron activation, SMTP and existing-business workflows.

## Stop conditions
Do **not** run broad `supabase db push`, install the staging limiter in
production by accident, expose credentials in CI, accept GitHub success as
proof of migration application, or merge this draft solely because all
tests passed. The approver must explicitly decide what goes live and when.
