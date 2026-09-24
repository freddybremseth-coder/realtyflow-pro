# Workspace member isolation: legacy CRM 360, communications and task routes

Status: security audit and implementation boundary for draft PR #1028. No staff is active, no production migrations applied, and no existing customer, email, portal message or work item has been copied/reassigned.

## Boundary already implemented

- `src/middleware.ts` now **defaults to deny** on every protected API route for a signed `WORKSPACE_MEMBER` except `GET /api/auth/me`, `GET /api/workspaces/available`, the explicit one-brand `GET capabilities/properties`, the Pinoso-style `GET/POST/PATCH contacts` handler and the Zen-only `GET/PATCH joint-contacts` handler. Unknown nested routes, internal alerts and legacy `AUTHENTICATED` exceptions cannot silently grow employee powers. Write methods remain restricted. This is an extra boundary; every allowed workspace API separately rechecks live membership, verified Auth UUID and exact permission.
- Generic Zen staff `crm.read` and `crm.write` are forbidden regardless of membership; the joint-contact SQL reads and edits only an owner-approved, documented, post-cutoff Zen cohort with both CRM brand labels matching. The database checks live membership each time. No automatic recognition of new clients from CRM creation date.
- The owner access-plan dashboard remains functional when the **optional** new-cohort preview RPC is not yet installed. It returns `zenJointPreview: null` with a clear unavailability explanation, not an invented zero. Real permission or other RPC errors still fail closed.

## Existing data surfaces: confirmed schema and API audit

| Surface | Existing source/route | Why **not** expose it to the joint Zen member |
| --- | --- | --- |
| Full customer 360, internal notes and interaction history | `public.contacts.notes`, `public.contacts.interactions`, `/api/contacts/**`, `/api/customers/**` | Historical material and financial/private details can precede the partnership even when a CRM record was newly imported. These routes query global contacts. No direct legacy access. |
| Team alerts, tasks, follow-ups and customer work queues | `public.work_items` (`brand_id`, `source_type`, `source_id`, free-text `description`, `metadata`), `/api/internal-alerts`, `/api/revenue/execution`, `/api/calendar/**` | `source_id` is text and description/metadata can reference other customers. Brand label or contact ID alone does not prove an item is a new, shareable collaboration task. Legacy work queues remain forbidden. |
| Customer portal messages, attachments and documents | `public.portal_messages` (`contact_id`, `email`, `brand_id`, `body`, `attachments`); `/api/portal/messages`, `/api/portal/documents` | Portal endpoints have separate customer Bearer-token authentication, not workspace-cookie authorization. A workspace member cookie alone fails with HTTP 401, verified by API tests. Historic threads/attachments must never automatically become shared when a new cohort entry is approved. |
| Emails and email drafts | `public.email_messages` (`brand_id`, `crm_contact_id`, `matched_customer_id`, `thread_id`, `body_text`, attachments); `/api/revenue/communications` | Mixed or previously matched email threads and attachments may contain historical/private content. A brand or email-address match is insufficient. These remain forbidden to a brand member. |
| Social inbox | `public.nexus_social_conversations` (`brand_id`, `matched_contact_id`, `metadata`), `public.nexus_social_messages` (`conversation_id`, `brand_id`, `body_text`, `media`, `raw_payload`) | Existing threads may mix accounts and periods. No cross-brand inbox or historical social messages are exposed. |
| Buyer profiles, presentations and communication drafts | `public.buyer_profiles` (`brand`, `contact_id`), `public.lead_customer_message_drafts` (`brand`, `buyer_profile_id`) | Older profiles may be linked to the same imported contact; aggregate foreign keys do not establish customer ownership. Existing marketing and AI/global routes stay outside the new member allowlist. |
| Commissions and money | `public.contacts.pipeline_value`, `commission_amount`, `sale_price`; `public.revenue_events` and `/api/revenue/**` | No financial field is projected by `joint-contacts`. The commercial 10%/expenses/50:50 calculation is a nonpersisted preview; no ledger or disbursement exists. |

### Important legacy intake observation

The pre-existing `/api/portal/messages` POST looked up contacts by **email only**, without matching both Zen brand fields, and then created a Zen-tagged message/work item. This PR now restricts GET to authenticated customers' **Zen-only** messages and POST contact attribution to independently matching `contacts.brand_id='zeneco'` **and** `contacts.brand='zeneco'` and verified customer email. The server independently filters GET results and rejects an unexpectedly mismatched POST contact lookup result. Authenticated customers with ambiguous legacy brand tags may still send their message, but the route deliberately does **not** link a cross-brand CRM contact or create a linked contact task. This does not grant a staff member access to any portal content, and portal events do not automatically approve joint leads. Synthetic API tests cover same-email cross-brand messages and contact attribution without touching real customer records.

## Required gates before any new tasks or communications

1. Keep all existing messages, attachments, old notes and global tasks entirely outside employee APIs; they remain owner-only or require separate customer portal authentication.
2. Design **newly created** joint-specific task/message rows with an explicit canonical Zen brand, owner-approved cohort contact ID, independently verified source, creation timestamp after approval, and author. Use a dedicated bounded service-only RPC and recheck live employee identity, membership, brand and cohort on **each** read/write/revocation. A thread containing any historical or other-brand item must not be inherited by membership.
3. Make write permissions explicit per module rather than reusing `crm.joint.write` to send customer messages or run automation. Replies, attachments, bulk export and outbound sends need their own owner-reviewed workflows and channel account scopes.
4. Test in isolated PostgreSQL with preexisting 2026-09-24 contacts, reimported old leads, mismatched brand labels, old work items, old email/social/portal threads and a revoked member. Confirm both direct API calls and returned JSON contain no legacy PII or financial data. Review authenticated public endpoints independently; they are **not** a workspace entitlement.
5. Do not activate members, move customers, run production SQL, send messages, merge or deploy based solely on unit tests. Apply only the reviewed additive migrations after staging approval and an explicit owner activation decision.

## Verification snapshot

- The prior exact-head CI run passed all 8 workflows, including separate, temporary PostgreSQL integration testing with 30 checks of approved versus historical cohorts, audited narrow contact edits, role grants and revocation. The next CI run must also pass the new middleware, capabilities, optional-RPC compatibility and portal-auth independence tests.
- Schema inventory was read-only on the existing Supabase project and included table/column names and types only; no actual customer/communication rows were retrieved for this review.


## Race-condition and service-role staging checks

The shared Zen contact row is now locked before the staff edit function performs its separate, fresh eligibility check. The owner revoke function also locks that exact contact before changing its cohort status. In the isolated PostgreSQL integration test, an employee edit is deliberately blocked on the owner's customer-row lock; the owner then revokes eligibility and commits. The pending edit returns no row and does not modify the customer or produce an edit audit. This prevents a stale snapshot from authorizing an edit after an owner revocation. The test now executes the review/read/edit RPCs under a fixture `service_role` with Supabase-like `BYPASSRLS` rather than solely as the test superuser. All of these checks use an ephemeral local database and synthetic customer IDs.

`/api/internal-alerts` also rejects a signed `WORKSPACE_MEMBER` directly in its legacy handler, **before** querying any all-brand customer or task data, even if a future code path bypasses middleware. The direct-handler negative test verifies no external database request occurs.

No current CRM messages, global tasks, earlier interactions, file attachments or cross-brand activity are copied into the employee workspace. New joint-only tasks/messages, if later needed, must have independently designed permission and data contracts rather than reusing the full legacy endpoints.


## Separat felles oppgavebok (utkast, ikke aktivert)

Den nye migrasjonen `20260924160000_zeneco_joint_tasks_isolated_foundation.sql` oppretter **utelukkende** `core.zeneco_joint_work_items` for helt nye oppgaver. Verken eldre `public.work_items`, e-poster, sosial innboks, kundeportal, `contacts.notes` eller `contacts.interactions` kopieres eller deles. Ingen oppgaver sendes som kundemeldinger, ingen automatiske følgerutiner kjøres, og ingen eksisterende kunder blir felles gjennom en oppgave.

Egne rettigheter `tasks.joint.read` og `tasks.joint.write` kan kun foreslås for Zen; de forutsetter separat `crm.joint.read`, og skriveadgang forutsetter oppgave-leseadgang. Skriveadgang gir bare anledning til å **opprette** en ny oppgave med kort tittel/valgfri frist og **markere den fullført**. Ingen friteksthistorikk, vedlegg, endring av kundestatus, sletting, gjenåpning, generell CRM-oppgaveadministrasjon eller utgående kommunikasjon er tilgjengelig.

Hvert serverkall kontrollerer live medarbeiderprofil, eksakt Supabase Auth-UUID/e-post, gjeldende Zen-medlemskap, egne oppgaverettigheter, to samsvarende Zen-merkevarefelt i CRM og individuelt eiergodkjent ny kundekohort. Opprettelse/fullføring låser den samme kundeposten som eierens godkjennings-/tilbakekallingsfunksjon, slik at et allerede tilbakekalt kundegrunnlag ikke kan brukes når en ventende oppgaveoperasjon fortsetter.

Grensesnittet viser en egen `Felles oppgaver`-fane bare dersom rettighetene finnes og CRM kan vise individuelt godkjente nye kunder. Brukeren må velge en slik kunde. Oppgavene forsvinner fra medarbeiderens visning dersom kunden eller medlemskapet tilbakekalles; oppgavehistorikken blir liggende serverinternt for revisjon.

Den isolerte PostgreSQL-integrasjonstesten installerer alle fire migrasjonsutkast i en midlertidig testdatabase og rapporterte **60 beståtte kontroller** etter utvidelsen, inkludert separate oppgavegrants, gamle og feilmerkede kunder, opprettelse/fullføring, feil kundereferanse, manglende innsyn etter tilbakekalling og at global `public.work_items` ikke brukes. Dette er ikke en produksjonsgodkjenning: Kjør full CI på siste kodeversjon og gjennomgå tilgangsutkast før eventuell utrulling.
