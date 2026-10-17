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

The connected Supabase account did not reveal a clearly separate, active RealtyFlow staging project. Before activation, create/use a dedicated isolated staging environment and verify the private schema, SSL trust, permissions and migration history. A dedicated PostgreSQL read-only identity must inherit only the **NOLOGIN** `nexus_task_board_reader` role defined in the staged migration. It grants SELECT on just two private, deliberately column-limited `core.nexus_task_board_*` views, and no grants to task, approval, authorization, claims or membership base tables. These are owner-executed SQL views (default Postgres view semantics), so their audited projections—not per-user base-table RLS—form the DB disclosure boundary. The API remains responsible for authenticated brand membership, exact requested brand and verified actor binding. Never grant `service_role` to a browser or broad `core` access to the reader.

Staff workflow tests currently mock database responses, while isolated PostgreSQL tests exercise the opt-in view capability and its revocation. Full end-to-end integration with actual Auth sessions, a restricted DB reader credential, Supabase staging, and production browser routes remains a release blocker.


## Phase 5: least-privilege database board reader — staged, not activated
- Private `core.nexus_task_board_entries` is a security-barrier view limited to ID, brand key, state, bounded timestamps, evidence **counts** (not contents), quality/preflight flags, current review decision/expiry, reserved flag and at most 30 proposal/review event timestamps. It excludes raw evidence refs, action digest, proposer/reviewer identities, credentials and customer records.
- Private `core.nexus_task_board_allowed_readers` is a security-barrier view projecting only active (`brand_id`, `user_id`) pairs with BOTH an explicitly enabled Nexus `view` authorization and current `nexus.read` brand membership. The staff server validates Auth identity and requested brand independently before making this DB query.
- The migration creates `nexus_task_board_reader` as **NOLOGIN / NOINHERIT**, without direct table privileges or execute privileges on task-mutation functions. Creating/rotating a separate server-side LOGIN role that inherits only this restricted role and supplying a trusted certificate-verified TLS connection are **staging-only future steps**, not performed by this PR. Keep the credential in server-only secret storage, never `NEXT_PUBLIC_`.
- Because these narrowly projected views execute with the view owner's privileges, RLS on underlying private tables remains defense in depth for other pathways but **does not provide tenant isolation on these view results**. The server's verified workspace identity, brand UUID filter and live `allowed_readers` view check are required for tenant isolation. A raw reader connection can see limited metadata across brands; treat the connection string as a high-value server secret. Evaluate per-tenant DB-role isolation or a signed-identity DB RPC in staging if the threat model requires DB-enforced tenant isolation.
- Disposable PostgreSQL 16 checks in `scripts/qa-nexus-board-reader-postgres.sql` validate projected reads, no direct base-table SELECT, no CREATE or mutation-function EXECUTE, view-grant enable/revoke behavior, and failure of UPDATE under the read role.
- **Production gate remains closed** until staging validates real Supabase grants, migration history, schema drift, TLS identity/certificate chain, stale session revocation, distinct brand test users and browser/API behavior. No real customer-agent activity is enabled.


## Phase 6: reject elevated credentials and unsafe TLS overrides before every board read
- Both private board endpoints now call `src/lib/nexus/task-board-connection.ts`, which opens and closes its own server-only `pg.Client`. The endpoints never initiate an action worker or mutation.
- The connection URL must use a PostgreSQL protocol, explicit username, password and database path. It must have **no URL query parameters**. This deliberately blocks `sslmode`, `sslcert`, `sslkey` and `sslrootcert` parameters, which node-postgres can parse in a way that replaces the application's SSL configuration, as well as arbitrary `options` overrides. HTTPS/SSL is enforced with `ssl: {rejectUnauthorized:true}` in the connection configuration. In staging, supply a plain PostgreSQL URL without `?sslmode=...`, and verify certificate trust.
- **Before reading a task**, the connection queries PostgreSQL itself and refuses identities without inheritable `nexus_task_board_reader` role privileges, without SELECT on the two board views, or with any superuser/BYPASSRLS/CREATEROLE/CREATEDB, raw task/approval/membership/claim table rights, schema CREATE, or task mutation RPC EXECUTE. Missing or ambiguous proof, DB errors and revoked grants fail closed. A normal `postgres` / Supabase `service_role` connection will be refused.
- Both endpoints continue to enforce feature flags, owner or workspace authentication, and exact brand scoping **before attempting the DB connection**. Staff grants remain explicitly off until independently approved per brand.
- Contract tests simulate safe and unsafe role proofs and URL downgrade attempts. They are not a substitute for a real TLS handshake and per-role grants check on a dedicated staging Supabase instance.

**Operational note:** The staged PostgreSQL migration defines only the NOLOGIN reader role. A separate **LOGIN** user that receives this role with immediate privilege usage must be created, rotated and audited after approval in staging. If the LOGIN identity cannot inherit the role's SELECT grants without changing the restriction, the API intentionally remains unavailable; do not bypass the role proof.


## Phase 7: credential fixture and TS build correction (staged)
- The actual Next.js build caught a TypeScript narrowing issue: `verifiedUserId` was nullable inside the asynchronous staff reader callback. The verified user ID and brand UUID are now captured and checked before the callback, without loosening access rules.
- Disposable PostgreSQL CI now creates a temporary `LOGIN INHERIT` role, grants only `nexus_task_board_reader`, proves effective board-view access and refusal of the underlying task table and mutation RPC, then revokes membership and verifies access disappears. This is not a credential or role created in Supabase.
- Before a real staging credential is configured, require a dedicated staging project/branch, controlled secret rotation, DB privilege/RLS policy audit, valid TLS hostname verification, staff-owner-scoped E2E tests and explicit release review. Never use production as a staging test database.


## Phase 8: real Node → PostgreSQL board query integration (GitHub Actions CI only)
- After isolated PostgreSQL 16 bootstrap, migration and prior tests, CI provisions a temporary `nexus_board_ci_login` with **only** inherited `nexus_task_board_reader` rights. The password is generated by the ephemeral CI runner, never committed or sent to any customer database.
- `scripts/qa-nexus-board-node.integration.test.ts` opens a **real TCP node-postgres connection** to `127.0.0.1:5432`, asserts the actual database identity using `assertNexusBoardReadOnlyRole`, and runs the production `hasNexusTaskBoardViewGrant` and `loadNexusTaskBoard` functions unchanged against two fictional brands.
- The test checks authorized own-brand rows, cross-brand and revoked-member empty results, owner-level read projection, and direct SELECT/UPDATE privilege denial on protected tables. It requires `GITHUB_ACTIONS=true`, `NEXUS_BOARD_CI_ONLY=true`, a fresh generated test password and fixed localhost host/user to avoid accidental execution against Supabase.
- This **does not test verified TLS**: GitHub's disposable PostgreSQL service uses local TCP without SSL. Live hostname verification, least-privilege Supabase credentials, session-bound browser access, and actual migration application remain strictly staging release gates. It never opens the real production database.
- Read-only live database metadata verification confirms `core.brands.brand_key` matches the canonical ZenEco (`zeneco`) and Pinoso EcoLife (`pinosoecolife`) workspace identifiers. No customer or task rows were read.


## Phase 9: real PostgreSQL parallel-claim and cross-brand race tests

- New `scripts/qa-nexus-claim-concurrency.integration.test.ts` uses **multiple independent PostgreSQL connections**, not a mocked repository, to call `core.claim_nexus_execution_task` simultaneously against the same preflight-approved task in a disposable GitHub Actions PostgreSQL 16 database.
- Two concurrent attempts with the **same** valid idempotency key must produce exactly one `claimed` result and one `duplicate` carrying the identical durable claim ID. The task status/version and a single immutable claim audit event are verified after commit.
- Two concurrent attempts with **different** idempotency keys must produce one claim and one conflict. No second claim or audit row may appear.
- A user authorized in brand A cannot claim a preflight-approved task in brand B; its state and audit are unchanged.
- This is not a production worker or a live customer operation. CI runs only when `GITHUB_ACTIONS`, `NEXUS_BOARD_CI_ONLY`, and `NEXUS_CLAIM_CI_ONLY` are set and connects only to disposable `127.0.0.1:5432` PostgreSQL.
- Remaining release gates include real Supabase staging with separate verified identities and grants, checked RLS/privileges, an authenticated server writer rather than trusted caller parameters, and action-specific allowlisted worker execution with post-claim authorization and cancellation.


## Phase 10: revocation and approval expiry during database lock waits

- The staged private `core.claim_nexus_execution_task` function now **resamples `clock_timestamp()` after acquiring task, approval, executor and reviewer-grant locks**, immediately before its claim insert. It rechecks approval expiry and preflight freshness at this authoritative time. Without this second check, a task waiting on a lock could proceed on the clock sample taken before a deadline expired.
- `scripts/qa-nexus-claim-revocation.integration.test.ts` exercises three real PostgreSQL transaction interleavings: (1) revoke the approval while the claim is blocked by the approval row; (2) disable the executor's dedicated capability while the claim waits for the grant row; (3) move the approval expiry while the claim is blocked and verify that it is rejected after the new deadline.
- The tests use `pg_blocking_pids` to verify **actual** SQL lock contention before releasing the revoker's transaction. They require no real data, do not execute any external action and assert that a rejected attempt leaves zero claim receipts or claim-audit events.
- If a valid claim commits first and revocation follows, the already-committed claim is not automatically rolled back. This is a separate **post-claim cancellation and worker-side authorization** release requirement. No worker is connected in this PR.
- Read/write credentials and real user sessions have not been provisioned. All test transactions run only on disposable GitHub Actions PostgreSQL 16; Supabase staging and full release checks remain mandatory.


## Phase 11: post-claim revocation and cancellation without external action

- The **unapplied** private schema now adds `core.nexus_execution_dispatch_events`, an append-only, one-row-per-claim cancellation audit table, and `core.revalidate_nexus_claim_before_dispatch(claim_id, verified_actor_uuid)`.
- The service-role-only SQL function locks the task and its claim, checks the original claiming principal, and re-locks approval plus current executor and reviewer memberships. It refreshes the clock **after** lock waits to detect expiry and stale preflight. A revoked approval, expired approval, disabled brand grant, stale preflight or task-integrity change atomically cancels an already reserved task, increments its version and appends a uniquely keyed cancellation event.
- Concurrent duplicate checks return the stored cancellation reason with **no additional event**; cancelled tasks are not resurrected through retry of `claim_nexus_execution_task`. The function never performs any provider action.
- A positive result is named `eligible_now`, **not** `executed` or `dispatch_permitted`. It is a point-in-time eligibility observation: authorization can change immediately afterward. No executable worker, dispatch lease, side-effect adapter or authenticated HTTP mutation endpoint is created by this PR.
- Disposable PostgreSQL tests `scripts/qa-nexus-postclaim.integration.test.ts` exercise: unchanged eligibility without side effects; independent claim replay denial after cancellation; post-claim approval revocation; authorization removal; expiry; unauthorized caller denial; and concurrent cancellation with a single immutable event.
- Before authorizing even internal draft execution in production, design a separately reviewed worker that verifies identity, approval, current authorization, cancellation and action digest **at the point of side effect**, handles expiry/lease ownership, and records actual outcomes. An independent staging migration, database credentials and end-to-end permission tests remain mandatory.
