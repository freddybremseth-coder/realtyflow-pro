# Lead Intelligence Profile Actions

This phase adds safe actions for already saved Lead Intelligence buyer profiles.

## Scope

- Show the linked contact card for a saved buyer profile.
- Re-run read-only contact candidate lookup from the saved analysis.
- Link a saved buyer profile to an existing same-brand contact when the existing contact-link feature flag is enabled.
- Archive a buyer profile by setting `buyer_profiles.status = 'archived'`.

## Explicit Non-Goals

- No hard delete of buyer profiles.
- No creation or update of `public.contacts`.
- No creation of `public.leads`.
- No email sending.
- No property matching job creation.
- No presentation publishing.

## Runtime Access

The migration grants the Lead Intelligence runtime role only:

- `UPDATE(status)` on `public.buyer_profiles` for soft archive.

The existing contact-link gate remains responsible for `UPDATE(contact_id)`. Browser roles remain blocked, `PUBLIC` receives no grants, and the runtime role still has no direct `SELECT` on `public.contacts`.

## RLS

`buyer_profiles_runtime_archive` allows only same-brand runtime updates from `draft` or `approved` to `archived`, using transaction-local `app.lead_intelligence_brand`.

Rollback/disable options:

- Before production migration: revert this PR.
- After production migration: disable the UI/API callers first, then review whether to revoke `UPDATE(status)` and drop `buyer_profiles_runtime_archive`.
- Never drop Lead Intelligence tables as rollback for this feature.
