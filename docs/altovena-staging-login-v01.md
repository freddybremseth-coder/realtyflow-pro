# Altovena isolated staging login route — 20 October 2026

Draft stacked on #1470 → #1469 → #1466 → #1465 → integration #1464.

## Implemented

- `POST /api/altovena/staging-auth`: hard Vercel Preview-only, requires `ALTOVENA_STAGING_LOGIN_ENABLED=true` and correctly isolated Supabase staging URL/project reference/server role key. Uses separate staging publishable Auth password sign-in, then independently checks current staging Auth UUID/email, active Altovena brand grant and `crm.read`. No platform login/session is issued.
- Requires exact HTTPS same-origin and matching forwarded host before processing any credentials (CSRF and host-spoofing guard). JSON-only input, bounded fields. Authentication errors are generic.
- `altovena_staging_session` cookie: Secure, HttpOnly, SameSite Strict, 15 min, path confined to staging auth route. Signed independently from RealtyFlow's cookie with staging project and exact Altovena audience. Global RealtyFlow middleware and permissions ignore it.
- `DELETE /api/altovena/staging-auth`: same-origin logout clearing only staged cookie; never clears or creates a platform session.

## Release blockers

**This is not a released sign-in product.** The route remains disabled because no dedicated staging Supabase project exists and no keys or user grants have been configured. Also, before real-world password admission can be enabled: add a durable distributed rate limit against credential stuffing, audit CSRF behavior in real preview behind Vercel's reverse proxies, verify staging Auth identity and grant revocation in an isolated environment, scope a separate staging UI/API to this cookie with per-request live revocation checks, and ensure no global RealtyFlow role or access is granted. Do not repurpose the platform login page or grant staging tokens access to ordinary workspace routes.

All tests use synthetic inputs. No production database/credentials/accounts, sending, SMTP or deployed live login are changed.
