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

## Success measures

- 100% of active book projects show a current state and latest activity.
- 100% of series projects use a versioned bible/canon.
- At least 95% catalogue completeness across canonical file, cover, sample, description and channel identifiers.
- Zero duplicate active growth actions.
- At least 95% of campaign interactions include work, edition, channel and campaign identifiers.
- Sales, royalties, ad cost and conversion can be compared per book, edition and channel.

