# RealtyFlow Pro Autonomy Master Plan

Status: LOCKED product direction — 2026-09-08

## North Star

RealtyFlow Pro should operate the normal daily business automatically and bring Freddy only exceptions, high-value decisions, sensitive communication, negotiation, legal/financial actions, and strategic choices.

The operating model is no longer “AI suggests everything, Freddy approves everything”. The target model is:

```text
System executes automatically when evidence, policy and confidence are strong enough.
Freddy handles exceptions and high-risk decisions.
```

## Safety tiers

- `AUTO` — low-risk, reversible or governed action with sufficient evidence/confidence.
- `REVIEW` — medium-risk or incomplete-confidence action requiring quick human review.
- `FREDDY` — high-risk, conflicting, legal, financial, negotiation, irreversible or otherwise sensitive action.

No caller may promote a central safety decision from `FREDDY` to `AUTO`.

## Implementation order

1. Autopilot Safety Model.
2. Inbound Reply Intelligence: inbound email/message → understand → CRM → suppression/status → next action.
3. Buyer Profile Auto Activation for complete high-confidence profiles.
4. Continuous Property Matching when buyer/property data changes.
5. Smart Property Delivery with governed match/confidence/recipient controls.
6. Pipeline State Machine with explicit entry, action and exit conditions.
7. Nexus Today as the primary operating surface.
8. Navigation simplification around Today, Customers, Properties, Content, Brands, Business, Nexus and System.
9. Cross-brand learning / Portfolio Intelligence.
10. Revenue Attribution Loop from content/source through lead, pipeline and realized revenue.
11. Governed autonomous experimentation (champion/challenger).
12. Self-healing automations with retry, diagnosis, safe recovery and escalation.

## Current first thresholds

These are intentionally conservative and may only be relaxed from measured evidence:

- Buyer Profile: `>=95%` confidence can be AUTO when required data is complete and evidence is non-conflicting.
- Buyer Profile: `80–94.99%` goes to REVIEW.
- Outbound customer communication requires verified recipient, safe contact/consent state and `>=95%` confidence for AUTO.
- Automatic property delivery additionally requires Match Score `>=90`.
- Do-not-contact/suppressed recipients are blocked from outbound automation.
- Legal, financial and negotiation actions remain FREDDY.
- Terminal pipeline stages (`WON`, `LOST`) remain FREDDY until explicit governed outcome rules are separately designed and verified.

## Product principle

Do not widen RealtyFlow with more parallel dashboards unless necessary. Prefer connecting existing strong modules into one measured business loop:

```text
lead → understanding → CRM memory → buyer profile → matching → follow-up → viewing → negotiation → revenue → attribution → learning → improved next action
```

The desired UX is exception management: the system should report what it handled automatically, what requires review, and the small number of actions that genuinely need Freddy.
