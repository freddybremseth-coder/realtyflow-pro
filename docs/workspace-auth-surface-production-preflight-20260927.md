# Workspace Auth Surface Production Preflight — 2026-09-27

Scope: read-only production inspection for future `WORKSPACE_MEMBER` activation. No production policy, user, membership, feature flag, customer, task, message or Storage object was changed during this review.

## Current production result

The same conditions used by `workspace_staff_security_preflight()` were evaluated read-only against the existing Supabase project:

- Required customer/task/message/settings tables with RLS: **OK**
- Private buckets `property-documents` and `caecv-documents`: **present and private**
- Generic authenticated policies on those private document buckets: **8**
- Generic authenticated write/delete policies on operational Storage buckets: **6**
- Direct customer-table policy risks for `contacts`, `work_items`, `portal_messages`, `brand_settings`: **0**
- Direct internal-table policy risks: **2**
- Result for workspace Auth activation today: **BLOCKED**

The two internal-table blockers are the authenticated read policy on `agentic_approvals` and the generic authenticated full-access policy on `plot_assets`.

The six operational Storage write/delete blockers are direct Auth writes for:
- `plot-assets` — insert + delete
- `ad-creatives` — insert
- `olivia-field-observations` — insert + update + delete

The eight private-document blockers are read/insert/update/delete policies for each of:
- `property-documents`
- `caecv-documents`

## Safe server-only hardening staged in this PR

`20260924200000_workspace_known_server_only_auth_hardening.sql` removes only broad direct-Auth policies that current RealtyFlow repository paths demonstrably replace with guarded server/service-role calls:

- `agentic_approvals_read`
- `plot_assets authenticated full access`
- `Authenticated write plot-assets`
- `Authenticated delete plot-assets`
- `Authenticated write ad-creatives`

Public delivery of public plot/ad assets is left unchanged.

This migration is **not applied to production**. Its isolated fixture intentionally preserves all eight private-document policies and the three Olivia write policies, so the safety preflight must remain red after this partial hardening rather than giving a false green result.

## Blockers that remain intentionally unresolved

### Private document buckets

The repository does not contain sufficient evidence that all existing consumers of `property-documents` and `caecv-documents` can lose browser-level authenticated access without regression. Do not drop these eight policies solely to enable staff accounts.

Required next check:
1. Identify every active reader/uploader/updater/deleter of both buckets.
2. Replace broad `authenticated` access with server-mediated or purpose-specific identity-bound routes.
3. Add regression coverage for the existing document workflow.
4. Only then stage/drop the broad policies.

### Olivia field observations

No concrete application path using `olivia-field-observations` was found in the RealtyFlow repository, which makes this an external/legacy-consumer risk rather than proof the policies are unused.

Required next check:
1. Identify the current Olivia client and authentication path.
2. Confirm whether upload/update/delete is still needed.
3. Replace generic authenticated access with a dedicated server route or narrowly scoped identity policy.
4. Preserve Olivia behavior with tests before production policy changes.

## Activation rule

A workspace employee must not be invited or enabled while the production preflight reports any of the direct-Auth blockers above. The feature flag remains off, access plans remain drafts, and PR #1028 remains unmerged until the remaining document/Olivia consumers are understood and the final rollout is explicitly approved.
