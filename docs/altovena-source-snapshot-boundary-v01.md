# Altovena Command – private source snapshot boundary v0.1

**Status:** code in stacked draft branch. No production migration, public endpoint, live connector, active AI calls or permitted outbound actions.

## Purpose

A model's claimed source citation is never sufficient. Each source in an analysis must first be read via an **authorized, server-side source connector**, captured to an immutable tenant/mission-bound snapshot and reviewed independently. This change adds the capture/storage/attestation contracts and tests, but does not silently claim that a real external data source has been connected.

## Components

- `command-analysis-source-capture.ts`: tenant-, mission- and actor-bound capture. Accepts **source IDs only**, never arbitrary URLs or user/model-supplied text. A separately trusted connector must authenticate and authorize each read. Rejects wrong tenant, mission, actor, expired captures, public source URLs, duplicates, invalid IDs and excessive length.
- `command-analysis-source-postgres.ts`: minimal private PostgreSQL snapshot persistence contract; accepts an **injected private database client** only. It does not connect credentials or expose a route.
- `altovena.analysis_source_bundles` and `altovena.analysis_source_snapshots`: private append-only tables with strict bounds, immutable source text and SHA-256 hashes. No permissions for `PUBLIC`, `anon`, `authenticated` or `service_role`; RLS enabled.
- `altovena.save_analysis_source_bundle`: validates authoritative tenant, draft mission, owner membership, existing preparation, source structure, capture freshness and source hashes. Recomputes the **canonical bundle digest in PostgreSQL** and rejects anything that differs. Never overwrites a stored source.
- `altovena.attest_saved_analysis_sources`: separate reviewer step for a pending permit. Only the independently authorized reviewer associated with the permit can attest a matching, recently captured bundle.
- A new attestation trigger disallows claiming a source digest as verified when there is no matching stored source bundle.
- Existing no-tools provider adapter now uses the same canonical digest to bind a model request to that source bundle.

## Important truthfulness limits

The connector interface is not a working Google Drive, Gmail, browser or CRM data access integration. The CI reader uses synthetic source material. A future connector must prove **actual source permissions** on every read, preserve a source version or revision, minimize personal data, enforce retention and explicit user/tenant scope. A privileged database writer can still claim an actor/reviewer identity if not bound to a trusted service. **Do not activate this pipeline until narrowly permissioned identities and independently authenticated reviewers exist.**

This gate does not semantically verify AI claims or prevent prompt injection from a trusted-but-untrusted-as-instructions document. Human review is mandatory. It does not authorize Nexus execution, emailing, publishing or CRM mutation. The saved preparation remains **0 model calls / 0 cost**.

## Verification

GitHub CI executes pure TypeScript source-capture and private-storage adapter tests, then applies the schema in ephemeral PostgreSQL 17 and tests wrong actor, fake source digest, attempt to attest without source storage, immutable snapshots, duplicate storage denial, independent source review and zero Nexus dispatch.

## Remaining before production

1. Tenant-aware, separately authenticated source connectors for the required RealtyFlow, Drive or other accounts, backed by actual permissions rather than client claims.
2. Dedicated least-privilege source capture and reviewer DB identities, with service-to-user authentication and clear GDPR retention/deletion controls.
3. UI for independently authenticated reviewers and an audit-visible source review interface with readable original evidence.
4. Isolated staging and end-to-end billing/permit/identity recovery tests; no provider dispatch until all gates pass.
