# Altovena-only Supabase staging connection — design and release gate

**19 October 2026 · Draft stacked on #1465 → integrated #1464. No live environment change.**

## Corrected architecture

The original staging gate in #1465 checked the shared RealtyFlow `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Although it blocks production when they are not isolated, changing those shared preview variables would risk pointing **other RealtyFlow brands** at the Altovena staging database. This follow-up implements a **brand-specific server-only connection** instead:

- `ALTOVENA_STAGING_ISOLATION_ENABLED=true`
- `ALTOVENA_STAGING_SUPABASE_PROJECT_REF=<separate 20-character lowercase alphanumeric project ref>`
- `ALTOVENA_STAGING_SUPABASE_URL=https://<separate-ref>.supabase.co`
- `ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY=<secret from staging project only>`

Never put the staging service-role key in a `NEXT_PUBLIC_` variable. Values belong to the **specific Vercel preview branch** only, not all preview deployments or production.

`getAltovenaSupabase()` now routes **all Altovena workspace/identity reads**, server-to-server public intake, owner readiness, alert scan, preflight candidate preparation and manual preview SMTP staging to this distinct connection when running in Preview. The existing `getPlatformSupabase()` remains the sole connection for Zen Eco Homes, PinosoEcolife, other brands and Altovena Production. The dedicated Altovena preview handler **never falls back to platform credentials** when the staging variables are missing or invalid.

The Vercel production flow and all existing other-brand routes remain unchanged. Isolated offline tests use their existing injected mocks and disposable local PostgreSQL. Personal data must NOT be copied from production into staging.

## First workspace request audit

The first HTTP request from the focused `/workspace/altovena` client is
`GET /api/workspaces/altovena/capabilities`. The initial #1466 implementation
still used the **shared platform Supabase client** in that route, despite
isolating the follow-on CRM routes. That discrepancy has now been corrected:
capabilities performs the Altovena staging gate before any Auth/CRM lookup and
uses `getAltovenaSupabase()`. Owner and independently verified staff must
obtain their capabilities solely from staging; revoked staff must not fall
back to production grants. Synthetic tests assert that selecting
`pinosoecolife` still uses the unchanged platform route.

**Scope boundary:** Shared RealtyFlow login/session, global navigation, and
non-Altovena brand operations may continue using platform services. This is
*brand-data isolation*, not a new independently hosted RealtyFlow installation.
A full system-wide staging clone would require a separate deployment and auth
design; do not claim this branch achieves that.

## Staff workspace discovery (isolated staging)

The employee workspace selector `GET /api/workspaces/available` normally
reads RealtyFlow's shared platform grants for existing brands. In preview it
must **never advertise a production Altovena grant**, even after production
provisions Altovena. It now filters the platform's Altovena rows and, *only if
isolated staging is configured*, separately checks the Altovena staging
`workspace_brand_grant` and Auth identity. The staged, actively verified
employee can then see an `Altovena · testmiljø` entry with only explicitly
granted brand permissions. A revoked grant, invalid identity or missing
staging configuration hides Altovena rather than falling back to the
platform grant. All other existing brands retain their platform list.

These controls protect brand data and UI discovery; the shared RealtyFlow
session admission mechanism still uses the platform identity system. A
standalone SaaS tenant needs a separately designed account/session boundary.

## What the gate can and cannot prove

The gate proves a canonical staging **endpoint configured against a different project reference than RealtyflowPRO production**. It does **not** cryptographically confirm that the configured service-role key corresponds to the staging project, and it cannot replace a true staging Auth/grant and database permissions test. A wrong secret will fail when the staging RPCs run; the app should report unavailable, not try the production database.

The owner readiness panel returns a no-PII blocker if the staging connection is missing. CRM, contact intake and all Altovena Cron stages refuse access before database calls. The public form is still disabled by the separate intake feature flag.

## Validation / authorization

- Unit tests explicitly leave the platform production URL and key in place and show an Altovena preview RPC using **only** a synthetic staging endpoint and staging key. A platform factory trap ensures there was no accidental fallback.
- Tests also cover invalid/missing staging parameters and explicitly verify the unchanged production client routing.
- The whole combined RealtyFlow build must pass before the code can be considered integrated.
- **No staging database is created in this PR**; Supabase preview branches/projects may generate compute, disk and egress charges. Obtain explicit cost approval before provisioning.
- Once approved: create independent staging database, apply only reviewed migrations, assign two synthetic test identities and verified Altovena brand grants, configure the four branch-scoped server-side variables, build/redeploy preview, test real CRM + revocation + erasure and disabled email flags, then review provider acceptance testing and independent delivery-receipt design.
- Never enable actual production intake, migrations or outbound emails without a separate explicit release authorization.


## Operator acceptance matrix (required before enabling staging actions)

Keep a signed evidence record with **environment**, **exact Git commit SHA**, **Vercel deployment ID**, **staging Supabase project ref (not secrets)**, tester, timestamp and the actual observed outcome for each row. A screenshot without commit/environment identity is not sufficient release evidence.

| Scenario | Expected observation | Acceptance |
| --- | --- | --- |
| No dedicated staging variables | Altovena preview reads fail closed; no fallback to shared platform Supabase | Mandatory |
| Wrong staging project ref / mismatched URL | Altovena preview rejects configuration before database access | Mandatory |
| Wrong staging service-role key | Staging-only RPC fails; no retry against production | Mandatory |
| Owner with valid staging Auth identity and brand grant | Only explicitly granted Altovena capabilities are visible | Mandatory |
| Andrea with active staging member grant | Only intended Altovena workspace and permitted actions are visible | Mandatory |
| Andrea's staging grant revoked | Altovena disappears from workspace selector and Altovena APIs deny access on a new request | Mandatory |
| Staging grant absent but production grant present | Preview must not expose Altovena via production-derived grants | Mandatory |
| PinosoEcolife or Zen Eco Homes in same RealtyFlow preview | Unchanged platform-backed behavior; no Altovena staging reads | Mandatory |
| Synthetic lead submission with intake flag OFF | No new contact, notification or task | Mandatory |
| Approved, synthetic staging lead with isolated flags ON | Exactly one staging contact and corresponding task; no writes to production | Future, separately gated |
| Email/scheduled alert flags OFF | No outbound provider call or scheduled action | Mandatory |
| Operator email test | Separately authorized, staging-only recipients and sender; provider evidence required | Future, separately gated |

**Evidence status conventions:** `NOT_RUN` (not attempted), `BLOCKED` (prerequisite missing), `FAILED` (observed contrary to expected result), `PASSED` (observed on exact deployment). Never turn `BLOCKED` into `PASSED` based on unit tests, GitHub CI or the presence of environment-variable names. A change of commit SHA or target environment invalidates prior acceptance for the changed candidate.

## Staging activation sequence and stop conditions

1. **Cost approval first:** record the separately authorized staging project/branch and its expected cost envelope. No resource creation, paid branch or environment-variable change is implied by a green PR.
2. **Isolate identities:** create synthetic, non-production Auth identities, explicit Altovena-only grants and reviewed schema in the dedicated staging resource. Do not copy live customer records, shared service-role keys or production credentials.
3. **Scope preview configuration:** apply the four `ALTOVENA_STAGING_*` variables exclusively to the intended preview branch. Confirm they are **not** exposed to production, generic preview branches or `NEXT_PUBLIC_*` outputs. Keep all mail and public intake switches off.
4. **Verify exact deployment:** independently match Vercel's `READY` deployment source SHA to the PR head; run the matrix above, preserving actual evidence and failures.
5. **Exercise revocation and boundaries:** test fresh owner/employee requests after staff grant revocation; confirm the workspace selector, capabilities, CRM endpoints and other brands behave correctly. An existing browser session alone is not proof of revoked access.
6. **Require separate release decision:** record human approval for an explicit release candidate **after** all mandatory checks pass, plus data protection, deletion/retention and rollback reviews. This decision does not authorize automatic GitHub merge, production migrations, website publishing or customer emails.

**Immediate STOP:** unexpected live customer data, any Altovena RPC reaching the platform production project, a staging grant sourced from production, any outbound email without explicit authorization, a wrong or changed commit, an unreviewed migration, or evidence of staging secrets in client bundles/logs. Disable the attempted staging action, preserve non-secret audit details and investigate before another test. Do not attempt fallback routing.

## Change ownership and separation of approvals

- **Technical owner:** confirms deployment SHA, isolation, migration review, automated test evidence and rollback.
- **Workspace owner:** signs off intended capabilities, visual QA, staff revocation, lead-flow outcomes and manual readiness.
- **Privacy/website owner:** approves synthetic-data policy, retention/deletion, domains, Turnstile and public-facing legal text.
- **Release approver:** separately authorizes an exact production release after all gates; review-only records never confer that power.

This is a **runbook and acceptance contract**, not a claim that staging resources or tests exist. Any missing row remains `NOT_RUN` or `BLOCKED` until observed evidence exists.
