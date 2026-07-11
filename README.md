# RealtyFlow Pro

RealtyFlow Pro is Freddy Bremseth's AI-assisted business operating system for real estate, lead handling, content, SaaS sales, and revenue follow-up.

The app is a Next.js 14 + TypeScript + Supabase platform. It is currently optimized as an internal admin and sales system, not as a fully external multi-tenant SaaS product.

## Current Product Focus

The near-term priority is to make two workflows excellent before widening scope:

1. **Lead Intelligence for real estate**
   - Analyze customer messages into structured buyer profiles.
   - Review requirements manually.
   - Match properties safely.
   - Save quality-reviewed shortlists.
   - Generate internal customer presentations and email drafts.
   - Keep contact creation, lead creation, and sending behind explicit gates.

2. **DemoSites Revenue Engine**
   - Import or analyze local business websites.
   - Generate private DemoSite previews.
   - Prioritize opportunities.
   - Produce manual outreach and follow-up worklists.
   - Track lead state toward booked sessions, wins, or not-fit.

The operating rule is:

```text
AI suggests. Freddy reviews. Freddy approves. The system acts only after explicit approval.
```

## Daily Revenue Inbox

`/today` is the daily operating surface for real-estate sales. It ranks active customers using deterministic and traceable signals:

- pipeline stage and potential value
- new inquiries and recent buying signals
- overdue or missing follow-up dates
- stale customer contact
- viewing and negotiation stages that need closing attention

The page combines customer priorities with open real-estate work items. Freddy can open the customer in CRM, continue in Lead Intelligence, schedule the next follow-up, or complete a stored work item. It does not send customer messages automatically.

Public lead intake supports allowlisted brand routing for Zen Eco Homes, Soleada.no, and Pinoso EcoLife through `brand`, `brand_id`, `brandId`, or the `x-realtyflow-brand` header.

## Key Areas

- `src/app/(realty)/today` - daily Revenue Inbox, next-action visibility, and closing priorities.
- `src/app/(realty)/lead-intelligence` - AI lead intake, buyer profiles, property matching, shortlists, and draft presentations.
- `src/app/(realty)/pipeline` - CRM pipeline, lead import, buying signals, commissions, and customer follow-up.
- `src/app/(realty)/inventory` - Property inventory, RedSP/XML/CSV import, brand visibility, PDFs, and marketing copy.
- `src/app/(business)/demosites` - DemoSite order/preview/claim workflow.
- `src/app/(business)/revenue-engine` - Opportunity prioritization and manual outreach workflow.
- `src/services/lead-intelligence` - Structured contracts, extraction, persistence, matching, shortlist, presentation, and safety gates.
- `src/lib/revenue/today.ts` - deterministic real-estate opportunity scoring and next-action recommendations.
- `src/lib/revenue-engine.ts` - Revenue opportunity scoring, worklist logic, and outreach drafts.
- `supabase/migrations` - Reviewed schema source of truth. Production migrations are not applied automatically.

## Docs To Read First

- `docs/product-focus-and-golden-flow.md`
- `docs/lead-intelligence-send-crm-gate-plan.md`
- `docs/lead-intelligence-production-activation-plan.md`
- `docs/realtyflow-production-migration-path.md`
- `docs/supabase-pro-unification-plan.md`

## Development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Server Secrets

Set these in `.env.local` for local development and as server-side deployment secrets in production:

- `REALTYFLOW_SESSION_SECRET` and `REALTYFLOW_ADMIN_EMAILS` for internal admin sessions.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for server-side Supabase access.
- `STRIPE_WEBHOOK_SECRET` for `/api/saas/stripe`; unsigned or misconfigured webhooks are rejected before database access.
- `CRON_SECRET` for `/api/cron/*`; these routes fail closed when the secret is missing.
- `DEMOSITES_CRON_SECRET` or `CRON_SECRET` for `/api/saas/demosites/expire`.
- `NEXT_PUBLIC_REALTYFLOW_URL` when generated DemoSites links should point somewhere other than the default production URL.

## Verification

```bash
npm run test:lead-intelligence
npm run test:contacts-api
npm run test:revenue-today
npx tsx --test src/lib/api-admin.test.ts src/lib/api-cron.test.ts src/lib/cron/safe-mode.test.ts src/lib/saas-api-supabase.test.ts src/app/api/cron/cron-routes-auth.test.ts src/app/api/outbound-actions-auth.test.ts src/app/api/maintenance-actions-auth.test.ts src/app/api/saas/service-role-auth-coverage.test.ts src/app/api/saas/internal-routes-auth.test.ts src/app/api/saas/stripe/route.test.ts src/app/api/saas/demosites/route.test.ts src/app/api/saas/demosites/internal-routes-auth.test.ts src/app/api/saas/demosites/public-routes-boundary.test.ts src/app/api/saas/demosites/leads/route.test.ts src/app/api/saas/demosites/profile-import/route.test.ts src/lib/stripe-webhook.test.ts src/lib/revenue-engine.test.ts src/lib/demosites.test.ts src/lib/demosites-preview.test.ts src/lib/demosites-import-review-versions.test.ts src/lib/constants.test.ts
```

Use `npm run build` before production-impacting changes.

## Production Safety

- Do not run broad historical Supabase migrations in production.
- Do not enable send, contact creation, lead creation, or property matching flags without a specific activation plan.
- Keep `REALTYFLOW_AUTO_SEND_ENABLED=false`.
- Browser code must never receive service-role credentials, runtime database URLs, HMAC lookup secrets, or contact lookup hashes.
