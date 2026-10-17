# Altovena + Nexus — one integration lineage (17 October 2026)

## The workstream to continue

**Canonical code path:** RealtyFlow Pro GitHub. This is not a separate SaaS backend, model worker, or parallel codebase. The customer-facing Altovena site must not silently replace RealtyFlow/Nexus as the backend source of truth.

| PR | Role | Allowed merge sequence |
|---|---|---|
| #1423 — Nexus Execution Engine | Origin of private task/review/claim/cancellation schema, read-only boards and safety tests | **Contained in #1428. Do not independently merge alongside #1428.** |
| #1427 — Altovena Command planning | Origin of owner-only mission/agent-proposal store | **Contained in #1428. Do not independently merge alongside #1428.** |
| #1428 — Command + Nexus integration | Combined, reviewed integration base including both origin branches | **Review combined CI and stage before deciding how to promote.** |
| #1429 — Command analysis evidence gate | Stacked on #1428; evidence-verified analysis drafts, mock-only model harness, boundary tests | **Merge into #1428 first, if approved; do not merge directly into main.** |

GitHub ancestry was checked: #1428 contains #1423 and #1427; #1429 descends directly from #1428. New work should be added to the newest relevant stacked branch after reading current heads and overlapping changes. **Do not create another independent PR for the same modules or duplicate the execution engine.**

## Invariants shared across chats and branches

1. Command route proposals and source-verified analysis drafts are **not** independent human approval, Nexus task admission, or permission to dispatch. Review packets must remain `awaiting_human_review` and explicitly not executable.
2. `altovena.tenant_id` and `core.brand_id` are distinct; no implicit conversion. Before writing any bridge, implement authenticated, auditable tenant→brand mapping with separate negative permission tests.
3. Approved task reservation is **not** execution. `eligible_now` from post-claim revalidation is a point-in-time observation, not an execution permit. A separately reviewed worker-side check/lease protocol remains a release blocker.
4. All direct DB changes, model calls, provider tools, sending/publishing and production rights remain OFF. Proposed migrations are exercised only in disposable CI until a dedicated staging environment is approved and tested.
5. Update all downstream stacked branches if a parent changes; check branch ancestry, paths, current main SHA, CI and PR bases. Preserve modifications from other sessions and the existing Altovena Command UI.

## Collaboration rule

Separate ChatGPT conversations do **not** automatically share a single active coding session or independently coordinate GitHub writes. Before continuing on a new turn, inspect the repository, these four PRs, branch ancestry, latest commits and CI. A user saying **«fortsett»** means continue the **latest non-duplicative integration milestone** after reconciling the actual code, not resume an outdated PR as a competing branch.

The single record of progress is the PR and commit history, not a chat thread. Keep user-facing status precise: identify code **implemented**, CI **passed or pending**, and production **unchanged or actually deployed**. Never claim staging, model invocations or worker execution that has not occurred.

## CI regression for the integration boundary

`src/lib/altovena/command-analysis-nexus-isolation.test.ts` uses real production contract functions (with synthetic inputs) to prove that a source-cited Command analysis still cannot:
- authorize Nexus execution;
- substitute a tenant UUID for brand permission;
- bypass an independently verified Nexus principal;
- issue a claim through any Command API or UI route.

This is a contract-level regression, not a replacement for staging, PostgreSQL permissions, real sessions or provider execution tests.
