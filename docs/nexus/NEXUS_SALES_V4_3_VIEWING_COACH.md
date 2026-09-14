# Nexus Sales v4.3 — Viewing Coach

## Goal

Turn verified post-viewing feedback into useful sales progression without creating a second assistant, silently changing approved Buyer Profile criteria, moving pipeline stages, or sending customer communication automatically.

## Authoritative trigger

Viewing Coach only starts from canonical `revenue_events.event_type = viewing_completed`. A CRM stage of `VIEWING` is not proof that a viewing happened.

## Flow

1. A verified `viewing_completed` event is recorded.
2. Nexus Viewing Coach reads the event note and available property context.
3. Deterministic coaching classifies the feedback as positive, negative, mixed, or unclear and extracts supported reasons such as price, size, style, or location reaction.
4. If the feedback is suitable for learning, it is stored as a `property_feedback` CRM interaction with `secondary_ranking_only = true`.
5. Existing Customer Taste Profile logic may use repeated feedback for secondary ranking only. It never changes eligibility or overrides explicit Buyer Profile criteria.
6. If the viewing feedback is negative or mixed and the Buyer Profile is still approved and unchanged, Viewing Coach prepares the existing property-match chain for reranking.
7. If the customer states new explicit criteria, the Buyer Profile is marked review-required in the work metadata and matching is blocked until human review.
8. Strong purchase intent becomes a critical Nexus Inbox review with a recommendation to consider the next step toward `NEGOTIATION`; Nexus does not move the pipeline itself.
9. All Viewing Coach work is visible in the existing Nexus Inbox and opens the existing customer view.

## Safety contract

Viewing Coach must always preserve these boundaries:

- `buyer_profile_auto_mutation = false`
- `pipeline_auto_mutation = false`
- `customer_send = false`
- learned taste signals are secondary ranking only
- an approved Buyer Profile remains the primary eligibility contract
- explicit criteria changes require review before rematching
- no automatic price, offer, negotiation, contract, or closing commitment

## Idempotency

Each canonical viewing event uses a deterministic work source ID:

`<viewing_event_id>:viewing-coach`

The CRM interaction uses:

`viewing-coach-<viewing_event_id>`

This prevents duplicate coach work and duplicate taste evidence if the cron retries.

## Scheduling

The Viewing Coach cron runs at minutes `11,26,41,56`. This intentionally gives it time to store viewing feedback before a later Property Match Autopilot cycle can safely rerank the customer with the unchanged approved Buyer Profile.

## UI

Nexus Inbox gains one additional source: `viewing_coach`.

It distinguishes:

- critical high-intent post-viewing opportunities;
- Buyer Profile review required;
- safe reranking prepared;
- ordinary viewing follow-up;
- completed viewing with insufficient feedback.

No new visible assistant or separate operator console is introduced.
