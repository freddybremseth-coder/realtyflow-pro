# Altovena Command – source-capture authorization boundary v0.1

**Status:** stacked development PR on the latest two-person approval boundary branch. **No Supabase production migration, connected source reader, model calls, customer data access or deployment.**

## Why this is a separate stage

Previous Command milestones introduced:
- Command/Nexus planning with no execution
- Verifiable analysis output based on evidence
- Disabled AI-provider adapter with atomic budget reservation contract
- Private PostgreSQL cost ledger
- Independent human approval and evidence attestation, still with no live source-ingest implementation

**The missing piece is an authoritative source connector.** Evidence must not be assembled directly from text, links, user metadata or retrieved sources supplied by an untrusted client or model.

## Implementation

`src/lib/altovena/command-analysis-source-capture.ts` exports a **dependency-injected boundary** `captureCommandAnalysisSources`, with three required methods that a future trusted connector implementation must supply:

1. `authorize`: resolve a source against the authenticated user, tenant, mission and current source ACL, returning a short-lived `read_analysis` grant
2. `read`: capture the exact source revision using the authorized handle, not an arbitrary URL
3. `revalidate`: check current access again immediately after the read; reject revoked access

**The provided source IDs are opaque, not URLs or filesystem paths.** No generic fetch/browser API or tenant-to-brand mapping is introduced. All authorization callbacks are trusted dependencies; unit tests use stubs. A connector that returns fabricated grants is not a security boundary.

The capture result:
- is restricted to 1–4 sources, 15-minute-fresh snapshots, bounded excerpt sizes and grant expiry
- rejects cross-tenant/cross-mission identities, expired grants, stale or mismatched revisions, revoked access and oversized evidence
- returns the existing `TrustedEvidence[]` type with SHA-256 checked excerpts
- sorts source IDs and calculates `evidenceDigest` in the exact ordering/shape already used by the disabled provider adapter
- also returns `provenanceDigest`, which includes source reference, revision, timestamp and content hash; this is for future provenance migration/review, **not** a substituted active permit digest
- always reports `modelCalls:0` and `externalActionsPerformed:0`; it never writes permits/attestations, calls models, or dispatches Nexus tasks

## Validation

The new TypeScript unit suite checks successful capture, canonical digests, invalid source paths/IDs, duplicates, cross-tenant grants and snapshots, stale versions/times, size limits, revocation-after-read, provider failures and malformed identity. The existing Command–Nexus GitHub integration workflow runs these tests alongside current budget, evidence, review and CI safeguards.

## Critical limitations / release gates

- **No real source connector has been implemented**. Do not claim a real RealtyFlow brand or CRM source has been authorized.
- A generic server client with a `service_role` database key is not a substitute for per-user source ACL.
- The current Altovena tenant UUID and RealtyFlow brand UUID are not globally mapped. A genuine tenant/brand access bridge needs a reviewed, authoritative mapping and revocation behavior.
- Access should also be rechecked **at model admission/reservation time**, not merely after capture; a cached captured bundle cannot override later revocation.
- The existing budget ledger/permit attestation contract must only be written by an audited privileged server process after a real connector and independent reviewer have verified all source revisions.
- Persisted source digests must be bound to tenant, mission, revisions, retention and audit before any AI call; a quote-matching result alone is not factual validation.
- Provider and execution flags remain OFF; no source material should be sent to a model or external endpoint.
- Do not merge the stacked PR directly to `main`: integrate via the existing Altovena/Nexus feature stack after full CI and security review.

## One-chat development coordination

Use this PR as the next dependent increment of the existing stack (#1428 → #1429 → #1430 → #1431 → #1432). Avoid implementing the same feature on a separate parallel branch. The code changes and test outcomes in GitHub are the authoritative record; no ChatGPT conversation alone guarantees synchronized work.
