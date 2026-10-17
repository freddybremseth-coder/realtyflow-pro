# Altovena Command — real read-only analysis readiness status v0.1

**Status:** stacked draft on PR #1435. No production migration, active AI dispatch or independent reviewer login.

## Visible user experience

In owner-only Command, each saved Nexus routing plan can be inspected using **Se analysestatus**. A no-store read-only API requests a single, verified owner's Command mission from the private internal Altovena tenant.

The returned status reflects **actual rows**, not samples or hardcoded demonstrations:
- Whether an immutable analysis preparation has been saved.
- Whether authorized source snapshots have been stored, and how many.
- Whether an independent source attestation is currently valid, absent or revoked/expired.
- Whether a separate read-only analysis permit exists, and its state.
- The latest recorded requester/reviewer decision.
- An explicit `execution_enabled=false`. No model execution or external action is exposed.

## Trust and permissions

- `/api/altovena/command/analysis/readiness` supports GET only, requires the platform owner's signed `owner-session`, and checks a mission UUID. Server-side calls derive actor email from that verified owner session, not request parameters.
- Narrow `public.altovena_internal_command_analysis_status(uuid,text)` is the only new Data API function, with EXECUTE for `service_role` only. It resolves a confirmed actor, the active internal tenant and a mission **created by that actor** before returning status metadata. Existing private source/permit tables retain RLS and zero API grants.
- No raw source excerpts, client lists, provider keys, API costs or user memberships are exposed.
- This view is a diagnostic only. The platform owner cannot impersonate an independent reviewer or authorize AI execution through it.

## CI

An isolated PostgreSQL test checks that status matches the saved, independently source-attested fixture and is denied for wrong actor or unknown mission. Static route/UI contract tests assert GET-only access, owner-session enforcement and absence of write/dispatch calls.

## Remaining blockers

Real authorized source connectors, source version/retention policy, trusted reviewer session-to-DB identity, secure review decision endpoints, provider pre-charge/reconciliation, and end-to-end staging. The model provider flag remains OFF; all stacked PRs remain drafts.
