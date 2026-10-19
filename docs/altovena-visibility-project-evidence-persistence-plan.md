# Altovena Visibility — persistent project evidence: implementation boundary

Status: design and pure TypeScript event contract only. Not deployed, no database migration applied.

## Intended persistence
Use an append-only server-owned event ledger in the RealtyFlow shared database, scoped by tenant/brand and project URL. Persist:
- unique event ID, tenant/brand ID, canonical project URL, fact key
- event kind, server-derived actor identity, server timestamp
- immutable source pointer/document ID, source revision/hash, claim revision and optional reviewer notes
- revocation referencing an earlier attestation
- independent validation result, stored separately and bound to source hash

Never store private brochure content in public tables or send it to browser dashboards. A public URL or uploaded document is evidence *location*, not confirmation that its contents support a claim.

## Security and delivery checklist
1. Discover the production schema and existing tenant isolation before choosing any table names or migration.
2. Review Supabase security guidance, migration history and RLS policies; forbid anon access, scope authenticated access to authorized brand membership, and do not trust client-supplied reviewer IDs.
3. Create migration using repository-standard Supabase CLI migration workflow; include indexes, NOT NULL, immutable events and exact auth policies.
4. Write a server-only write service requiring explicit actor permissions, immutable event IDs and revision checks.
5. Add authenticated owner/editor UI for review and revocation with read-only evidence view for appropriate brand operators.
6. Cover cross-tenant denial, forged actor identity, replay, concurrency, stale source, source revocation, audit history, and sensitive-document handling.
7. Run migration and RLS tests, GitHub CI and preview; require explicit production rollout authorization.
8. Always keep publication approval separate from evidence readiness and review attestation.

## Current implementation notes
- `visibility-project-evidence.ts` validates syntactic evidence readiness only.
- `visibility-project-evidence-history.ts` computes event history in memory only. It is not database persistence, enforcement, cryptographic provenance or independent verification.
- `visibility-project-gate-adapter.ts` keeps publication ineligible.
- No workflow should label an item VERIFIED or DONE from these contracts alone.
