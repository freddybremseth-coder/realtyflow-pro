# Command + Nexus — staged integration contract (2026-10-16)

This integration branch combines RealtyFlow PR #1423 (Nexus task-claim controls) and PR #1427 (Altovena Command planning). It does **not** install new migrations on production, grant roles, enable task execution or create external side effects.

## Verified architectural distinction

- `altovena.mission_route_plans` records a tenant-scoped Command **routing proposal**, with `approvedForExecution=false`, empty tool allowlist and agents `not_started`.
- `core.nexus_execution_tasks` and `core.nexus_execution_claims` represent a *different* brand-scoped task-review/claim lifecycle, with explicit membership and grant checks.
- A Command mission is **not** a Nexus task; `altovena.tenant_id` must never be implicitly treated as `core.brand_id`.
- No authenticated service or schema currently maps these identities with independently reviewed action/evidence provenance.

## Added now
- A fail-closed, **read-only** handoff-inspection helper that validates the stored proposal envelope/mission identity, agent statuses and forbidden approval/action flags.
- A clear diagnostic in the Command owner UI instead of suggesting that recommended agents have been launched.
- Integration boundary tests and a dedicated CI workflow; separate Nexus and Altovena PostgreSQL tests must also pass on the combined PR.

## Planned next, gated milestones
1. Verify real owner-session identity, tenant identity and brand-scoped capabilities without exposing service-role keys to the client.
2. Define versioned mission → analysis-request contract, with proof of tenant/brand binding, evidence provenance, budgets, expiry and idempotency.
3. Implement an **analysis-only** worker behind a separate opt-in and per-action allowlist; test hard cancellations, retries, race conditions and cost ceilings.
4. Require independent human action review; preserve immutable approval digest and expiration.
5. Introduce a separately audited execution worker with a last-moment authorization recheck. No external action may be dispatched based only on Command's proposed plan.
6. Verify in isolated staging with real identity/tenant tests, then release through distinct feature gates.

## Release blockers
- Combined final-head CI and isolated PostgreSQL tests.
- Dedicated staging Supabase/DB and reviewed migrations, RLS, role privileges.
- End-to-end tenant isolation and revocation tests.
- Explicit authorized production release; there is no production enablement in this branch.

Keep the original work visible for review and do not merge multiple PRs independently without accounting for the combined integration history.
