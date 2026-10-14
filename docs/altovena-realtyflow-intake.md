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
