# Altovena Command — private analysis spend ledger v0.1

**Development only. No live migration, exposed API, customer self-service, real model execution or spending.**

## Architecture and trust
- Stacked on [PR #1430](https://github.com/freddybremseth-coder/realtyflow-pro/pull/1430), which depends on #1429 and #1428.
- The existing saved Command preparation allows exactly **zero** model calls and **zero** spending. This PR introduces separate tables for a *future* independently approved analysis permit, and conservative quota reservations.
- All tables, triggers and functions are in the private `altovena` schema; RLS enabled; no `anon`, `authenticated`, or `service_role` grants. Functions are `SECURITY INVOKER`, never publicly exposed.
- There is no permit-issuing route, database client adapter, worker, scheduled task or UI activation.

## Private tables
- `analysis_budget_periods`: explicit owner-provisioned tenant/month ceiling; **missing budget rows mean denied**. The `committed_cents` counter never goes down without an independently reviewed reconciliation process.
- `analysis_permits`: one explicit read-only permit per mission, independently reviewed by an active tenant owner/admin, with separate actor identity, source bundle digest, model, token limits, max reservation (1–20 cents for this test contract), short expiry and revocable status.
- `analysis_reservations`: one durable, unique reservation per permit, bound to actor, tenant, evidence hash and monthly period. States: `reserved`, `completed`, or `uncertain`.
- `analysis_budget_events`: append-only hashed evidence of reservations, settlement and revocation; no raw customer content or provider keys.

## Atomic boundaries
- `altovena.reserve_analysis_budget`: locks the tenant-month budget row before evaluating permit and actor/reviewer membership. Checks tenant entitlement, original prepared mission goal/routing digests, permit expiry and evidence digest. Rejects if monthly ceiling would be exceeded. Writes reservation, monthly committed sum and event in one PostgreSQL transaction.
- `altovena.settle_analysis_budget`: validates reported token counts and result digest; makes a state transition exactly once and retains the upper-bound reservation even after completion. Failed/partial/unknown provider outcomes are `uncertain`; this is **not a verified provider invoice**.
- `altovena.revoke_analysis_permit`: permits the original active reviewer to revoke future reservations. Any later dispatch must recheck revocation; a network request already sent cannot be clawed back.

## Private typed database integration (still disabled)

- `src/lib/altovena/command-analysis-budget-postgres.ts` now implements the `AnalysisAdmissionRepository` interface from the separately gated OpenAI adapter. It requires an injected privileged **private PostgreSQL connection**, does not create credentials or a connection, and exposes no route.
- The SQL reserve function verifies the full submitted permit identity, actor, tenant, **selected Nexus agent**, model, goal/routing/source digests and numeric ceilings against the canonical stored permit; the client cannot upgrade these values.
- Exactly one reservation receipt is returned for the first valid claim. Subsequent claims return `duplicate`; revocation and budget errors return `denied`. Infrastructure failures propagate and prevent model invocation.
- Tests cover the 11-parameter binding, spoofed scope, duplicate returns, infrastructure error separation, completed settlement and uncertain settlement.
- These additions do not implement issuance of production permits or authenticated source retrieval.

## Safety and missing production pieces
1. The schema has **no** tenant-scoped source retrieval authorization or immutable external evidence snapshot store yet; model callers cannot trust a client-provided evidence digest.
2. This does not provide real AI provider spend limits, pricing version locks or a reconciled cash ledger. All reservations conservatively consume the full approved upper-bound. Provider billing may differ.
3. A private `AnalysisAdmissionRepository` now maps to PostgreSQL, but **no authenticated database connection/worker is provisioned or wired**. Before activation, configure a narrowly authorized private worker role and bind source and permit approvals server-side; no public client credentials.
4. Permit issuance and independent review must be authenticated; reviewer IDs must never come from unverified input. Reservations must be revalidated immediately before dispatch, including revocation/cancellation.
5. A worker must atomically save the review packet and audit result, with crash recovery and idempotency. Until then, keep provider feature flag **OFF**.
6. Security and load tests against isolated staging, including malicious source text, multi-tenant access, lock contention, webhook/accounting reconciliation and permission revocation, are mandatory before release.

## Verification
CI runs the proposed schema and test fixtures against an ephemeral PostgreSQL 17 service only. It covers no-grant privacy, wrong tenant/actor/evidence, expired/revoked membership, budget ceiling, duplicate claim/settlement, immutable audit, token bounds and two simultaneous permit reservations racing for one remaining monthly slot.
