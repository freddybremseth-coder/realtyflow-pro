# Altovena Command – Independent analysis approval v0.1

**Status:** Stacked draft on [PR #1431](https://github.com/freddybremseth-coder/realtyflow-pro/pull/1431). No production migration, public API, worker, model provider call or customer records.

## Analysis permit lifecycle

1. The mission owner creates and prepares a Command routing proposal, with zero model calls and zero allowed external actions.
2. A privileged **private** database worker may call `altovena.request_analysis_permit` to register a **pending** read-only permit for the specific tenant, mission, verified actor, independent reviewer, agent, model, canonical plan/goal digests, evidence digest and tiny token/cost ceilings.
3. A separate source-retrieval service (**not implemented**) must authenticate and authorize each source, capture a stable snapshot and attest its combined digest. The new `analysis_evidence_attestations` table is a **private contract**, not a public upload endpoint. There is currently no application path to create attestations.
4. An independently authorized reviewer may call `altovena.review_analysis_permit` with `approve` or `reject`. Approval checks current membership, mission ownership, plan immutability, evidence attestation by the reviewer, permit expiry, tenant product and available budget. An absent, revoked or expired attestation blocks approval.
5. Append-only `analysis_permit_review_events` separately records the actor's request and reviewer decision; the reviewer cannot equal the requester.
6. A new `BEFORE INSERT` fence on `analysis_reservations` checks both approved review evidence and an active matching source attestation immediately before reserving budget. If the source attestation is later revoked, no new reservation may be opened, even for an otherwise approved permit.

## Deliberate release restrictions

- Review functions are `SECURITY INVOKER` in the private `altovena` schema, with EXECUTE revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Tables use default-deny RLS and no Data API grants.
- The SQL migration does **not** issue actual permissions to a new worker role or connect to an authenticated owner/reviewer session. A privileged database role could bypass private tables; choosing a narrowly permissioned runtime role is a separate security milestone.
- Merely writing an attestation row does **not** establish source authenticity. A real source-ingest service must prove per-tenant authorization, independently capture source bytes, store their revisions, and manage revocation/retention.
- This review is only permission for **read-only AI analysis**. It is **not** approval for Nexus dispatch, CRM changes, publication, or external communication.
- Provider feature flag stays OFF. The previous stored Command preparation remains capped at 0 calls/0 budget.
- Reviewer assignment and review events cannot substitute for user authentication. No client-supplied user ID can be trusted; future HTTP handlers must derive identities from verified sessions.

## Tested in disposable PostgreSQL 17

- Requesting one's own approval denied.
- Wrong reviewer cannot approve.
- Approval without source attestation denied.
- Independently verified evidence allows approval.
- Approval audit is append-only and repeated approval fails.
- A reviewed permit may reserve budget once; revocation of source attestation blocks any later reserve.
- Existing concurrent quota, tenant isolation and Command/Nexus zero-dispatch test suites remain required.

## Remaining milestones

Implement authenticated reviewer UI and service-identity mapping, a tenant-aware source snapshot/attestation service, restricted DB role, permit revocation review events, real provider precharge and postcharge reconciliation, privacy-safe immutable result storage, cancellation and crash recovery. Validate in isolated staging before any production release.
