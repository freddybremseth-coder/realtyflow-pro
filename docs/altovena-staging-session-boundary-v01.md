# Altovena — isolated staging session boundary (19 October 2026)

**Draft, stacked on #1469 → #1466 → #1465 → #1464.**

## Implemented in this increment

`src/lib/altovena/staging-session.ts` defines an independently signed
`altovena_staging_session` token with exactly **15 minutes** validity.
It is a narrow **cryptographic identity proof**, not a RealtyFlow login.
The signing secret `ALTOVENA_STAGING_SESSION_SECRET` must differ from both
the platform's `REALTYFLOW_SESSION_SECRET` and the database service keys.

The token has a fixed `altovena:staging-only:v1` audience, exact
`altovena` brand, staging Supabase project reference, Auth UUID, verified
email and issue/expiry timestamps. The verifier is fail-closed if the Vercel
environment is not `preview` or the dedicated staging isolation gate is
not active. HMAC verification uses constant-time comparison.

**Critical boundaries:** This token is NOT accepted by
`verifyAdminSession`, does NOT become a `realtyflow_admin` cookie, and
has deliberately NOT been wired into shared RealtyFlow global auth,
middleware, workspace routing or role-based permissions. It must not be
used to access non-Altovena modules.

## Staging Auth admission (not an HTTP login)

A separate `staging-admission.ts` helper authenticates against the isolated staging Supabase publishable-key Auth client. It requires exact Auth UUID/email and a current active Altovena `crm.read` grant verified independently by the staging admin. Wrong-brand, revoked, missing CRM permissions, or mismatched identity fail closed. No HTTP login route or cookie issuer calls this helper yet. All tests use synthetic dependencies; no account or production access is created.

## Next implementation before real login is enabled

1. Add a staging-only Auth admission route that authenticates against
   Altovena's separately configured staging **publishable (anon) key**;
   never authenticate human passwords with the service-role client.
2. Verify the resulting Auth user ID and email against a current active
   Altovena staging-only brand grant, including the minimum CRM permission,
   before issuing this token in a Secure, HttpOnly, SameSite cookie.
3. Bind exactly Altovena staging routes to this session. Each privileged
   request must recheck live staging Auth and brand grant independently.
   Never make the global `getRequestAccessContext` trust this cookie.
4. Test CSRF protection, logout, revocation, expiration, brand isolation,
   cookie forgery, production hard block and full isolated user flow with
   synthetic staging accounts before opening staging login.
5. Create staging Supabase only after specific user cost authorization,
   and never duplicate production identities or grant permissions.

The new offline tests prove expiry, tamper detection, project binding,
production blocking, independent signing key and mutual non-acceptance with
the RealtyFlow platform cookie. **No login route, actual access permission,
new database, real email or production deployment is created by this PR.**
