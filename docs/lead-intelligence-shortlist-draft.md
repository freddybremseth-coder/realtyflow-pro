# Lead Intelligence Shortlist Draft

This phase adds a Freddy-approved shortlist draft after property match preview.

It does not:

- send email
- create or update contacts
- create `public.leads`
- create customer presentations
- start property matching jobs
- expose service-role or runtime database credentials to the browser

## Flow

1. Freddy saves an approved buyer profile.
2. Freddy runs property match preview.
3. The UI shows system eligibility and local manual decisions.
4. Freddy marks one or more properties as `current`, `maybe`, or `needs_research`.
5. The browser posts only selected property IDs and decisions to `/api/lead-intelligence/shortlists`.
6. The server reloads the approved buyer profile and recomputes matches for the selected properties.
7. The server stores a `draft` shortlist and item snapshots through the Lead Intelligence runtime database role.

Client-sent scores, reasons, eligibility, and property facts are not trusted.

## Tables

- `public.lead_property_shortlists`
- `public.lead_property_shortlist_items`

Both tables use RLS. `anon`, `authenticated`, and `PUBLIC` have no access. The normal
`realtyflow_lead_intelligence_runtime` role receives only `SELECT` and `INSERT`.

## Production Activation

Do not run this migration automatically from Vercel or a PR workflow.

Before production activation:

1. Confirm PR 3A Lead Intelligence persistence is active.
2. Confirm runtime RLS is active and `realtyflow_lead_intelligence_runtime` is safe.
3. Confirm the migration checksum from the exact source commit.
4. Run only `supabase/migrations/20260621161521_lead_intelligence_shortlist_draft.sql`.
5. Verify RLS, grants, policies, and no browser-role access.
6. Run a controlled smoke test with synthetic shortlist data.

Stop if any table already exists without the reviewed marker, the runtime role is missing,
or browser/public roles have table privileges.

## Rollback

Before production migration: revert the PR.

After production migration, prefer disabling UI access by feature flag or code revert. Drop
the two tables only if it is proven that the migration created them and no real shortlist
drafts must be retained:

```sql
drop table if exists public.lead_property_shortlist_items;
drop table if exists public.lead_property_shortlists;
```

Do not delete customer data without explicit approval.
