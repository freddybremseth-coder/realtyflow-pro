# Nexus AI Development Workspace — implementation plan

Status: initial code contract added; NOT an active task executor or ChatGPT account bridge.

## Decision

Extend the existing **Nexus AI** global conversation. Do not introduce a second bot.
The existing `/api/nexus/victoria` and `ChatWidget` are already wired in
`src/app/layout.tsx`. They support advice and some governed CRM/marketing actions.
They do NOT yet accept durable development work, run GitHub changes, or sync
ChatGPT account history/memory.

## User outcome

Owner can say "rett feilen på Content Studio", "fortsett utviklingen av Altovena",
or "lag en PR for dette", from inside RealtyFlow. A recorded task must be linked
to its brand, source page, requester, repository, agent actions, tests, preview,
approval, and eventual deployment. "Fortsett" must resolve against a specifically
selected active task, never guess from an unrelated conversation.

## Workflow

1. Authenticated user submits a development request in Nexus AI.
2. Server validates the user, role and brand access and creates a durable task.
   Text entered into chat is never permission to execute code.
3. A planner proposes scope, affected repositories/files and acceptance criteria.
4. Owner approves a bounded execution plan. Staff may request tasks only
   where their brand permissions allow; never gain system/GitHub access.
5. A job runner uses scoped GitHub credentials to create a feature branch and PR,
   never pushes directly to main. Each tool action is audited.
6. CI/tests and Vercel preview must pass before a reviewer can approve merge.
7. Production promotion requires a separate explicit authorization and recorded
   deployment verification. "Done" means verified state, not just a proposal.
8. Status and evidence return to the existing Nexus AI conversation.

## First implementation stages

- **Stage 0 (this branch):** typed, non-executing development intake and
  approval transition contract with isolated tests. No database writes.
- **Stage 1:** add authenticated owner-only development task API, durable
  Supabase tables with RLS, request idempotency and actor/brand audit fields;
  only expose safe task CRUD and status tracking in Nexus AI.
- **Stage 2:** implement read-only GitHub/Vercel context retrieval and planning.
- **Stage 3:** enable approved scoped GitHub feature-branch changes, PR creation,
  test reporting and preview links.
- **Stage 4:** human-reviewed merge/deploy workflow and richer continuation.
- **Stage 5:** evaluate externally sellable Altovena tenant-isolated workspace.

## Data model proposal

`nexus_development_tasks`: id, title, full_request, scope, brand_id,
source_path, requester_user_id, owner_user_id, repository_allowlist,
status, idempotency_key, created_at, updated_at.

`nexus_development_events`: append-only event_id, task_id, actor_user_id,
event_type, previous_status, next_status, tool_name, external_reference,
evidence, created_at. Never store provider secrets or raw access tokens.

`nexus_development_approvals`: task_id, revision, approval_type
(plan_execution | merge | production_release), approved_by, approved_at,
plan_hash, expires_at. Approvals must bind exact immutable plan/revision.

## Hard security constraints

- Explicit OWNER access initially; no client-submitted role or identity trust.
- Access checks on every API operation, not only in navigation.
- No chat string as an executable shell command, SQL statement or tool argument.
- Fixed repository/project allowlists and per-action tool scopes.
- No implicit use of personal ChatGPT session, cookies, memory or subscription.
- OpenAI API integration uses separately configured server-side credentials.
- Cross-brand task content/access is denied unless policy explicitly allows it.
- Human approval before external writes; separate approval before production.
- Audit every attempted action, outcome and related PR/deployment identifier.
- Retries are idempotent. Failure leaves task blocked, never falsely "complete".
- Keep existing CRM/content/finance permissions and automations unchanged.

## Verification for a functional release

A task survives sign-out/in and browser changes; exact task context resumes;
unauthorized workspace member gets 403; development messages do not mutate
GitHub before approval; failures are shown; CI and preview evidence are linked;
production release needs new approval; no system can report "deployed"
without a deployment identifier plus verification evidence.

## Immediate limitation

This PR is architecture and intake-contract groundwork only. It does not make
the Nexus AI chat execute development tasks, persist them, or connect to the
user's ChatGPT account. The first usable interface requires Stage 1.
