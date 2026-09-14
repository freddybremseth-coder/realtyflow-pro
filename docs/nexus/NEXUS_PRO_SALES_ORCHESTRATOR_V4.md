# Nexus Pro Sales Orchestrator v4

## Product boundary

RealtyFlow keeps **one visible conversational advisor: Nexus AI**. V4 does not add another assistant, persona, inbox or execution surface. The improvement is under the hood: existing specialist engines are connected into one governed sales journey.

## Principle: Prepare, Don't Spam

Nexus may autonomously perform reversible internal preparation when data and policy allow it. It must not silently turn internal preparation into customer outreach.

- Buyer Profile enrichment: internal only.
- Property matching: internal only.
- Shortlist preparation: internal only.
- Quality review / presentation preparation: internal only.
- Customer-message draft: may be prepared, but customer send remains behind the existing review / preflight / approval boundary.
- Price, offer, contract and closing commitments remain human-governed.

## Canonical real-estate journey

```text
CRM / Revenue Memory
  -> Revenue priority
  -> Nexus Business Opportunity
  -> Nexus Growth Mission
  -> Agentic action class
  -> specialist preparer
  -> existing Sales Autopilot workers
  -> review / preflight
  -> governed customer communication
```

### Stage integrity

V4 makes `MATCHING` and `RESERVED` first-class real-estate stages across the Nexus opportunity path.

- `MATCHING` -> `property_matching` -> consideration -> `sales_sdr` -> `advance_stage` -> `prepare` -> action class `match`.
- `RESERVED` -> `reserved` -> delivery -> `customer_success` -> `deliver` -> approval-governed scheduling / closing support.

This prevents advanced buyers from disappearing from the sales priority feed or being misclassified as new leads.

## Matching handoff

When a HIGH/CRITICAL property-matching mission reaches `awaiting_preparation`, Mission Autopilot now routes it to the dedicated real-estate matching preparer rather than the customer-message preparer.

The matching preparer:

1. Resolves the mission back to the verified CRM contact.
2. Fresh-reads the contact and blocks DNC / suppressed / terminal customers.
3. Requires the latest **approved Buyer Profile**.
4. Evaluates existing Buyer Profile Health.
5. Fails closed on health status `BLOCKED`.
6. Creates one deterministic, idempotent CRM `work_item` linked to the approved profile.
7. Marks it as `classification=property_interest` and already profile-linked so the Buyer Profile worker does not reinterpret it.
8. Hands the work item to the existing Property Match Autopilot.
9. Existing matching -> shortlist -> review -> presentation -> send-preflight workers continue the chain.

No Buyer Profile criteria are changed, no pipeline stage is changed and no customer message is sent by this handoff.

## Health boundary

`BLOCKED` Buyer Profiles cannot enter automatic matching. Examples include missing approved budget, missing approved location or conflicting active criteria.

`NEEDS_ATTENTION` profiles may enter internal matching when the remaining issues are warnings rather than blockers. The reason is that matching remains an internal draft/review process; shortlist quality review still controls what may become client-ready.

## Idempotency

The matching work item uses a deterministic source id:

`nexus-matching:<missionId>:<buyerProfileId>:v<version>`

Retries reuse the same work item / prepared run instead of creating duplicate matching jobs.

## Existing safety gates remain authoritative

V4 intentionally reuses existing RealtyFlow components instead of creating a parallel executor:

- Nexus Agentic policy engine
- Mission Autopilot
- Buyer Profile Health
- Property Match Autopilot
- Shortlist Autopilot
- shortlist quality review
- presentation preparation
- send preflight
- approval / execution boundaries

## Acceptance criteria

V4 is acceptable only when:

- MATCHING and RESERVED preserve their real pipeline semantics.
- A MATCHING mission gets action class `match`, not generic `draft`.
- Match preparation requires an approved, non-blocked Buyer Profile.
- One matching mission/profile version cannot create duplicate work items.
- The generated work item is consumable by the existing Property Match Autopilot.
- Buyer Profile Sync skips reinterpretation of the generated work item.
- No customer send, CRM criteria mutation, Buyer Profile mutation or pipeline mutation is possible in the matching-preparation endpoint.
- Existing shortlist/review/preflight gates remain in the downstream path.

## Next high-value expansions

After V4 is production-stable, the best next upgrades are:

1. **Delta Matching** — rank only new or materially better homes versus the last reviewed/sent shortlist.
2. **No-match Coach** — show which approved criteria are constraining inventory, but never loosen criteria automatically.
3. **Viewing Coach** — turn viewing feedback into objections/taste signals and rerank inventory; approved criteria remain primary.
4. **Closer Brief** — prepare one decision/objection brief for NEGOTIATION; price/offer/contract actions remain human-required.
5. **One Mission Card** — combine movement cause, profile health, match health, expected value and exact next action into one operator-facing Nexus recommendation.
6. **Outcome Learning** — learn which governed actions actually move each segment from QUALIFIED -> MATCHING -> VIEWING -> NEGOTIATION -> RESERVED without weakening safety gates.
