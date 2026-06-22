# Lead Intelligence CRM Context

This PR adds a read-only CRM context surface for Lead Intelligence. It lets Freddy inspect limited existing contact pipeline context while reviewing a lead intake, without calling the broad contacts API and without writing to CRM.

## Scope

- Server route: `POST /api/lead-intelligence/crm-context`
- Database read surface: `public.lead_intelligence_crm_context_lookup`
- Runtime role: `realtyflow_lead_intelligence_runtime`
- UI action: `Hent CRM-kontekst`

The route re-runs server-side contact candidate lookup and then reads context only for server-confirmed candidate IDs. Client-sent candidate hashes, confidence values, or reasons are never authoritative.

## Safety Model

- No contact, lead, email, shortlist, presentation, or property matching writes.
- No service-role or migration secret in the browser.
- No direct `public.contacts` access for the runtime role.
- `anon`, `authenticated`, and `PUBLIC` do not get access to the context view.
- The view filters by transaction-local `app.lead_intelligence_brand`, set server-side after brand allowlist validation.
- The view is `security_barrier` and remains brand-filtered even if `public.contacts` RLS is unavailable.
- Returned phone and email values are masked before reaching the browser.
- Raw contact hashes and full lookup values stay server-side.

## Migration Notes

Migration:

```text
supabase/migrations/20260622103729_lead_intelligence_crm_context_readonly.sql
```

The migration expects the Lead Intelligence persistence foundation and runtime-RLS migration to already be active. It fails closed if:

- the runtime role is missing
- `public.contacts` is missing
- required CRM context columns are missing
- the runtime role has direct `public.contacts` SELECT
- public/browser roles can select the context view

Do not run this migration in production automatically. Use the same controlled activation process as the earlier Lead Intelligence migrations: exact source commit, checksum, read-only preflight, explicit single-file transaction, verification, and report.

## Returned Context

The UI can show:

- masked contact identity
- pipeline status
- pipeline value
- property interest
- source
- sentiment
- short notes excerpt
- interaction count
- last contact
- next follow-up

It intentionally does not return:

- full phone or email as authoritative client data
- lookup hashes
- raw interaction JSON
- raw full notes
- contact secrets
- lead data
- email data

## Next Phase

After review and controlled migration activation, this context can be included in future AI review prompts so the system can reason over existing pipeline context. That later phase must still keep the rule:

```text
AI foreslår - Freddy kontrollerer - Freddy godkjenner - systemet sender.
```
