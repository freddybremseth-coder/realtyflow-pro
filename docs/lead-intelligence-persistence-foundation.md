# Lead Intelligence Persistence Foundation

This is PR 3A for Lead Intelligence. It adds the persistence contract and server-side foundation only.

## Scope

Included:

- additive migration for Lead Intelligence intake/profile tables
- server-side persistence validation and repository helpers
- read-only duplicate contact candidate preview helpers
- isolated PostgreSQL migration tests
- unit tests for flags, approval invariants, and PII-safe candidate previews

Not included:

- production migration execution
- UI review workflow
- writes to `public.leads`
- automatic contact creation or contact overwrite
- property matching
- shortlist generation
- customer email/WhatsApp/SMS sending

## Feature Flags

Persistence is disabled by default.

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false
REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET=<server-only secret, at least 32 chars>
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

`REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED` is checked server-side only. The browser cannot enable persistence. Production must not enable this flag until the migration is reviewed, applied through the agreed production migration workflow, and smoke-tested.

`REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET` is required before contact candidate writes. There is no production fallback to plain SHA-256 because phone numbers and emails are low-entropy PII.

## Migration

Migration file:

```text
supabase/migrations/20260614164309_lead_intelligence_persistence_foundation.sql
```

New tables:

- `public.lead_intake_messages`
- `public.lead_analysis_runs`
- `public.buyer_profiles`
- `public.buyer_profile_criteria`
- `public.lead_contact_candidates`

The migration does not modify `public.leads`, `public.contacts`, property tables, email tables, RLS policies on existing objects, storage buckets, or production data.

## Data Handling

`lead_intake_messages.raw_text_restricted` stores plaintext if PR 3B chooses to persist original intake text. The name is deliberately not `encrypted`: application-level encryption is not implemented in PR 3A. Before production persistence is enabled, PR 3B must either avoid raw-text persistence by default or implement an approved retention policy.

Raw text retention rules for this foundation:

- raw text must only be written server-side after Freddy approval
- raw text must not be included in broad list responses
- raw text must not be logged
- `raw_text_retention_until` should be set when raw text is retained
- `redacted_at` should be set when raw text is removed or replaced with `[REDACTED]`
- production activation must define who can view raw text and when it is purged

`lead_analysis_runs` stores validated structured result JSON only. It does not include a provider raw-output column.

`lead_contact_candidates` stores HMAC-SHA256 lookup values with a versioned prefix (`hmac-sha256:v1:`), candidate IDs, scores, and safe reasons. It does not store full phone numbers or email addresses. The HMAC payload includes `brand|kind|normalizedValue` so the same phone or email cannot be trivially correlated across brands without the server-side secret.

## RLS And Access

RLS is enabled on all new tables.

No browser policies are created. In particular, the migration does not create any `USING (true)` or `WITH CHECK (true)` policies.

`anon` and `authenticated` are explicitly revoked from the new tables. Server-mediated access uses backend credentials only. Browser clients must never receive service-role credentials.

## Approval Invariants

Persistence validation requires:

- approved analysis runs must have `approvedBy` and `approvedAt`
- unapproved analysis runs must have both `approvedBy` and `approvedAt` as null
- approved buyer profiles must have `approvedBy` and `approvedAt`
- unapproved buyer profiles must have both `approvedBy` and `approvedAt` as null
- approved buyer profiles cannot contain active criteria that are not item-approved
- unapproved criteria must have both `approvedBy` and `approvedAt` as null
- rejected criteria cannot remain active
- contact linking or contact creation requires explicit Freddy approval

Existing contacts are never overwritten automatically.

## Duplicate Contact Preview

The server-side helper can produce masked candidates from existing contact rows:

- exact phone match
- exact normalized email match
- weak name-only match

Multiple candidates and name-only candidates require manual selection. The helper returns masked phone/email values and hashed lookup values only.

Contact candidate batches are idempotent on `(intake_id, match_type, match_value_hash)`. Retrying the same candidate batch updates the safe preview fields rather than creating duplicate rows.

## Tests

Run:

```bash
npm run test:lead-intelligence-persistence
npm run test:migrations -- lead-intelligence-persistence
```

The migration integration test uses an isolated PostgreSQL service/container through `MIGRATION_TEST_DATABASE_URL`. It refuses production-style environment variables such as `SUPABASE_DB_URL`, `POSTGRES_URL`, and `DATABASE_URL`.

The migration test also checks:

- all check/FK constraints have `convalidated=true`
- critical columns are `NOT NULL`
- incompatible pre-existing partial tables fail closed
- no open RLS policies are created
- HMAC-formatted candidate hashes are required
- idempotent retry does not duplicate intake or contact candidates

## Rollback And Disable

Before production migration:

- rollback is a git revert of this PR

After production migration:

- first disable `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED`
- stop any persistence callers
- inspect whether any rows have been written
- do not drop tables automatically
- only drop newly created objects if a separate rollback plan proves they were created by this migration in that environment and no retained audit data is needed

No migration history should be manipulated manually without a separate reviewed operation.

## PR 3B Plan

The next PR should add the review UI and protected server routes over this foundation:

- save reviewed intake
- save validated analysis result
- preview contact candidates
- let Freddy choose connect existing / create new / continue without contact
- approve buyer profile and item-level criteria

PR 3B must still avoid property matching, shortlist generation, and customer-message sending.
