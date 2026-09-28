# Sam SEO: public portfolio publishing

The daily `/api/cron/seo-autopilot` cycle now supports eight public brands. Existing read-only SEO/GEO/AEO, accessibility, referral and aggregate lead diagnostics continue. Care remains technical-only; private customer pages are not publication targets.

## Publication scope

Zen Eco Homes retains its four existing, versioned metadata landing pages. The other seven brands each have one approved homepage title/description variant in `seo-brand-publishing.ts`:

| Brand | Repository | Editable file | Verification deployment context |
| --- | --- | --- | --- |
| Pinoso EcoLife | Pinosoecolife | src/app/page.tsx | Vercel |
| FreddyBremseth.com | freddybremseth | home.html | Vercel – freddybremseth |
| Books | freddybremseth | books/index.html | Vercel – freddybremseth-books |
| Art | freddybremseth | art/index.html | Vercel – freddybremseth_art |
| Re-Master Freddy | remasterfreddy | index.html | Vercel |
| Doña Anna | donaanna | index.html | Vercel |
| ChatGenius.pro | chatgenius | index.html | Vercel |

All repositories belong to `freddybremseth-coder`. Freddy's root routing serves `home.html`, not `index.html`. Pinoso inherits its baseline metadata from `src/app/layout.tsx`; a marked homepage-only export overrides only title/description. A root canonical with or without the final slash identifies the same exact homepage. Other paths, query parameters, origins and redirects are not accepted.

## Execution and evidence

- Runtime `GITHUB_TOKEN` must read and write each exact repository and permit PR creation/merge. A local developer's token is not proof of server access. Missing privileges produce a visible blocked status.
- A fresh, non-truncated Search Console snapshot must belong to the exact brand/property. The root page needs at least 100 impressions, with a root-page query having at least 40 impressions, position 4–20 and CTR below 3%. Missing/weak data causes monitoring, not made-up results or publication.
- Current source metadata must equal public HTML. A mismatch blocks the writer; it does not redeploy unrelated source changes to repair the mismatch.
- A deterministic primary-key intent in service-role-only `automation_logs` records the original metadata and baseline before any GitHub write. One immutable experiment per brand/variant prevents competing retries or repeated changes. Future variants require a new version and a deliberate cooldown/effect design; changing v1 copy in place is unsupported.
- The writer creates a dedicated `codex/sam-seo-<brand>-v1` branch and PR. Only the exact calculated metadata patch in the configured file is accepted. No main force-push or arbitrary file edit is possible.
- Each daily cycle advances a bounded phase. Brands sharing a repository run sequentially. GitHub requests have a shared 45-second cycle budget and individual timeouts; interrupted work resumes from its durable state.
- Main changes trigger a normal merge into the feature branch followed by fresh checks. The exact brand's Vercel context and every returned check/status must be green before squash merge of the exact checked head.
- A merged PR is pending until its deployment checks and public HTML agree on title, description and canonical and permit indexing. An effect record is persisted idempotently before counting a publication. Retries cannot count or insert it twice.
- A complete 30-day period after publication is needed for an observational query/page comparison. It does not prove causality, improve ratings by itself, or guarantee traffic/leads.

## Rollback and owner view

After 72 hours without public confirmation, Sam queues an exact metadata restoration through a separate checked PR. A verified change can also be queued for restoration by the owner from Sam's panel. The owner endpoint enforces session role, same-origin JSON and the exact stored revision. Queueing is not immediate public restoration: the daily cycle progresses the PR, checks and public verification.

Manual metadata changes or unexpected source files stop restoration rather than overwrite newer edits. Completed restoration closes the experiment's active effect measurement and cannot automatically start the same v1 experiment again.

The panel distinguishes configured/not-yet-measured, monitoring, pending, blocked, verified and restored. It reads durable rollback intent in addition to the latest cycle so reloads preserve queued state. Technical repository access is displayed separately from successful publication.

## Validation

Run the SEO service tests and the private/public route tests in `.github/workflows/seo-agent-validation.yml`. Stateful tests cover claim races, missing access/evidence, source mismatch, extra-file rejection, stale main, merge recovery, failed audit persistence, exactly-once counting, public confirmation and owner/automatic restoration. Test fixtures do not contact GitHub or publish sites.
