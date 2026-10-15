# Altovena → RealtyFlow / Nexus: execution claims, phase 1 (October 2026)

## Scope and result
This change lives in the **active RealtyFlow Pro application**, not in Altovena's static marketing site. It adds a **server-side task execution admission / claim contract** and tests only.

It does **not** create a database table, API endpoint, worker, customer task, provider action, entitlement, or real audit receipt. Production is unchanged; integration is off until a separate reviewed PR and migration.

## Reuse first
Existing components already in RealtyFlow:
- `src/lib/nexus/action-policy-registry.ts`: allowlisted action classes (AUTO_SAFE, DRAFT_ONLY, HUMAN_REQUIRED, WAIT, FORBIDDEN).
- `src/lib/nexus/execution-boundary.ts`: fresh preflight, evidence, runtime switch, audit readiness, idempotency, explicit approval for selected existing actions.
- `src/lib/agentic/approval-gateway.ts`: queue/decision records; an approval is NOT evidence of execution.
- `src/lib/agentic/executor.ts` and services: limited executors and receipts. **Do not attach new Altovena actions to those providers by default.**
- `src/lib/agentic/ids.ts`: stable SHA-256 operation idempotency identity.

`src/lib/nexus/task-execution-claim.ts` is an *additional, stricter gate for future Altovena-originated tasks*. It composes the existing Nexus execution policy, rather than weakening or replacing it.

## New phase-1 flow
1. Authorized server loads task by ID from an authoritative brand-scoped store.
2. Server verifies task status/version, evidence pointers and quality review.
3. It reads the bound human approval from that store; checks exact task, brand, action type, SHA-256 content digest, version, reviewer separation, expiry.
4. It enforces existing Nexus action-class and preflight controls. Unknown, forbidden, human-only and draft-only action classes fail closed here.
5. A future storage adapter must reserve execution **atomically** with expected version, approval validity, current membership, unique idempotency and an immutable audit event. Only the adapter is permitted to issue a durable `claimed` receipt.
6. A separate allowlisted worker can eventually consume claims **after another fresh policy/security check**. Claiming must not itself perform a customer action.

## MUST exist before any live connection
- A private PostgreSQL schema + reviewed migration; strong tenant isolation, immutable audit events and a unique idempotency constraint.
- A single transaction (or carefully reviewed SQL RPC) for status compare-and-swap, approval invalidation/withdrawal check, membership verification, claim insert and audit append.
- Current verified session and active `core.brand_workspace_memberships` grant; no trusting client-provided permissions, brand IDs, timestamps, approval details or mutable JWT user metadata.
- Task and approval records authored by the server; content digest computed over a canonical action payload. Evidence/source IDs must point to actual permissible records.
- Approval revocation, expiration, content edits, race between two workers and retry after process restart must all fail closed or return a genuine existing claim.
- Outbound suppression, sender-brand identity, product-specific controls, audited receipts and manual stop/rollback strategy.
- Explicit product activation for each supported action class; not a generic arbitrary tool executor.

## Test coverage
A memory-only adapter simulates durable claim behavior to test admissions and races. It is **not** evidence that production PostgreSQL transactions, RLS, permissions, receipts or worker execution work.

The targeted CI workflow runs this contract and existing Nexus execution-boundary tests.

## Release notes
- Altovena's public-facing Demo Workspace still uses static illustrative data, with no live execution or CRM writes.
- No Supabase database changes, API routes, new credentials or migrations were deployed.
- Treat the work as a proposed internal building block in a feature PR, **not a launched agent platform**.
