# Altovena integration #1476 — production release gates
20 October 2026. Evidence anchored to GitHub commit `36c4081b82c86f25e7299c483e04c26648e7e731`.

## Verified
- Main integration: 0 commits behind `main` at the last check.
- All ten GitHub CI workflows succeeded, including Build validation, Altovena intake and isolated PostgreSQL, Main Freshness, Control Center, Re-Master contracts and migration integration.
- The two Altovena cron schedules have been intentionally removed from `vercel.json`. A contract test prohibits lead alerts, delivery preflight and staging SMTP schedules until an independently approved release.
- All new Altovena public intake, staging login, internal alerts and sending features are gated behind explicit opt-in variables. They are not configured in this Vercel project (read-only environment-key inventory).
- Supabase RealtyflowPRO currently exposes no development branches.
- An exact-commit, protected Vercel preview is requested at https://realtyflow-pz9hx8q5f-freddy-bremseths-projects.vercel.app; request alone does not establish READY, working Auth or DB isolation.

## NOT verified / DO NOT CLAIM READY FOR PRODUCTION
- No separately provisioned Altovena staging project or branch, no externally verified staging service credential, no approved database costs.
- No real two-operator Auth/grant/revocation/E2E acceptance, no separate outbound email provider test, no privacy review for live lead data.
- No production migration dry-run or live production migration verification, and no explicit owner authorization for new live data paths.
- Shared RealtyFlow login still exists, staging-only identity token must not be treated as a platform session.
- The PR is large and bundles the earlier unmerged Altovena development stack. Code-merge review must check impact on all existing brands; green CI is necessary but not sufficient.

## Safe release decisions
A. **Current default — HOLD**: keep #1476 draft; no production merge, migration or flags.
B. **Code-only integration candidate (requires explicit owner approval and verification):** independently inspect migrations and production code pathways; isolate any unsafe runtime scheduling, route activation or data migration. Then request approval for the precise code merge, not an implicit activation.
C. **Staging activation:** request documented quote and approval before provisioning a separate staging Supabase environment. Configure branch-scoped staging-only Vercel secrets; create synthetic accounts, not copied production identities; validate Auth, revoke, lead, alert, no-retry SMTP. No public users.
D. **Production launch:** separate approval for production migrations, cron registration, API credentials, customer intake and email. Those approvals must not be inferred from a GitHub merge.

This gate record does not issue any approval.