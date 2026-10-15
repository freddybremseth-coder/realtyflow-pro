# Altovena → RealtyFlow / Nexus: execution claims, phase 1 (October 2026)

## Scope and result
This change lives in the **active RealtyFlow Pro application**, not in Altovena's static marketing site. It adds a **server-side task execution admission / claim contract** and tests only.

It stages a **private database schema and atomic claim function as a GitHub migration file**. The migration is NOT applied to the production Supabase project. The subsequent branch includes a **disabled-by-default, owner-only read API** and an internal task-board UI. The API performs SELECTs only when explicitly enabled and a separately provisioned read-only PostgreSQL connection exists. No mutation API, worker, customer task, provider action, enabled entitlement or production audit receipt exists. Production is unchanged.

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
- `core.nexus_execution_authorizations` starts empty; existing workspace membership alone does not activate agent execution. An audited owner-controlled **grant writer** and trusted application identity binding remain necessary. The staged migration contains DB task/approval writers, but there is no authenticated application route or admin workflow to invoke them.
- `claim_nexus_execution_task` runs inside PostgreSQL and commits a reservation, not execution. It has a three-action internal-draft allowlist and accepts only a service-role caller. A backend adapter must **derive and verify the actor** from a real authenticated session before supplying a UUID; never trust a submitted actor ID, brand, approval or content hash.
- The private `core` function is not necessarily exposed by PostgREST. Plan an approved backend database connection/controlled RPC integration rather than opening the schema to browsers.
- The typed internal PostgreSQL adapter now validates UUID inputs and binds query parameters. It has **not** been connected to a real pool, session, API route or worker.
- Transaction-level replay tests run sequentially; a separate multi-connection concurrency test, crash/restart recovery, revoked-grant races and full immutable lifecycle audit are still required before activation.

## Phase 2: staged proposal / independent review lifecycle
The **same unmerged migration file** now also contains:
- `core.create_nexus_review_task`: only allowed internal-draft action types, SHA-256-bound idempotent proposal key, non-empty evidence references, current active brand membership with `tasks.joint.write` plus explicitly enabled `propose` capability. Task is saved as `review_required`, not executable.
- `core.decide_nexus_review_task`: brand-scoped `review` capability, independent reviewer, task row lock, expected version and exact action digest. A single approved/rejected decision advances the task version, stores its version-bound decision and an immutable decision event. It does not perform a preflight or invoke any external tool.
- `core.nexus_execution_task_events`: append-only proposal / review audit, with no browser or authenticated-user table access. No proposal/review/execution capability is activated automatically.
- Isolated PostgreSQL lifecycle contract: no implicit rights, tampered proposal deduplication, self-approval denial, double-decision denial, blocked claim before preflight, tested positive reviewed claim after a **privileged test-fixture-only preflight update**, and terminal rejection. This CI simulation is not production readiness.

## Phase 2: internal-only TypeScript database adapter
`src/lib/nexus/task-execution-postgres.ts` defines a typed and parameterized backend adapter for creating a proposal, recording a human decision, reading task+approval records and calling the atomic claim function. It is not instantiated in an HTTP API or a worker and has no database connection string, secret or side effect on its own. Its tests mock the SQL boundary and prove that invalid action types are blocked, parameters stay bound, and stale claims cannot be reported as successful.

**Still required:** explicit server-side verified identity (not caller-provided actor IDs), secure database connectivity to private `core`, permission/activation user interface with independent approval, external preflight writer and evidence provenance, production migration review, expiry/revocation handling, immutable full lifecycle/recovery tests and operational monitoring. No `service_role` key or PG credential may be exposed to browsers. No task execution enabled by this PR.


## Phase 3: internal owner task board (read only)

- Navigation: Platform / Operations → Agentoppdrag (`/nexus-os/agent-oppdrag`).
- Endpoint: `GET /api/nexus/task-board`. Requires RealtyFlow owner session (not staff, owner-preview impersonation or remaster-proxy); `requireAdminApi` also applies.
- **Feature disabled by default:** `NEXUS_TASK_BOARD_READ_ENABLED` must explicitly equal `true` to permit any database access. When disabled or missing connection, the UI displays a clear unavailable state rather than synthetic data or incorrect counts.
- Separate server-only `NEXUS_TASK_BOARD_DATABASE_URL` credential must be provisioned as a **least-privilege read-only PostgreSQL account**, with TLS certificate verification. It must be independently granted SELECT on the exact required `core` tables and no INSERT/UPDATE/DELETE/EXECUTE or public schema access. No credentials are shipped in code or templates.
- The SELECT is brand-UUID-filtered, parameterized, bounded to 50 rows and exposes only task identifier/brand, lifecycle status, action type, evidence count, quality/preflight flags, decision expiry, reservation flag and proposal/review events. It does not expose raw source contents, PII, or credentials.
- **No POST/PATCH/DELETE endpoint** and no approval/execute buttons. A stored decision is not interpreted as proof that an external action occurred.
- Andrea/brand operators are intentionally **not yet granted access**. A separate endpoint must verify current identity and exact active per-brand membership and a dedicated `nexus.read` capability; do not grant owner-level access to solve this.
- This PR is **not yet a deployed integration**: no staging database connection, real Supabase migration, user grant reconciliation, UI end-to-end test or provider worker is activated.


## Phase 4: brand-scoped staff task board (read-only, disabled by default)

- The private `core.nexus_execution_authorizations` enum now also allows a separate `view` capability; **no view grants are seeded**. It is not inferred from `tasks.joint.write`, Brand Operations, or `nexus.read`.
- Route `GET /api/workspaces/[brandKey]/nexus-task-board` is limited to `zeneco` and `pinosoecolife`, and to an active, independently verified `WORKSPACE_MEMBER` / read-only owner-preview identity. Existing `requireBrandWorkspace(request,brandKey,"nexus.read")` checks the exact current brand grant and Supabase Auth user; the private database additionally verifies an enabled `view` capability and current `nexus.read` membership.
- The SQL that reads task rows **rechecks** both identity and current per-brand membership in the same row-filtering statement, never falling back to another brand. The staff route enforces that every returned task belongs to the requested brand.
- Both `NEXUS_TASK_BOARD_READ_ENABLED` and `NEXUS_TASK_BOARD_STAFF_READ_ENABLED` must equal `true` for any staff database connection. Both default to disabled. The server-side `NEXUS_TASK_BOARD_DATABASE_URL` and independently verified TLS remain mandatory.
- Staff URL `/workspace/[brandKey]/agent-oppdrag` is linked only inside ZenEco / Pinoso workspaces with existing `nexus.read` permission. The page and API are GET-only and contain no approval or execution action. No demo rows impersonate real records.
- Production access for Andrea is **not** activated. The eventual grant must be explicitly set per allowed brand after owner approval, with test accounts and revocation checks.

### Supabase read-only compatibility finding
A read-only metadata inspection of the currently connected active RealtyFlowPRO project showed existing RLS-enabled `core.brands` and `core.brand_workspace_memberships`, and **none** of the proposed `nexus_execution_*` tables. This was a SELECT-only inspection; no migration or production data was modified.

The connected Supabase account did not reveal a clearly separate, active RealtyFlow staging project. Before activation, create/use a dedicated isolated staging environment and verify the private schema, SSL trust, permissions and migration history. A dedicated PostgreSQL read-only identity must have explicit narrowly scoped SELECT grants **and appropriate RLS policies** for the required private tables; simply granting SELECT to a non-BYPASSRLS user with RLS enabled yields no rows. Do not solve that by granting service_role to the browser or broadly opening the core schema. Design and test the role/RLS model before enabling `NEXUS_TASK_BOARD_READ_ENABLED` or `NEXUS_TASK_BOARD_STAFF_READ_ENABLED`.

Staff workflow tests currently mock database responses, while isolated PostgreSQL tests exercise the opt-in view capability and its revocation. Full end-to-end integration with actual Auth sessions, a restricted DB reader credential, Supabase staging, and production browser routes remains a release blocker.
