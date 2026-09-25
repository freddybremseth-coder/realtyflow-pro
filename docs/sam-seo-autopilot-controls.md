# Sam SEO: automated checks and publication boundaries

The daily `/api/cron/seo-autopilot` job is scheduled at 07:40 UTC. The weekly analysis runs Monday at 07:15 UTC. Nexus runtime controls and cron safe mode can pause execution. A schedule is not proof that a run succeeded.

Daily and manual checks now share `runSEOControls`. Both read independent Google, referral and inquiry aggregates; inspect approved public hosts; and execute the read-only collector OPTIONS check when measured clicks coexist with zero recorded arrivals. A failed data source remains unavailable, never zero. No synthetic visits or CRM inquiries are created.

Each new reading stores a `controlReport` in existing `automation_logs.details`. It records inspected pages, partial reads, static HTML observations and collector results. Older logs remain supported. A failed manual save is visible in the dashboard. Cron failures are logged and matched to the dedicated Automation Center entry; manual refreshes do not count as successful cron runs. More than 36 hours without a documented cycle shows a warning.

The public page sample rotates across all portfolio hosts, retaining the existing three-underside request limit. HTML quality checks record language, mobile viewport, missing alt attributes (empty decorative alt is accepted), JSON-LD syntax, and presence of contact links/forms. They do not submit forms or claim full accessibility compliance, functional conversion paths, field Core Web Vitals, semantic schema validity, ratings, or AI citations. Concrete HTML findings are surfaced even without Search Console impressions.

## Publication

The existing writer still supports only four explicit Zen Eco Homes metadata pages. The existing evidence gates, version checks, public HTML verification, cooldown and rollback remain in force. GitHub push permission does not activate publishing on other sites. The new quality findings are repair candidates, not claimed automatic fixes. Expanding publication requires a site-specific writer with exact page ownership, supported fields, revisions and public-result verification.

Google's [AI features guidance](https://developers.google.com/search/docs/appearance/ai-features) states that normal SEO fundamentals remain applicable and no special AI schema/file is required. This implementation therefore reports verifiable technical evidence rather than an invented GEO/AEO score. It cannot promise increased traffic or leads.

## Verification

Run `node --import tsx --test src/services/agents/seo-*.test.ts` and the Sam-specific automation registry test. The browser fixture uses the real dashboard component with mocked responses, without live credentials or customer records. Production scheduling, database persistence and public publishing must be verified after deployment; local tests do not establish live operation.

Validation for this change: 75 SEO tests passed; the Sam automation log-mapping test and focused TypeScript check passed. Desktop and 390px mobile fixtures rendered with the real component and mocked API responses. A read-only public audit ran against all nine configured targets. It surfaced absent server-rendered H1 on Re-Master and Doña Anna and recorded the oversized Zen sitemap as an incomplete read, not a healthy result. The repository-wide TypeScript check reports errors outside changed files (including missing vitest/workflow modules); the complete automation registry suite reports missing metadata for the unrelated email-history-backfill cron.
