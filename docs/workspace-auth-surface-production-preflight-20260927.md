# Workspace Auth Surface Production Preflight — 2026-09-27

Scope: production inspection and staged hardening for future `WORKSPACE_MEMBER` activation. No production user, membership, feature flag, customer, task, message, Storage object or policy was changed during this review.

## Current production result

The same conditions used by `workspace_staff_security_preflight()` were evaluated read-only against the existing Supabase project:

- Required customer/task/message/settings tables with RLS: **OK**
- Private buckets `property-documents` and `caecv-documents`: **present and private**
- Generic authenticated policies on those private document buckets: **8**
- Generic authenticated write/delete policies on operational Storage buckets: **6**
- Direct customer-table policy risks for `contacts`, `work_items`, `portal_messages`, `brand_settings`: **0**
- Direct internal-table policy risks: **2**
- Result for workspace Auth activation in production today: **BLOCKED**

The two internal-table blockers are the authenticated read policy on `agentic_approvals` and the generic authenticated full-access policy on `plot_assets`.

The six operational Storage write/delete blockers are direct Auth writes for:
- `plot-assets` — insert + delete
- `ad-creatives` — insert
- `olivia-field-observations` — insert + update + delete

The eight private-document blockers are read/insert/update/delete policies for each of:
- `property-documents`
- `caecv-documents`

## Olivia consumer investigation

The repository did not show a current RealtyFlow application route using `property-documents`, `caecv-documents` or `olivia-field-observations`, so the legacy consumer was traced from production metadata instead of deleting policies blindly.

Read-only production checks found:

- `property-documents` contains one active PDF object, uploaded 2026-06-05.
- That object maps to an active row in `olivia.property_documents`.
- The object owner is an existing Olivia `super_admin` identity.
- `olivia.property_documents`, `olivia.caecv_documents` and `olivia.farm_observations` already use RLS policies guarded by `olivia_private.is_internal_user()`.
- `olivia_private.is_internal_user()` accepts only identities present in `olivia.user_profiles` with role `farmer` or `super_admin`.
- `caecv-documents` and `olivia-field-observations` currently have no stored objects.

This establishes a safe compatibility boundary: Olivia browser Storage access can remain, but it must use the same internal-user gate as Olivia table RLS. A RealtyFlow workspace employee is not admitted by that gate merely because they have a Supabase Auth account.

## Hardening staged in this PR

`20260924200000_workspace_known_server_only_auth_hardening.sql` is still **not applied to production**. It now stages both parts of the required pre-activation hardening:

1. Remove broad direct Auth access that RealtyFlow already replaces with guarded server/service-role paths:
   - `agentic_approvals_read`
   - `plot_assets authenticated full access`
   - `Authenticated write plot-assets`
   - `Authenticated delete plot-assets`
   - `Authenticated write ad-creatives`

2. Preserve the existing Olivia browser workflow while replacing bucket-only authenticated predicates with:
   - the exact bucket restriction, **and**
   - `olivia_private.is_internal_user()`

This applies to all eight private-document CRUD policies and all three Olivia field-observation write policies.

The preflight migration was updated so an authenticated Olivia Storage policy is considered safe only when every applicable `USING` / `WITH CHECK` expression carries the internal-user gate. Plot/ad direct Auth writes remain blockers regardless.

## Regression coverage

The isolated workspace migration suite now verifies all of the following:

- server-only plot/ad/internal policies are removed;
- all 11 retained Olivia Storage policies are identity-bound;
- an Olivia `super_admin` fixture can still read/write the retained Storage surfaces;
- an ordinary workspace identity can neither read nor write them;
- the final workspace Auth preflight becomes green only after these protections are present.

The test database is explicitly local and isolated; it never connects to production.

## Activation rule

Production remains **blocked** until the staged migrations are deployed and the production preflight is rerun successfully.

After deployment, activation still requires all normal rollout checks to pass before any employee is enabled:
1. production preflight returns `safe_for_workspace_auth = true`;
2. workspace migrations and app CI are green on current `main`;
3. the workspace feature flag is deliberately enabled;
4. the employee is created with only the approved brand/module grants.

No employee has been invited or enabled by this work.
