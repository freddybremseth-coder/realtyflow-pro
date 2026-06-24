# Contacts RLS hardening before Lead Intelligence contact-create

Date: 2026-06-23

This documents the isolated hardening step required before applying:

```text
supabase/migrations/20260623174512_lead_intelligence_contact_create_gate.sql
```

No production SQL is run by this PR.

## Production preflight finding

Read-only preflight on Supabase project `ereapsfcsqtdmzosgnnn / RealtyflowPRO` found:

| Object | Finding | Risk |
| --- | --- | --- |
| `public.contacts` policy | `Allow all on contacts` | Critical |
| policy command | `FOR ALL` | Critical |
| policy role | `public` | Critical |
| policy expressions | `USING (true) WITH CHECK (true)` | Critical |
| grants | `anon` has `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` | Critical |
| grants | `authenticated` has `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` | Critical |
| RLS | enabled on `public.contacts` | Good |
| row count | 254 contacts | Context only |

The Lead Intelligence contact-create gate correctly stopped because browser roles
could write `public.contacts`.

## Code usage audit

Existing CRM and backend flows that touch `public.contacts` are server mediated:

- `/api/contacts`: CRM/pipeline list, create, update and delete contacts.
- `/api/public/leads`: public lead capture with source-key protection.
- `/api/public/booking-leads`: booking lead capture.
- `/api/chatbot`: chatbot lead capture.
- `/api/portal/preferences`: customer portal preference capture.
- `/api/crm/portal-admin`, `/api/portal/invite`, `/api/portal/messages`.
- Reporting, business overview, nurture, email/newsletter and agent routes.

The main dashboard previously read active contact stats directly from the browser
with `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This PR moves that contacts query to the
protected `/api/contacts?view=pipeline` server route so direct browser access to
`public.contacts` can be removed.

The `/api/contacts` route now verifies the `realtyflow_admin` session cookie
inside the route before creating or using the service-role Supabase client.
Middleware protection is still useful, but the route-level check is the
authoritative guard for the privileged contacts path.

## Migration behavior

New migration:

```text
supabase/migrations/20260623192000_contacts_rls_hardening_before_lead_intelligence_create.sql
```

It:

- fails closed if `public.contacts` is missing, not a base table, has incompatible
  required columns, or does not have RLS enabled
- drops the legacy `Allow all on contacts` policy
- revokes all direct table privileges on `public.contacts` from `PUBLIC`, `anon`
  and `authenticated`
- grants `SELECT/INSERT/UPDATE/DELETE` only to `service_role`
- does not add a replacement open policy; Supabase `service_role` remains the
  backend path through its managed BYPASSRLS behavior and explicit table grants
- verifies that browser roles cannot directly access `public.contacts`
- verifies `service_role` still has the required backend access

It does not:

- run the Lead Intelligence contact-create gate
- create contacts
- create leads
- change contact data
- activate feature flags
- change existing Lead Intelligence data

## Expected state after migration

| Role | Direct `public.contacts` access |
| --- | --- |
| `PUBLIC` | none |
| `anon` | none |
| `authenticated` | none |
| `service_role` | `SELECT/INSERT/UPDATE/DELETE` via backend-only route usage and Supabase BYPASSRLS |
| `realtyflow_lead_intelligence_runtime` | none until the separate contact-create gate grants narrow `INSERT` |

## CRM risk

The migration assumes contact reads and writes are mediated by server routes using
`SUPABASE_SERVICE_ROLE_KEY`. The dashboard contacts query has been moved to
`/api/contacts?view=pipeline`.

Risk to check before production:

- CRM list loads.
- Pipeline list loads.
- Unauthenticated `/api/contacts` requests return 401 and do not reach the
  database client.
- Contact create/update/delete still works through `/api/contacts`.
- Public lead and booking lead captures still write through server routes.
- No browser code still directly queries `public.contacts`.

## Safe smoke test before the contact-create gate

After applying this hardening migration in production, but before running
`20260623174512_lead_intelligence_contact_create_gate.sql`:

1. Confirm no contact row count change.
2. Confirm `Allow all on contacts` policy no longer exists.
3. Confirm `anon` cannot `INSERT`, `UPDATE` or `DELETE public.contacts`.
4. Confirm `authenticated` cannot `INSERT`, `UPDATE` or `DELETE public.contacts`.
5. Confirm `/api/contacts?view=pipeline` returns 401 without an admin session.
6. Confirm `/api/contacts?view=pipeline` returns CRM data while logged in as admin.
7. Create and edit one synthetic CRM test contact through the UI, then remove it
   through the UI if appropriate.
8. Submit a synthetic public lead only if a test source key and cleanup plan are
   available.
9. Re-run the Lead Intelligence contact-create preflight.

Only after this smoke test should the contact-create migration be applied.

## Rollback

Before production SQL is run, rollback is `git revert`.

After production SQL:

- Preferred rollback is to restore from the deployment record if CRM smoke-test
  fails before proceeding.
- Do not recreate the open `FOR ALL public USING (true)` policy as a default
  rollback.
- If emergency compatibility requires temporary direct browser access, use a
  time-boxed, column-limited, role-specific policy and document the exception.

No contact data should be deleted as part of rollback.
