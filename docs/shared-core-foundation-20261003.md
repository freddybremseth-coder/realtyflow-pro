# Shared Core foundation · phase 1

Date: 2026-10-03

## Locked architecture

RealtyFlow is one platform with four user-facing work apps:

- Sales
- Marketing
- Content
- Finance

Shared Core + Nexus sit underneath the work apps. Platform / Operations is the owner/admin surface.

This phase starts the internal extraction without replacing proven production backends.

## Canonical domains

### Identity and customer context

CRM contacts, brand context and the existing workspace/access model remain shared. A work app may own a customer journey, but it must not create a parallel customer identity store.

### Finance

`business_financial_events` is the canonical business ledger.

Existing source patterns are preserved and formalized:

- CRM → verified sale value / commission
- KDP → royalties
- SaaS → revenue / MRR
- Olivia → explicit farm-business adapter
- Family → explicit Mondeo bridge only
- manual → explicit owner/admin adjustment

`billing_documents` and `billing_payments` enrich the Finance view. They do not become a second revenue ledger.

Family personal transactions must never be imported wholesale. Family remains master for the Mondeo model and only the dedicated, already-established Mondeo bridge enters RealtyFlow Finance.

Olivia remains master for farm-operational concepts such as parcels, harvest operations, irrigation and certification. Only explicit business financial events cross into Shared Core Finance.

### Media

Media Studio is the canonical media service:

- `media_assets`
- `media_generation_jobs`
- `media_projects`

Content Hub and Marketing reuse those assets. Re-Master remains a specialist renderer and should bridge reusable outputs into the canonical asset model rather than create a second generic media library.

### Tasks and automation

This domain is still being extracted. Existing work items, automation registry, Care tasks and Olivia operational tasks stay live until a reusable task/action contract is verified.

### Audit and evidence

Existing audit, approval and execution evidence stays authoritative. Shared services must retain actor, source, correlation and observed outcome.

### Nexus feedback

The target loop is:

Content → Marketing → Sales → Finance → Nexus learning.

Learning may use observed evidence across apps, but must not infer a sale or financial outcome from reach/click activity alone.

## Guardrails

1. One canonical reusable service per domain.
2. No copy/paste forks without a temporary migration note.
3. No customer, brand, media or finance data silo per work app.
4. Existing production routes remain available during migration.
5. Source systems keep specialist concepts they uniquely own.
6. Cross-app synchronization must be explicit, idempotent and auditable.
7. Personal Family data is not a generic RealtyFlow source.
8. A migrated capability must declare its owner, system of record and consumers.

## Extraction order

1. Formalize Shared Core Finance contracts and source boundaries.
2. Move Finance ingestion code to those contracts.
3. Surface Shared Core status under Platform / Operations.
4. Bridge reusable Re-Master media outputs into Media Studio.
5. Normalize reusable task/action primitives.
6. Connect cross-app evidence into the Nexus learning loop.
