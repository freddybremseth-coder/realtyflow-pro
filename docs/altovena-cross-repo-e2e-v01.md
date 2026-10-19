# Altovena website → RealtyFlow → PostgreSQL: cross-repository E2E v0.1

**17 October 2026 – isolated tests only. No production integration or live API credentials.**

## Ownership and version pairing

- Public Altovena website source: `freddybremseth-coder/Altovena`, **pinned** commit `ded27cde669e8740e98bfb372de47fba21181133` (site contact-handler release-gates in Altovena PR #5).
- Internal RealtyFlow source: `freddybremseth-coder/realtyflow-pro`, this stacked branch, based on CRM PR #1400.
- Test implementation: `scripts/test-altovena-cross-repo-bridge.ts`, run under the existing `Altovena intake validation` workflow's disposable PostgreSQL 17 job.
- CI checks out the pinned public Altovena repo into `altovena-website/`; never checkout a floating branch or download executable code via user-provided URL in this security-sensitive test.

## What genuinely runs

1. The real website `api/contact.js` handler receives an in-memory synthetic browser request.
2. The real site handler validates its editorial, legal, form, origin, CAPTCHA and destination gates. The Cloudflare verification request is intercepted and returns a synthetic response.
3. The site's HTTP request to `https://realtyflow.chatgenius.pro/api/public/altovena-leads` is intercepted and dispatched **directly to the actual RealtyFlow Next.js POST handler**.
4. The RealtyFlow POST handler validates the secret, brand and payload and invokes Supabase-js. Its PostgREST request is intercepted and executed against the **actual** `public.altovena_receive_lead` SQL routine.
5. The local PostgreSQL 17 database is bootstrapped from existing fixtures and migrates exactly as in the existing CRM integration suite. All synthetic contacts and work-items are written inside a top-level transaction that is rolled back in `finally`.
6. The response travels all the way back through RealtyFlow and the site handler; only then does the synthetic browser receive `{ok:true,received:true}`.

Every outbound destination is allowlisted; an unexpected HTTP endpoint makes the test fail.

## Explicitly asserted behaviors

- The public website form gate is OFF by default and refuses a request before any downstream call.
- Wrong browser Origin or rejected synthetic CAPTCHA cannot reach RealtyFlow.
- One accepted submission creates exactly one Altovena contact, one brand-scoped follow-up work-item and one receipt.
- Retrying the identical submission ID and body with a *new* CAPTCHA token reuses the receipt and does not duplicate the contact/task.
- Reusing the same ID with a changed message is rejected without writing another task.
- Wrong shared intake secret is rejected by RealtyFlow's **real** key-authentication handler, not by a test stub.
- Existing Zen Eco Homes fixture remains untouched.
- The created contact has stopped automated nurturing and AI follow-up.
- No CRM IDs, marketing subscriptions, finance fields or private secrets are returned to the public site's success response.

## Verified CI

- [GitHub Actions run #39036712085](https://github.com/freddybremseth-coder/realtyflow-pro/actions/runs/39036712085) – `Altovena intake validation`: **SUCCESS**. Both the new cross-repo test, existing HTTP→SQL test and comprehensive PostgreSQL migration/consent/isolation tests logged `PASS`.
- The site handler's import was moved inside an async function to match the tsx CommonJS runner, and the simulated transport was adjusted so the *real* RealtyFlow handler evaluates incorrect keys. Both test-only issues were resolved.

## Important omissions: never interpret as launch approval

- **No actual Internet or browser network request** crosses between deployed Altovena and RealtyFlow.
- No Turnstile verification against Cloudflare; only its **response contract** is mocked.
- No production Supabase migration, keys, grants, customer info, emails or notifications.
- No verification of Andrea's real Supabase Auth membership for Altovena.
- No staged end-user session, operational alert delivery, accessibility/browser rendering or legal-controller/retention sign-off.
- Pin must be refreshed and rerun if the Altovena website contact handler or its upstream build configuration changes. The pin is intentionally fixed so that CI can attest to the exact tested pair, not drift silently.

**Remaining release gates:** explicit owner authorization, legal/retention/Turnstile verification, production-ready role grants and staging secrets, a separate carefully scoped live staging network test with two authenticated users and one synthetic lead, CRM/task visibility for Freddy/Andrea, failed-connection recovery and alert tests, and combined current-head CI.
