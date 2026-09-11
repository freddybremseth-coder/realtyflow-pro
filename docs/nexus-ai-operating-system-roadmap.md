# Nexus AI Operating System Roadmap

Status: locked product direction for RealtyFlow Pro / Nexus OS.

## Product thesis

RealtyFlow should not stop at task automation. Nexus should understand the commercial goal, rank the next best actions, execute low-risk actions inside explicit policies, measure the outcome, and continuously improve the strategy. Human judgment remains mandatory where ambiguity, legal/commercial commitment, customer trust, or irreversible side effects are involved.

## North-star outcome

Every active customer, lead, property opportunity, campaign and operational task should continuously answer four questions:

1. What is the highest-value next action?
2. Can Nexus safely execute it now?
3. What result did the action create?
4. What should Nexus change next time?

The target experience is an AI-operated sales organization with human leadership, not an AI chatbot attached to a CRM.

## Phase 1 — Revenue Brain and decision layer

### 1. Revenue Brain
Create one ranking layer across CRM follow-up, closing, approvals, commissions, recovery, service revenue and later marketing. Rank work by expected value, urgency, probability of progress, customer intent and risk.

Initial safety rule: Revenue Brain is read-only. It recommends and explains; it cannot send, approve, mutate pipeline state or change customer criteria.

Success metrics:
- top-10 actions explainable and deduplicated by customer
- time-to-first-action on hot opportunities
- revenue influenced by top-ranked actions
- percentage of ranked actions later completed or dismissed

### 2. Next Best Action policy registry
Every suggested action receives a policy class:
- `AUTO_SAFE`: reversible, explicitly authorized and fully testable
- `DRAFT_ONLY`: Nexus prepares the work, human approves the side effect
- `HUMAN_REQUIRED`: judgment, negotiation, ambiguity or irreversible action
- `WAIT`: no action is currently better than waiting

No action becomes autonomous merely because the model is confident. Autonomy requires an explicit policy.

## Phase 2 — Digital Sales Twin

Build a living, versioned customer intelligence model from customer-provided evidence and observed behavior:
- current search criteria
- accepted/rejected properties and reasons
- budget confidence and flexibility
- preferred areas and trade-offs
- buying horizon and readiness
- objections and unresolved questions
- communication preferences and response cadence
- engagement signals
- confidence and evidence for every inferred field

Important: inferred preferences must remain distinguishable from explicit customer-confirmed facts.

## Phase 3 — Behavioral and event-driven selling

Replace fixed follow-up timing with event-aware decisions where data exists:
- reply arrived
- property opened/clicked repeatedly
- customer ignored repeated property suggestions
- viewing requested or completed
- criteria changed
- no-match condition detected
- customer became inactive or reactivated

The system should change strategy when behavior shows the current strategy is not working.

## Phase 4 — Property Intelligence Agent

Extend matching beyond basic filters. Build structured property intelligence for:
- layout and floor-plan characteristics
- orientation and likely light exposure when sourced
- floor, lift, accessibility and outdoor space
- plot characteristics
- distance/context facts with source confidence
- data quality and freshness
- trade-offs for the specific buyer
- reasons a property should not be sent

The output should explain why a property fits this buyer, not merely why it passes filters.

## Phase 5 — Sales Coach and negotiation intelligence

Before calls, meetings and negotiations, Nexus should prepare a short decision brief:
- customer objective
- latest interaction
- strongest buying signals
- likely objections
- unanswered questions
- recommended next move
- relevant properties or alternatives
- commercial exposure and commission context

Negotiation support remains advisory. Nexus must not create binding commitments or guarantees autonomously.

## Phase 6 — Experiment and learning engine

Measure actual outcomes of controlled variants:
- subject line
- send time
- CTA
- message length
- number of property suggestions
- presentation structure
- follow-up interval
- content angle

Optimization target is not opens alone. Prefer downstream outcomes: reply, qualified conversation, viewing, offer, sale and retained customer trust.

Use holdouts and minimum sample thresholds. Never let low-volume noise rewrite global policy.

## Phase 7 — Cross-brand intelligence

Nexus should understand opportunities across brands while preserving strict brand boundaries for identity, consent, sender, customer data and messaging.

Capabilities:
- detect when another business unit may better fit the need
- recommend internal handoff rather than silently switching brand
- reuse non-customer-specific content intelligence safely
- compare brand/channel performance
- avoid duplicate contact pressure from multiple brands

## Phase 8 — Explainable AI memory and correction loop

Every consequential recommendation should be traceable to evidence:
- what Nexus believed
- why it believed it
- which source supported it
- confidence
- what action was proposed
- what human correction was made
- what outcome followed

Human corrections should become structured feedback, not disappear in free-text notes.

## Phase 9 — Executive Autopilot

The daily Nexus briefing should report completed work and exceptions, not just dashboards:
- replies received and handled
- CRM/profile changes
- matches and shortlists prepared
- drafts prepared
- human decisions required
- failed/blocked automations
- top revenue actions for today
- experiments that improved or deteriorated
- pipeline risks and revenue exposure

## Phase 10 — Controlled autonomy expansion

Autonomy expands one policy at a time only after:
1. deterministic eligibility rules exist
2. suppression/consent/brand gates exist where relevant
3. idempotency exists
4. audit logging exists
5. a human escape hatch exists
6. regression tests exist
7. production metrics prove the automation is beneficial

## Delivery sequence

### Wave A — now
1. Revenue Brain v1: read-only ranking and explanation layer.
2. Send preflight after final presentation approval.
3. Decision policy registry (`AUTO_SAFE`, `DRAFT_ONLY`, `HUMAN_REQUIRED`, `WAIT`).
4. Outcome/event schema for measuring what happened after a recommendation.

### Wave B
5. Digital Sales Twin v1 built from existing CRM + Buyer Profile + interactions.
6. Event-driven next-best-action engine.
7. Property Intelligence evidence layer.

### Wave C
8. Sales Coach briefing.
9. Experiment engine with guardrails and holdouts.
10. Cross-brand opportunity detection.

### Wave D
11. Structured human correction feedback.
12. Executive Autopilot with outcome reporting.
13. Gradual expansion of autonomous policies based on measured safety and commercial value.

## Non-negotiable safety principles

- Customer-confirmed facts outrank model inference.
- Ambiguity routes to a human or a clarification question.
- Legal, contractual and price/availability guarantees are never invented.
- No hidden cross-brand identity switching.
- No automatic relaxation of buyer requirements without customer confirmation.
- No irreversible side effect without an explicit policy and idempotency protection.
- Every autonomous action must be auditable and attributable to Nexus.
- The system optimizes long-term sales quality and customer trust, not raw message volume.
