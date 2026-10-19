# Altovena — owner staging-readiness and next-action guidance

Date: 19 October 2026 · Draft stacked on RealtyFlow #1466 → #1465 → #1464.

The owner-only `/altovena-launch` experience now gives **one actionable next
step** when a protected Vercel preview cannot safely test Altovena. Its
read-only status comes from the **server** and does not create a database,
configure secrets, invite staff, deploy code or enable customer intake/email.

## Evidence semantics

1. Missing or forbidden separate Supabase staging project → explain cost
   authorization and the required distinct project ID. No project is created.
2. Missing explicit staging switch → show it as not configured.
3. Missing or mismatched dedicated server URL/key → show only generic reason,
   without the URL, project ID or service-role key.
4. A matching preview endpoint is **configuration evidence only**. The
   app's status must always keep `stagingReadyForHumanTest:false` until
   an independent, manual environment/Auth verification has been completed.
5. Real staged Freddy/Andrea logins, active grants, synthetic lead E2E,
   permission revocation and any SMTP test remain **not externally verified**.
6. Public intake activation remains `readyForPublicForm:false` regardless
   of these checks. No automatic action or outbound email is triggered.

In production, existing RealtyFlow Auth, brand routes and shared platform
data remain unchanged. The on-screen checklist reports the current scoped
readiness only; it is not a production release switch.

## Unresolved account/session boundary

Although brand data now routes to a dedicated Altovena Supabase project in
preview, RealtyFlow's main login route still validates passwords, worker
directory and member admission against the **platform's Supabase Auth**.
A user who exists only in Altovena staging cannot yet sign in as an ordinary
workspace member using that flow. Do **not** create or copy production users to
staging, weaken admission checks or claim independent SaaS identity isolation.
Before two-user acceptance, design and audit a preview-only staging login
that cryptographically binds the Supabase staging Auth identity to an
appropriate scoped session, verifies staging grants on every action, and
cannot issue privileged platform sessions.

Do not provision any Supabase project/branch until the user has explicitly
approved its actual reported cost and organization. Production remains OFF.
