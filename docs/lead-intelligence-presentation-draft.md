# Lead Intelligence Presentation Draft

This phase adds a draft-only customer presentation and message draft after a Freddy-approved shortlist.

## Scope

Allowed:

- create an internal presentation draft from an existing `lead_property_shortlists` record
- create an internal email message draft linked to that presentation
- keep both records in `draft` status
- return safe IDs and side-effect flags to the UI

Not allowed in this phase:

- sending email, SMS, WhatsApp, or any customer communication
- creating or updating `public.leads`
- creating or updating `public.contacts`
- starting property matching jobs
- publishing a presentation URL
- exposing raw runtime database credentials to the browser

## Schema

Migration:

```text
supabase/migrations/20260621191609_lead_intelligence_presentation_draft.sql
```

New tables:

- `public.lead_customer_presentations`
- `public.lead_customer_message_drafts`

The migration expects the PR 3A Lead Intelligence persistence schema, runtime RLS, and shortlist draft schema to exist first. It fails closed if those dependencies are missing or incompatible.

## Access Model

The normal runtime role `realtyflow_lead_intelligence_runtime` receives only:

- `SELECT, INSERT` on `lead_customer_presentations`
- `SELECT, INSERT` on `lead_customer_message_drafts`

It receives no `UPDATE`, `DELETE`, ownership, DDL, or direct browser access. Browser roles `anon`, `authenticated`, and `PUBLIC` are explicitly denied table access.

RLS policies are role-specific and require the server-set transaction-local `app.lead_intelligence_brand` context. The browser must never set or control this context directly.

## API

Route:

```text
POST /api/lead-intelligence/presentations
```

The route requires:

- RealtyFlow admin session
- `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true`
- `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true`
- `REALTYFLOW_PROPERTY_MATCHING_ENABLED=true`
- a reviewed shortlist ID and buyer profile ID

The server loads the persisted shortlist snapshot and generates the presentation/message draft from server-side data. The client does not send authoritative property facts.

## Idempotency

The service computes a canonical payload hash over:

- brand
- buyer profile ID
- shortlist ID
- title
- language
- generated presentation JSON
- generated email draft

Same idempotency seed and same payload returns the existing draft. Same seed with different payload returns `REVIEW_CONFLICT`.

## Production Activation

Do not run this migration automatically from Vercel, browser code, or PR workflows.

Controlled activation order:

1. Confirm PR 3A persistence, runtime RLS, and shortlist draft schema are active.
2. Verify the migration checksum from the exact reviewed source commit.
3. Run only `20260621191609_lead_intelligence_presentation_draft.sql` in an explicit transaction.
4. Verify tables, constraints, indexes, RLS, policies, grants, and no browser-role access.
5. Smoke-test with synthetic data only.

## Rollback

Before production migration:

- revert the PR or remove the migration from the deployment branch.

After production migration:

- normally leave draft tables in place, since they are additive and side-effect-free.
- drop the new tables only if it is proven that the migration created them in the target environment and no real presentation drafts exist.

Example rollback SQL must be reviewed separately before use:

```sql
drop table if exists public.lead_customer_message_drafts;
drop table if exists public.lead_customer_presentations;
```

Never drop shortlist, buyer profile, contact, lead, email, or property tables as part of this rollback.
