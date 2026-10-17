# Altovena Analysis – controlled provider adapter v0.1

**Development only. No deployed route, live AI invocation or production permission.**

## Intent and safety
Altovena Command has routing proposals and immutable zero-call analysis preparations (PR #1428). PR #1429 adds evidence validation and a GitHub-CI-only simulated model. This stacked change introduces a **real OpenAI Responses API request adapter** that remains inaccessible in normal operation.

- **Off by default:** requires `ALTOVENA_ANALYSIS_PROVIDER_ENABLED=true`, a separately scoped `ALTOVENA_ANALYSIS_API_KEY`, and an explicit `ALTOVENA_ANALYSIS_MODEL`. No fallback to the generic Nexus AI client or provider chain.
- **No HTTP route / no worker / no cron / no UI button** calls the adapter. Do not enable the flag in production until permission infrastructure and staging are reviewed.
- **Verified identity and scope:** the caller must provide a *trusted server-derived* scope and an independent analysis permit. The permit must match tenant, mission, verified actor, agent, goal hash, routing hash, allowed model and a short expiry.
- **Reservation first:** the caller supplies `AnalysisAdmissionRepository`. Its **future production implementation** must atomically check current entitlements, source access, rate limits, quotas, idempotency and reserve maximum cost **before** the network request. Only a durable `reserved` receipt can proceed. No such real database adapter or issuing endpoint is introduced here.
- **Bounded request:** one Responses API POST; `tools: []`, `tool_choice: none`, `store: false`, `truncation: disabled`, strict JSON-schema output and a capped maximum output token allowance. No automatic retry/fallback if the response fails.
- **Citation verification:** the model response is untrusted; every finding must match the server-authorized source snapshot and remain `awaiting_human_review`. Exact quotation does not establish semantic or factual correctness.
- **Metering:** provider-reported input/output/total tokens are checked. A failed, incomplete or unverified provider response is marked `uncertain` for charge reconciliation; no automatic retry. The adapter **cannot guarantee a hard monetary limit** by itself; preauthorized DB budget reservation, pricing/version lock, provider dashboard limits and reconciliation are prerequisites for activation.

## Non-goals
- This is not an integration with the ChatGPT user's subscription or conversation history. An API credential and separate API billing are required for future live calls.
- It does not approve tasks, mutate RealtyFlow/Olivia data, send emails, publish, create Nexus execution claims or log real customer data.
- The existing `altovena.mission_analysis_preparations` table **still enforces 0 calls and 0 cost**; it is not a valid analysis permit.
- Mock repository/fetch tests do not prove a real database lease or token/cost billing security. Those require isolated staging.

## Pre-production gates
1. Implement and test authenticated analysis-permit issuance with independent review.
2. Build a tenant-scoped `AnalysisAdmissionRepository` backed by isolated PostgreSQL with atomic reserve, revoke, expiry, idempotency and budget accounting.
3. Bind source retrieval to tenant membership/brand grants, immutable snapshots, retention and GDPR data minimization. Input evidence is untrusted.
4. Prove proper rate limiting, provider account spend caps, token reservation pricing and post-request reconciliation under crashes/retries.
5. Store the review packet and evidence audit transactionally with privacy controls. Never mark complete without saved evidence.
6. E2E security tests: wrong tenant, revoked permit, duplicate submission, crash during network request, prompt injection in sources and human-review decision.
7. Only after staging passes, expose an internal approval-gated analysis endpoint and separately authorize limited rollout.

## Source
OpenAI Responses API documentation: https://platform.openai.com/docs/api-reference/responses
