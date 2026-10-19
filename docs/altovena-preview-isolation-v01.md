# Altovena preview database isolation — P0 release blocker

**19 October 2026. Draft code only. No production database or Vercel settings changed.**

## Why this protection exists

The Vercel project `realtyflow-pro` currently contains `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variable definitions targeted to both Preview and Production. They may have different values, but **target membership alone is not proof of database isolation**. Supabase RealtyflowPRO had no development branch at the last inspection. A preview endpoint must not be used to exercise a synthetic lead or an employee account before isolation is confirmed.

## Behavior

A shared `assessAltovenaDatabaseIsolation()` check guards Altovena operations before any Supabase client or RPC:

- In Vercel **Preview**, by default it is **blocked**.
- The owner must explicitly configure `ALTOVENA_STAGING_ISOLATION_ENABLED=true` and `ALTOVENA_STAGING_SUPABASE_PROJECT_REF=<separate 20-character lowercase alphanumeric project ref>`.
- The actually configured `NEXT_PUBLIC_SUPABASE_URL` must be an exact canonical `https://<separate-ref>.supabase.co/` URL, with no credentials, custom host, unexpected path or query, and a nonempty server-role key. The confirmed RealtyflowPRO production project `ereapsfcsqtdmzosgnnn` is always forbidden as a staging ref.
- When any part is missing, all Altovena-scoped CRM access (including read access), public intake, scheduled alert scan, delivery preflight and preview-only SMTP route fail closed. A real owner opening the launch-readiness route gets a **non-PII blocker checklist** without triggering CRM/Auth RPCs against the shared database.
- The helper deliberately leaves the existing Vercel Production flows of other brands alone. Preview restrictions apply only to Altovena, not the whole RealtyFlow platform. Test-runner actions explicitly use `NODE_ENV=test` and the isolated PostgreSQL 17 fixture.
- Passing this check is **only an endpoint configuration/URL boundary**, not proof of a separate active staging service-role key, database migration correctness, Auth grants or safe email providers. Those are independent release checks.

## Required staging operations after financial authorization

1. Obtain a Supabase branch/project pricing quote and explicit user cost authorization; do not create a branch/project automatically.
2. Create an isolated Supabase staging project or supported preview branch. Confirm its project ref is **different** from RealtyflowPRO production and includes no copied personal/customer data.
3. Scope `NEXT_PUBLIC_SUPABASE_URL`, publishable key and `SUPABASE_SERVICE_ROLE_KEY` to the **integration branch preview only**. Avoid broad updates to shared preview settings that would affect other brands. Never paste or commit keys.
4. Configure the two Altovena staging isolation variables only on the exact branch. Verify the deployment environment reads the staging URL; verify correct Auth and RLS, migration, two synthetic staff accounts and grants.
5. Rebuild a Vercel Preview of the reviewed SHA and confirm API blocker changes from BLOCKED to isolated Preview. Run only synthetic website-to-CRM-to-alert tests in staging; test permission revocation and erasure.
6. Separately review a fake SMTP/test mailbox and explicit recipient permission before allowing an operator email test. A successful SMTP call is *not* a delivery receipt.
7. Require current-head GitHub CI, privacy assessment, owner sign-off and a separate production release plan before enabling any public form or live emails.

## Evidence and limitations

The PR contains pure tests for default-off, exact stage URL validation and the hard production ref denylist, plus HTTP tests that verify *public lead intake, private CRM and all three cron routes* refuse a Preview bound to production. These tests use synthetic keys and never connect to Supabase. It intentionally makes **no migration** and changes **no Vercel environment settings**.
