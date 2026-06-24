# Lead Intelligence Property Quality Review

This phase adds a Freddy-controlled quality gate between property matching and customer-facing presentation drafts.

## Scope

Allowed:

- mark each matched property with an internal quality review state
- record an internal note, checked timestamp, and checked-by label
- save quality review metadata with the shortlist draft
- generate presentation/message drafts only from properties marked `client_ready`

Not allowed:

- sending email, SMS, WhatsApp, or any customer communication
- creating or updating `public.leads`
- creating or updating `public.contacts`
- starting background matching jobs
- publishing a presentation URL
- changing property facts, prices, availability, or CRM data

## Quality Review Statuses

Stored machine values:

- `client_ready` - Freddy has checked the property enough for a customer draft
- `needs_review` - more internal review is needed
- `rejected` - not relevant for this customer
- `ask_agent` - Freddy should contact developer/agent
- `verify_price_availability` - price or availability must be confirmed

Only `client_ready` items can be used in presentation drafts. Other statuses are internal review notes.

## Schema

Migration:

```text
supabase/migrations/20260624132000_lead_intelligence_property_quality_review.sql
```

Additive columns on `public.lead_property_shortlist_items`:

- `quality_review_status`
- `quality_review_note`
- `quality_review_checked_at`
- `quality_review_checked_by`

The migration expects the existing Lead Intelligence shortlist draft schema and fails closed if it is missing or incompatible.

## Access Model

This migration does not grant new browser access.

The runtime role keeps the existing shortlist access model:

- `SELECT, INSERT` on shortlist tables
- no `UPDATE`
- no `DELETE`
- no ownership or DDL

Browser roles `anon`, `authenticated`, and `PUBLIC` must not receive direct shortlist table access.

## Presentation Rule

The presentation service reloads the persisted shortlist server-side and filters to:

```text
quality_review_status = client_ready
```

If no shortlist items are `client_ready`, presentation draft creation fails safely before persistence writes.

## Production Activation

Do not run this migration automatically from Vercel, browser code, or PR workflows.

Controlled activation order:

1. Confirm PR 3A persistence, runtime RLS, shortlist draft, and presentation draft schemas are active.
2. Verify the migration checksum from the exact reviewed source commit.
3. Run only `20260624132000_lead_intelligence_property_quality_review.sql` in an explicit transaction.
4. Verify columns, constraints, RLS/grants, and no browser-role access.
5. Smoke-test with synthetic data:
   - match properties
   - mark one property `Klar for kunde`
   - save shortlist
   - create presentation draft
   - verify only the client-ready property appears

## Rollback

Before production migration:

- revert the PR or remove the migration from the deployment branch.

After production migration:

- normally leave the additive columns in place.
- remove the columns only after a separate reviewed rollback confirms no production code or saved drafts depend on them.

Example rollback SQL must be reviewed separately before use:

```sql
alter table public.lead_property_shortlist_items
  drop column if exists quality_review_checked_by,
  drop column if exists quality_review_checked_at,
  drop column if exists quality_review_note,
  drop column if exists quality_review_status;
```

Never drop shortlist, buyer profile, contact, lead, email, presentation, or property tables as part of this rollback.
