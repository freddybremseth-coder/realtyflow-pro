# RealtyFlow Book OS — locked master plan

Status: **Locked 2026-08-28**
Owner: Freddy Bremseth
Implementation order: Phase 0 through Phase 5, completed systematically in sequence.

## Product promise

RealtyFlow Book OS shall provide one coherent lifecycle for every book:

> Idea → series bible/canon → manuscript → quality → publishing package → distribution → marketing → sales → learning

The normal user experience exposes four primary actions:

1. Create a new book
2. Continue a book
3. Publish a book
4. Sell and improve

Advanced administration, reconciliation, channel details and diagnostics remain available, but do not interrupt the normal lifecycle.

## Locked principles

- OpenAI is the primary authoring engine. Additional models may act as independent reviewers at explicit quality gates.
- Every series book has a versioned series bible and canon before new manuscript production is approved.
- Existing books can be upgraded to the current production standard without overwriting their source manuscript.
- A work, edition, production revision and channel publication are separate objects with stable identifiers.
- One edition has one explicitly selected canonical manuscript and one canonical export package.
- Approval is contextual and milestone-based. “Approved” and “applied” are separate, visible states.
- External publishing, material price changes and destructive reconciliation require explicit human approval.
- Automated marketing is frequency-capped, brand-isolated and attributable to the relevant work, edition and campaign.
- The system may recommend books from market evidence, catalogue gaps and author fit; popularity alone must never trigger autonomous production.
- No component may claim that a marketplace is automated unless an operational and verified connector exists.

## Delivery phases

### Phase 0 — Foundation and stabilization

- Stop repeated KDP work-item creation.
- Roll historical duplicate work items into one active item per book and action without deleting audit history.
- Make the production build green and deterministic.
- Protect Book Growth tables and privileged functions as server-only data paths.
- Establish a repository-backed Book OS schema contract and detect migration drift.
- Define canonical lifecycle identifiers and state vocabulary before new UI work.

### Phase 1 — Publisher Cockpit

One book workspace, visible activity/progress/errors, four primary actions, contextual approvals and upgrade/resume flows.

### Phase 2 — Canonical catalogue

Reconcile works, editions, projects, assets, identifiers and channel publications into one source of truth.

### Phase 3 — Quality and taxonomy

Series bible/canon gates, editorial and factual review, EPUB/accessibility validation, controlled taxonomy and channel metadata mapping.

### Phase 4 — Book launch factory

Generate an attributable launch campaign from the approved publishing package, with frequency limits and one campaign approval.

### Phase 5 — Sales and learning

Import channel results, measure direct sales and attribution, run reversible experiments and use evidence to recommend the next improvement or book.

## Phase 0 acceptance criteria

- Re-running the publishing growth loop creates no second open item for the same book and action.
- Historical duplicates are retained as `CANCELLED` with roll-up metadata; no rows are deleted.
- The database rejects concurrent duplicate open Book Growth actions.
- Book Growth mutation functions are not executable by `public`, `anon` or `authenticated`.
- Book Growth operational tables are explicitly server-only and retain RLS.
- Book OS migrations have static contract tests included in CI.
- `npm run build` passes from a clean dependency installation.
- The current production schema and repository migration history have a documented reconciliation path.

## Phase 1 acceptance criteria

- The Publisher Cockpit presents exactly four primary actions: create, continue, publish, and sell/improve.
- Every active project shows one current lifecycle stage, its latest activity, and one recommended next action.
- A failed production is prioritized ahead of ordinary in-progress work and exposes the persisted error state.
- A returning user can see an active production after reload and open the affected project directly.
- Legacy and interrupted projects can be upgraded to the current bible/canon workflow without replacing source chapters.
- Final approval is revision-specific, visibly separate from distribution, and can be revoked.
- Distribution and Book Growth become primary actions only after the exact manuscript revision is approved.
- Editing, export, translation, analysis, and administrative tools remain available without competing with the primary workflow.

## Phase 2 acceptance criteria

- Work, edition, production revision, asset, identifier, and channel publication have separate stable identifiers.
- Every legacy or operational source row can be traced to its canonical entity through an explicit source link.
- Existing source rows and files are preserved; catalogue backfill never deletes or silently overwrites them.
- Title similarity may create a reconciliation candidate, but never an automatic merge.
- Applying a work merge requires a separately recorded approval and produces an immutable merge log.
- Every active edition has at most one selected canonical revision and one selected canonical asset per asset type.
- Channel publications identify the exact edition and production revision they deliver.
- Publisher Cockpit shows catalogue coverage and directs incomplete editions to one reconciliation workspace.
- Canonical catalogue tables and merge functions are server-only, RLS-protected, and covered by schema-contract tests.

## Phase 3 acceptance criteria

- Series bible, work canon, style guide and research standard are versioned records linked to the canonical work.
- Only one approved version of each bible type is active for a work, and approval records actor and time.
- Every quality result belongs to an exact production revision; a later attempt supersedes earlier evidence without deleting it.
- Machine or AI result and human decision are separate fields. An AI pass never becomes editorial, factual or canon approval by itself.
- Fiction and nonfiction use explicit, different required quality gates; waived gates require an attributable reason.
- EPUB and accessibility validators retain structured evidence and may pass deterministic technical gates without pretending to be editorial approval.
- BISAC, retailer categories, keywords, audience and themes are controlled assignments with source/version provenance.
- Taxonomy suggestions remain proposals until approved and cannot silently overwrite applied channel metadata.
- The normal UI presents missing gates as concrete next actions rather than one opaque quality score.
- Quality and taxonomy tables are server-only, RLS-protected and covered by schema-contract tests.

## Phase 4 acceptance criteria

- A launch campaign can only be generated from the exact canonical revision, four approved channel metadata packages, and verified canonical EPUB and cover.
- The 30-day campaign obeys the locked total, per-channel and spacing limits before it can be staged.
- Campaign approval is one attributable decision and remains separate from activation, scheduling and external publication.
- Activating an approved campaign is atomic and idempotent and creates only traceable internal calendar drafts for the selected start date and timezone.
- Calendar activation revalidates canon, metadata and source assets so stale campaigns cannot enter the active calendar.
- No launch action creates an external marketing publication until a later, separately approved and operational channel workflow exists.
- Launch campaign, activation and calendar data are server-only, RLS-protected and covered by schema-contract tests.

## Phase 5 acceptance criteria

- Sales, royalties, advertising cost and engagement evidence retain their source row and are attributed to a canonical work and edition.
- Revision attribution is explicit: exact revision and edition-only evidence are different visible states.
- Re-importing the same source metric is idempotent and never duplicates, deletes or overwrites canonical evidence.
- Unmatched or ambiguous sales rows enter a visible reconciliation queue and are never silently assigned to a similarly titled book.
- Monetary totals remain separated by currency unless a dated, attributable exchange-rate conversion is explicitly applied.
- Experiments require a recorded baseline, one controlled change, a measurement window and a reversible application path.
- Weak evidence produces an inconclusive result; one experiment can never become a reusable learning rule.
- Learning-based improvements and new-book recommendations remain proposals until explicitly approved.
- Sales evidence, experiment and learning tables are server-only, RLS-protected and covered by schema-contract tests.

## Success measures

- 100% of active book projects show a current state and latest activity.
- 100% of series projects use a versioned bible/canon.
- At least 95% catalogue completeness across canonical file, cover, sample, description and channel identifiers.
- Zero duplicate active growth actions.
- At least 95% of campaign interactions include work, edition, channel and campaign identifiers.
- Sales, royalties, ad cost and conversion can be compared per book, edition and channel.
