# Altovena → RealtyFlow / Nexus: execution claims, phase 1 (October 2026)

## Scope and result
This change lives in the **active RealtyFlow Pro application**, not in Altovena's static marketing site. It adds a **server-side task execution admission / claim contract** and tests only.

It stages a **private database schema and atomic claim function as a GitHub migration file**. The migration is NOT applied to the production Supabase project. It does **not** create any live API endpoint, worker, customer task, provider action, enabled entitlement or production audit receipt. Production is unchanged.

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
- Review and apply the staged additive migration `supabase/migrations/20261015212600_nexus_execution_task_claim_store.sql` in an isolated, project-representative staging Supabase environment before any production decision. Tables are under the existing private `core` schema, RLS is enabled and no execution authorizations are seeded. The migration does not modify existing business tables.
- A database transaction is drafted in `core.claim_nexus_execution_task`: row locks, current member/capability validation, preflight freshness, approved action digest/version, unique claim and same-transaction claim audit. It is tested on a disposable PostgreSQL 16 instance; this is not a staging Supabase verification of existing live permissions, auth or API exposure.
- Current verified session and active `core.brand_workspace_memberships` grant; no trusting client-provided permissions, brand IDs, timestamps, approval details or mutable JWT user metadata.
- Task and approval records authored by the server; content digest computed over a canonical action payload. Evidence/source IDs must point to actual permissible records.
- Approval revocation, expiration, content edits, race between two workers and retry after process restart must all fail closed or return a genuine existing claim.
- Outbound suppression, sender-brand identity, product-specific controls, audited receipts and manual stop/rollback strategy.
- Explicit product activation for each supported action class; not a generic arbitrary tool executor.

## Test coverage
A memory-only adapter simulates durable claim behavior to test admissions and races. It is **not** evidence that production PostgreSQL transactions, RLS, permissions, receipts or worker execution work.

The targeted CI workflow runs this contract and existing Nexus execution-boundary tests, **and also applies the staged migration to a disposable PostgreSQL 16 instance**. Its SQL checks deny-by-default behavior, first claim, replay returning the original claim ID, unauthorized changed-key replays and an exactly-once claim/audit/task-state commit. This is not production deployment or a test against the real Supabase tenant configuration.

## Release notes
- Altovena's public-facing Demo Workspace still uses static illustrative data, with no live execution or CRM writes.
- A new migration file exists in GitHub, but **no production Supabase database changes or migrations were executed**. No API routes, live grants, worker, new credentials or external actions were deployed.
- Treat the work as a proposed internal building block in a feature PR, **not a launched agent platform**.

## Explicit activation and compatibility blockers
- The active Supabase database has not been checked for current `core` schema drift or conflicting migration revisions. Do not apply without schema diff, advisors and an isolated staging run.
- `core.nexus_execution_authorizations` starts empty; existing workspace membership alone does not activate agent execution. An audited owner-controlled grant writer, approval writer and task writer must be designed separately.
- `claim_nexus_execution_task` runs inside PostgreSQL and commits a reservation, not execution. It has a three-action internal-draft allowlist and accepts only a service-role caller. A backend adapter must **derive and verify the actor** from a real authenticated session before supplying a UUID; never trust a submitted actor ID, brand, approval or content hash.
- The private `core` function is not necessarily exposed by PostgREST. Plan an approved backend database connection/controlled RPC integration rather than opening the schema to browsers.
- The current TypeScript repository interface uses string task IDs while SQL uses UUIDs. A typed adapter and contract normalization are still required; no adapter has been connected.
- Transaction-level replay tests run sequentially; a separate multi-connection concurrency test, crash/restart recovery, revoked-grant races and full immutable lifecycle audit are still required before activation.
