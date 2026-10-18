# Altovena Visibility P3 — owner release authorization contract

Status: design specification only, not implemented. No owner approval or publication authority is granted by this document.

## Independent gates
1. SEO observation and design request.
2. Candidate PR on exact commit SHA, required green CI and same-SHA visual review.
3. Explicit fresh owner decision authorizing a precisely scoped handoff.
4. Separate P4 execution authorization, controlled deployment and independently verified public result.

P3 MUST be journal-only in the first implementation: no GitHub writes or merges, no Vercel deployment or production modifications, and no closing work items.

## Security conditions
- Authenticate a genuine server-side OWNER session, origin and CSRF checks, and tenant/brand scope. Client-supplied role or approval flags have no authority.
- Match work item, original owner request, source ID, fingerprint, brand, allowlisted source repository, GitHub PR number and exact PR head SHA.
- Read live GitHub PR status and CI before accepting; changed SHA, closed PR, unavailable response, incomplete checks and stale evidence fail closed.
- Require an existing visual attestation covering the same exact SHA, all specified checks, and no known unresolved failures. Display this as self-reported rather than automated browser proof.
- Owner must actively confirm clearly displayed repository, PR, SHA, exact change scope, target and risks. Default must be not approved.
- Journal server-generated immutable decision ID, approver, timestamps, exact SHA, scope, evidence references, reason and expiration. Avoid secrets and unnecessary personal data.
- Use idempotency keys plus transaction or uniqueness guard against concurrent duplicate decisions.
- If PR, SHA, diff, scope, role, environment or evidence changes, status becomes STALE; owner may explicitly REVOKE before execution. Historical decisions never apply automatically to a new SHA.
- P3 decision status APPROVED_FOR_HANDOFF is never a merge, deployment, publication or repaired-site assertion. publication_authorized=false and execution_started=false remain invariant for P3.

## Proposed UI states
EVIDENCE_INCOMPLETE, READY_FOR_OWNER_DECISION, OWNER_DECLINED, APPROVED_FOR_HANDOFF, STALE, REVOKED, EXECUTION_UNAVAILABLE. UI must show which individual gate is missing and whether verification was automated or manually attested.

## Mandatory regression tests
- Forged identity/header or CSRF, wrong brand/tenant, altered work item, unallowlisted repo and wrong PR are rejected.
- Commit SHA changes or PR closes between display and submit: no positive journal.
- CI red/pending/incomplete, stale CI, missing/old/wrong-SHA visual attestation: no positive journal.
- Duplicate and concurrent submissions do not issue multiple authorizations.
- Revocation invalidates use; old evidence displayed only as history.
- P3 route makes no GitHub write, merge, Vercel deploy, public website change or work-item closure.
- Require exact-head GitHub CI, matching Vercel preview, and manual owner review before merging any implementation PR.

## P4 remains separate
P4 must recheck live state and explicit permission at execution time, create before-version and rollback checkpoints, stop safely on failure and only mark verified after independent public URL inspection confirms the deployed outcome.

Pilot Re-Master PR #48 remains unmerged and unpublished. Nothing in this document approves it.
