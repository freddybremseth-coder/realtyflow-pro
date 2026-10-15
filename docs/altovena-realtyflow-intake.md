# Altovena → RealtyFlow: brand intake and operating model

**Status:** Preview implementation. No production migration, credential, staff grant, contact-form activation or public posting is enabled by this PR.

## Ownership and boundaries

Altovena.com is a public presentation and enquiry website. RealtyFlow owns the Altovena brand workspace, CRM contacts, follow-up tasks, newsletters, editorial plans, social media and reporting. The Altovena website does not store a separate lead database.

- Canonical brand key: `altovena` (never guessed from the referring domain; never default to `zeneco`).
- API: `POST /api/public/altovena-leads` on the trusted RealtyFlow host. Server-to-server only; shared secret `ALTOVENA_INTAKE_KEY`, separate from Zen/Care keys.
- Required enable switch: `ALTOVENA_INTAKE_ENABLED=true` on RealtyFlow, **only after migration and access checks**.
- Request: `brandKey:"altovena"`, `source:"altovena.com/contact"`, `requestType:"product-enquiry"`, UUID `submissionId`, name, company, email, message, product from fixed set, and `consent:{purpose:"respond_to_request",marketing:false}`.
- Atomic PostgreSQL service-role RPC creates/reuses only an **Altovena** CRM contact and creates a new `work_items` task for prompt **human** follow-up. Receipt UUID makes retries safe. If any DB operation fails, the transaction rolls back; the API reports failure.
- No self-reported pipeline value, no invented lead score, no auto reply, no newsletter opt-in, no sharing with other brands.
- The website may say “request sent” only after `ok:true, accepted:true, leadId, workItemId` are confirmed. It remains email-draft-only until configured.

## Staff permissions

Freddy (platform OWNER) and Andrea (independently verified workspace identity with an explicit **Altovena** brand grant) should both have operational access to this brand’s permitted modules. Do **not** infer permissions from name/email or grant global tenant access. Existing brand workspace grants are audited; the owner can review the `partner` access preset and enable `crm.read`, `crm.write`, `marketing.read`, `marketing.draft`, `marketing.publish`, `content.read/edit/publish`, `email.read/draft/send`, `nexus.read` and other brand-supported permissions.

Real publishing must also check connected destinations, verified sender identity, suppression lists, and human approvals. The Altovena Growth OS brand is present in the registry but pilot channels are **empty** until connected and reviewed. Existing restrictions for video/social modules must not be bypassed silently.

## Production activation checklist

1. **Database:** Review and apply `20261014210000_altovena_brand_intake.sql` in the correct Supabase project; verify `core.brands` with `brand_key='altovena'` and service-role RPC permissions. No staff grants are created by the migration.
2. **Secrets:** Set high-entropy `ALTOVENA_INTAKE_KEY` and `ALTOVENA_INTAKE_ENABLED=true` server-side only in RealtyFlow. Set corresponding `REALTYFLOW_ALTOVENA_INTAKE_KEY`, HTTPS `REALTYFLOW_ALTOVENA_INTAKE_URL` and safe form/Turnstile variables in Altovena; never expose these keys as `NEXT_PUBLIC_` values.
3. **Identity:** Verify legal data controller, privacy contact, retention instructions, actual provider agreements and cookies before enabling the website form.
4. **Users:** Confirm Freddy's owner account and Andrea's existing Supabase Auth identity; activate an audited **Altovena-only** membership and test both accounts. Do not add automatic access to other brand data.
5. **Test:** Submit a permitted synthetic enquiry through Altovena **preview** with test configuration. Confirm exactly one branded contact, one new work item, correct source and follow-up visibility. Retry the exact same submission UUID and confirm no duplicate task. Confirm invalid keys, spoofed brands, missing Turnstile and failed DB paths do not create records or show “sent”.
6. **Verify notification:** A visible work item is not the same as a push alert. Configure and test the RealtyFlow alert workflow for Freddy and Andrea; otherwise do not claim notification delivery.
7. **Publish:** Only after a real authorised end-to-end test and owner approval, set the form enable flags, then check production domain HTTPS and rollback plan.

## Privacy and customer journey

Contact requests are used to respond to that request only. Newsletter enrolment must use a separate positive opt-in, with its own proof, suppression and unsubscribe flow, all owned by RealtyFlow. Editorial copy follows Andrea and Erlend's SEO/AEO/GEO and customer-journey manual; no fabricated statistics, no fake AI recommendations, and product demos must be labelled honestly.

## Privacy and identity safeguards verified against the live schema (15 October 2026)

- The existing `public.contacts.nurture_status` defaults to `eligible`. This integration **overrides that default to `stopped` for brand-new Altovena web enquiries**, and sets `ai_auto_followup=false`. Existing independent opt-in preferences remain untouched when an existing contact makes another enquiry.
- An unauthenticated web form **never overwrites the canonical name or company** of an existing contact with a matching email. The new submission's provided details are marked `identity_verified:false` inside the recorded interaction pending human verification.
- Intake receipt and brand-scoped follow-up task are written in one database function call and no success is acknowledged before both exist.
- `getBrandWorkspace` staff authorization is checked before the Altovena task endpoint reads the specific brand's tasks. The UI is an in-app attention surface; email/push notifications require a separate verified path.
- Live project schema/constraints were examined with **read-only** SQL to confirm receipt foreign keys, lead source types, task priorities and nurture values. No live data was inserted or mutated.
- Production activation still requires verified legal controller, email/notification delivery, both brand grants and an approved test via a dedicated safe environment before turning on real submissions.

## Verified CI PostgreSQL acceptance test (15 October 2026)

`npm run test:altovena-intake` checks endpoint contracts and mocked RPC responses. In addition, the `Altovena intake validation` workflow runs `node scripts/test-altovena-postgres.mjs` on a **temporary PostgreSQL 17 service** with explicit schema-faithful fixtures. The script checks its connection hostname and exact disposable database name before any schema execution.

This exercises the actual `20261014210000_altovena_brand_intake.sql` file and confirms:
- two consecutive applications of the migration are idempotent
- only `service_role` can execute the intake function; `anon` and `authenticated` cannot
- a same-email contact from another brand is never merged
- every new Altovena contact is excluded from nurture by default and has `ai_auto_followup=false`
- anonymous repeat submissions cannot overwrite an existing canonical contact identity
- a repeated submission UUID returns the existing contact/task receipt without making duplicates
- invalid products fail without creating a receipt
- a forced work-item constraint failure rolls back the contact and receipt transaction
- simultaneous requests for one email create one brand contact and separate tasks; simultaneous retries of one UUID create only one task

**Verified in GitHub Actions:** both focused contract and isolated PostgreSQL jobs passed. This does not certify production credentials, the live database, emails, notifications, frontend browsers or legal processing details.

The production database and real users are unchanged. The Altovena contact form must remain disabled until all activation checks in this document are explicitly completed.

## In-app attention and manual task resolution (15 October 2026)

- The brand-scoped Altovena lead panel on **I dag** and **Kunder & leads** refreshes every 60 seconds while the browser tab is visible and on focus. It shows last-checked time and highlights tasks older than 24 hours. This is **in-app awareness**, not external email/push delivery.
- Users with an independently verified `crm.read` grant can only view Altovena's currently open website-lead tasks. No cross-brand fallback is possible.
- Only users with an independently verified `crm.write` grant can use **Start oppfølging** (`IN_PROGRESS`) or **Marker oppfølging utført** (`DONE`) quick actions. These actions require same-origin JSON and update only an existing `altovena`/`website_lead` task by UUID, with an allowed prior status.
- Task resolution **does not** automatically send email, mark a customer as contacted, alter CRM customer details or imply newsletter consent. The human user must complete the follow-up before marking a task done.
- These controls and their permission boundaries are covered by `Altovena intake validation` contract tests. The features remain in a draft PR until reviewed and deployed.

## Privacy erasure semantics (15 October 2026)

- Intake receipts reference both the canonical CRM contact and its associated follow-up work item. Their foreign keys use `ON DELETE CASCADE` so a verified, authorised erasure is not blocked by historic ingestion receipts.
- When a contact with **both** `brand_id='altovena'` and `brand='altovena'` is deleted through a permitted administrative flow, a narrowly scoped `BEFORE DELETE` trigger removes only `altovena`/`website_lead` work items whose `source_id` is that contact UUID. All corresponding receipts disappear automatically. Other-brand work items and contacts are never touched by the trigger.
- These are infrastructure safeguards, **not** a public self-service deletion endpoint. Identity checks, retention rules, audit requirements and an approved legal-erasure workflow are still required; do not erase contacts solely on the basis of an unverified website request.
- The isolated PostgreSQL integration test deletes a test contact and verifies related receipt/task removal, preserving foreign-brand data; it also checks task-deletion receipt cleanup. Never run this fixture against production.

## Owner-side launch readiness (15 October 2026)

The RealtyFlow brand workspace now has a **read-only Altovena activation checklist** under **I dag**, visible only for a real OWNER session (never owner-preview). It calls `GET /api/workspaces/altovena/launch-readiness`, which independently requires `context.role === 'OWNER'` and `context.source === 'owner-session'` and does not allow mutations. No credentials or personal details are returned to the browser.

The checklist checks:
- whether the Altovena brand exists in RealtyFlow's brand/workspace registry
- an authenticated Freddy owner session
- the actual Andrea account, configured by the **verified Supabase Auth UUID** in `ALTOVENA_ANDREA_AUTH_USER_ID` (never guessed from a name/email), and a live brand-specific grant against the necessary set of currently supported business permissions
- whether the RealtyFlow server-side intake enable switch, sufficiently long secret and database credentials are present
- **separately unverified** website-level Turnstile/form configuration, legal controller/retention notice, domain/HTTPS, real E2E delivery and external alerts

The result deliberately stays `readyForPublicForm=false` until a future separately approved release and a real end-to-end review. **Do not use this status display to bypass the disabled contact form.**

As of 15 October 2026, read-only checks of production Supabase found no `altovena` brand and no deployed Altovena intake/task RPCs. The Altovena Vercel project had no configured environment variables. Therefore all real lead receipt, staff brand grant and external notification claims remain pending; successful CI in a disposable PostgreSQL service does not change this.

The `partner` preset is appropriate for broad Andrea access to available scoped CRM, content, email, marketing, ads and Visibility modules, subject to owner approval and staff security readiness. Existing Reels/YouTube APIs are currently hard-scoped to other brands and must not be advertised as active Altovena functionality without separate adaptation, channel verification and permission checks.

## Pre-provisioning activation screen (15 October 2026)

The authenticated RealtyFlow OWNER can access **`/altovena-launch`** directly or via **RealtyFlow Platform → Merkevarearbeidsflater → Altovena · aktivering**. This page does not need an already provisioned Altovena brand and does not create one. It redirects unauthenticated users to login, rejects non-owners and owner-preview sessions, and uses the protected read-only readiness API.

**Configuration for operator verification:** Set `ALTOVENA_ANDREA_AUTH_USER_ID` to Andrea's **independently verified** Supabase Auth user UUID on the RealtyFlow backend. The readiness API looks up that exact Auth identity and checks a live, active `altovena` brand grant for supported `crm`, `marketing`, `content`, `email`, `visibility`, `ads`, `events` and `nexus` rights. It neither creates a user nor grants permissions and does not return account identity or secret values in JSON.

The owner Freddy uses an owner session and does not need a redundant employee-style brand grant. The operator’s approved grant must remain specific to `altovena`. Features not yet implemented for Altovena (such as Zen-only YouTube and property-based Reels) are not counted as missing permissions and must not be silently enabled.

All website-side settings, legal review, domain HTTPS, test delivery and notifications require an independent verification step. The checklist permanently reports the public form as **not ready** until a deliberate, separately reviewed go-live release; this dashboard cannot enable customer collection.

**Status before production activation:** RealtyFlow's live Altovena brand and both intake/status RPCs were absent, and Altovena's Vercel project had no configured environment variables in the last read-only check. It is incorrect to describe the new lead or task workflow as publicly active at this point.
