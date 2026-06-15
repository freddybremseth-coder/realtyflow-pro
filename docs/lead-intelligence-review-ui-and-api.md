# Lead Intelligence Review UI And Protected APIs

This is PR 3B for Lead Intelligence. It adds the review/persistence workflow over the PR 3A foundation.

## Scope

Included:

- review UI after extraction preview
- item-level approval/rejection for buyer profile criteria
- masked contact candidate lookup
- explicit contact decision:
  - connect existing contact
  - mark that a new contact must be created later
  - continue without contact
- protected server routes for candidate lookup and review persistence
- safe error envelopes and correlation IDs

Not included:

- property matching
- shortlist generation
- presentations
- email, WhatsApp, SMS, or customer-message sending
- automatic contact creation
- automatic contact linking
- writes to `public.leads`
- production migration execution

## Server Routes

```text
POST /api/lead-intelligence/contact-candidates
POST /api/lead-intelligence/review
```

Both routes require:

- valid RealtyFlow admin session
- `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true`
- `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true`

The browser cannot enable either feature flag.

## Server-Only Configuration

Persistence is disabled by default. Production must keep these off until the migration has been applied and smoke-tested:

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

Contact lookup requires:

```text
REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET=<server-only secret>
```

Database access for the protected review routes uses a server-side connection string. In production, the dedicated runtime credential is required and the route fails closed with `PERSISTENCE_SCHEMA_NOT_READY` if it is missing:

```text
REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL=<server-only database URL>
```

Development and tests may fall back to existing server-side database URL names. Production does not use those fallbacks, and no database URL is ever exposed to the browser.

## Persistence Behavior

The review route writes through the PR 3A repository:

- `lead_intake_messages`
- `lead_analysis_runs`
- `lead_contact_candidates`
- `buyer_profiles`
- `buyer_profile_criteria`

It stores validated structured AI output, not provider raw output.

`raw_text_restricted` is not stored by default in this PR. The repository writes `null` for both `raw_text_restricted` and `raw_text_retention_until` unless a future reviewed retention policy explicitly enables restricted raw-text storage. If raw text storage is enabled later, the server must set a bounded `raw_text_retention_until`; the browser must not choose unlimited retention.

## Contact Decisions

`connect_existing` sets `buyer_profiles.contact_id` only after explicit approval and a fresh server-side candidate verification inside the review-save transaction. The client never sends authoritative candidate hashes, confidence scores, or reasons. If the selected contact was deleted, moved to another brand, or no longer matches the reviewed phone/email/name, the save fails with a safe conflict such as `CONTACT_CANDIDATE_STALE` or `CONTACT_BRAND_MISMATCH`.

If Freddy changes brand, contact fields, raw text, or the edited analysis after a candidate lookup, the UI clears candidates and selected contact so a new lookup is required.

`create_new` does not create a contact in this PR. It records the decision in the response only so the next phase can implement explicit contact creation.

`continue_without_contact` saves the buyer profile with `contact_id = null`.

Existing contact rows are never updated by this PR.

Review save uses stable idempotency keys for intake, analysis run, and buyer profile creation. Repeating the same request returns existing rows and does not create duplicate criteria or duplicate contact candidate records.

## Activation Order

1. Merge this PR with both feature flags still disabled in production.
2. Apply and verify the PR 3A migration through the approved production migration workflow.
3. Configure the server-only HMAC secret and database credential.
4. Enable persistence in a controlled preview/staging environment first.
5. Smoke-test candidate lookup and review persistence.
6. Only then consider production activation.

## Rollback

Before enabling persistence:

- disable remains the default; no runtime rollback is needed
- git revert this PR if the UI/routes should be removed

After enabling persistence:

- set `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false`
- keep `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED` off if the full feature should disappear
- do not drop data tables without a separate reviewed rollback plan
