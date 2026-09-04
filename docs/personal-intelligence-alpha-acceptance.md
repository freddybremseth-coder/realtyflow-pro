# Personal Intelligence — Private Alpha Acceptance Runbook

Status: Private Alpha accepted for owner use

Production baseline SHA: `cf47102929768ccd0c0b2647f1ae96ba5fdf559f`

## North star

The system should not merely remember Freddy. It should learn how to help Freddy become better at being Freddy.

The goal is not to maximize productivity, income or knowledge in isolation. The mentor should improve understanding, decision quality, learning and life alignment while preserving privacy, provenance and explicit user control.

## Acceptance state

The Private Alpha is accepted when all of the following remain true on `main`:

- GitHub Build Check is green.
- GitHub Build validation is green.
- Vercel production status is successful for the current `main` revision.
- No unresolved Personal Intelligence PR changes are required for the accepted revision.
- Production contains no fake/demo personal data.
- Personal memory is owner-controlled, evidence-based, traceable and correctable.
- Sensitive/restricted context is unavailable without explicit sensitive permission.
- External business/publishing context is read-only and cannot become canonical personal memory automatically.
- Idea is not treated as commitment.
- Topic mapping is not treated as mastery.
- Prediction attention never auto-resolves a prediction.
- Observation validation is not canonical memory; observation-to-claim promotion requires an explicit owner action.
- Hidden chain-of-thought is neither stored nor exposed.

## First-run activation

Use the production flow in this order:

1. **Start Here** — inspect current evidence/onboarding status.
2. **Orient** — answer only what you want; review extracted candidates and explicitly Remember or Drop each candidate.
3. **Interview** — add deeper context from your own words; review candidates before any persistence.
4. **Knowledge Map** — add domains/topics you want mapped. Mapping does not create mastery.
5. **Mentor** — start real mentor turns only after enough explicit context exists to be useful.

The first-run flow must never seed assumptions about Freddy from developer knowledge, historical chats, business systems or model inference.

## Evidence lifecycle

Personal claims follow the evidence lifecycle:

Captured → Candidate → Validated → Canonical / Disputed / Superseded / Expired.

Important distinctions:

- Candidate is not fact.
- Observation is not fact.
- Validated observation is not canonical claim.
- Goal is not commitment.
- Activity is not mastery.
- Outcome quality is not decision quality.
- Current context is not permanent identity.

## Privacy and provenance

Privacy levels are:

- Public
- Internal
- Private
- Sensitive
- Restricted

Sensitive/restricted use requires explicit permission for that request/session scope. Think Deeper may increase reasoning depth but must never widen privacy access.

Every important canonical memory must remain traceable to a source. Memory Provenance and Context Usage exist so the owner can inspect why a claim exists and which personal context was used.

## Write boundaries

Allowed durable writes require an explicit product action at the relevant boundary, including:

- Remember / Private for memory candidates.
- Explicit goal confirmation.
- Explicit knowledge topic mapping.
- Explicit decision creation/resolution.
- Explicit prediction creation/resolution.
- Explicit observation validation/rejection.
- Explicit observation-to-claim promotion.

Disallowed automatic behavior includes:

- personality or identity inference persistence;
- automatic canonical memory from assistant output;
- automatic mastery promotion;
- automatic action commitment;
- automatic prediction resolution;
- automatic observation-to-claim promotion;
- automatic persistence of Nexus, Olivia or Publishing context as personal memory;
- autonomous business side effects from Mentor.

## Production baseline at acceptance

At acceptance the production Personal Intelligence data store is intentionally empty:

- claims: 0
- goals: 0
- topics: 0
- mastery rows: 0
- mentor sessions: 0
- observations: 0
- predictions: 0
- decisions: 0
- context usage rows: 0
- audit events: 0

This is correct. The system should become personalized only through explicit owner use.

## Alpha operating protocol

During the first real-use period:

1. Use Start Here and complete a small amount of Orientation, Interview and Map input.
2. Confirm only memories that are genuinely useful and correct.
3. Run normal Mentor conversations across understanding, decisions and learning.
4. Use Think Deeper only when deeper analysis is worth the extra reasoning.
5. Inspect Why this?, Context, Provenance and Privacy when a response feels unusually personalized or sensitive.
6. Correct or reject inaccurate memory in Me rather than compensating for it conversationally.
7. Use Think for real decisions and record outcomes separately.
8. Use Predictions for claims where calibration is useful; resolve them explicitly after outcomes are known.
9. Use Learn and teach-back to build evidence before any mastery interpretation.
10. Review Observations before they gain significance.

## What to measure before the next feature round

Do not add features merely because a surface exists in the roadmap. Gather evidence from real use first.

Record only concrete product friction such as:

- the first-run flow is unclear or too long;
- Mentor uses irrelevant context;
- useful context is repeatedly missing;
- memory candidates are too noisy or too conservative;
- provenance is insufficient to understand a response;
- privacy controls are confusing;
- TODAY selects the wrong kind of attention item;
- decision/prediction/learning flows contain a dead end;
- an explicit write boundary is too easy to trigger accidentally;
- a read-only adapter creates pressure for an unintended action.

A future change should state which observed friction it fixes and preserve the existing safety invariants.

## Known deferred integration

Olivia remains outside the accepted production integration until a stable Olivia production host is verified and explicitly allowlisted. Do not send mentor secrets to arbitrary configurable Olivia URLs.

## Release rule

For every subsequent Personal Intelligence production change:

1. Create a clean feature branch from current `main`.
2. Keep the change narrowly scoped.
3. Add or update contract tests for relevant semantics.
4. Require fresh green Build Check and Build validation on the exact head SHA.
5. Verify the PR is based on current `main` and is mergeable.
6. Merge with expected-head SHA protection.
7. Apply production database changes only through the reviewed migration workflow when a schema change is genuinely required.
8. Verify production deployment and relevant read-only production state after merge.

Never claim a merge, deployment or production migration is complete until it has been independently verified.