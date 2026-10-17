# Altovena Command – verified analysis evidence gate v0.1

**Status:** staged source-code and disposable CI test harness only. **Not production, not real AI provider calls, not a human decision or Nexus execution approval.**

## Why

Command can save routing proposals and immutable analysis preparations in the `altovena` schema. Nexus execution tasks and claims reside separately in `core`. These are distinct identity, data and authorization boundaries. There is **no** trusted general mapping between Altovena tenants and RealtyFlow brands. The current preparation schema intentionally permits **zero** model calls and **zero** model costs.

This follow-up prepares a separate evidence-gate contract rather than weakening those restrictions.

## Implementation

- `src/lib/altovena/command-analysis-evidence.ts` validates a model-generated **candidate**, tied to an expected mission, tenant, verified actor, selected agent, original goal hash and routing hash.
- Each proposed factual finding must cite a source ID found in a **server-authorized evidence catalog** with tenant match, SHA-256 of the fetched excerpt, captured timestamp and a quote present verbatim. Client/model-provided URLs alone do not establish source authenticity.
- The validator rejects unsupported references, wrong-tenant material, duplicate citations, excessive findings, unknown/extra output fields, forged action permission and nonempty tool-use reports.
- Accepted output is marked `awaiting_human_review`, with `approvedForExecution=false`, `externalActionsPerformed=0`. Quote matching is **not** proof that the claim is factually correct. Human interpretation and independent approval are mandatory.
- `src/lib/altovena/command-analysis-ci-harness.ts` has a **GitHub Actions-only**, opt-in mock-model callback. One invocation returns an untrusted candidate and reported usage. The harness rejects excessive **reported** input/output tokens and cost; these after-the-fact checks are NOT production provider spending controls.
- Test scopes are synthetic; no real customer records or provider credentials are used.
- Neither module creates an HTTP route, scheduled worker, database write, CRM change, outbound message, live model call or Nexus task. The existing stored preparation is still immutable and non-executing.

## Release gates before a real AI worker

1. Verify owner/user identity server-side, per-tenant/per-brand memberships, and authorize each specific source read; reject source access with cross-tenant negative tests.
2. Create a separate, auditable and revocable **analysis execution permit** with model-specific preauthorization of maximum spend, token limits, expiry, concurrency and rate limits. The existing zero-call preparation is not a permit.
3. Build a production model adapter with no tool access, provider credential isolation, request timeouts, cancellation, input/output token ceilings and independent measured billing telemetry.
4. Store evidence snapshots, provenance and model output in an append-only, access-controlled review store; guarantee idempotency, source revision tracking, and crash/retry handling.
5. Implement independent reviewer assignments with evidence links and clear **claim-support validation** (semantic support is not established by exact quote matching).
6. Test in isolated staging with separate accounts and brands, RLS, cost ceilings, revoked permissions, malformed models, prompt injection in evidence text and audit completeness.
7. Only after explicit owner approval, promote a separately gated analysis-only route. No external execution follows from analysis approval.

## Workflow

Use the stacked PR into the integration branch (RealtyFlow PR #1428). Do **not** merge the stacked PR directly to `main` before resolving its base/dependencies and verifying final combined CI.
