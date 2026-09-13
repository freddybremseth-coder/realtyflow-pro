# Nexus Outcome Measurement v1

## Purpose

Outcome Measurement gives Nexus a factual learning loop from commercial recommendations to observable results without allowing performance data to change safety policy.

The loop is:

`recommendation -> human-confirmed execution -> observed customer/business event -> attribution -> aggregate learning`

## Recommendation snapshots

`/api/cron/nexus-outcome-snapshot` runs hourly and builds the current Revenue Brain from CRM, Buyer Profiles, shortlists, presentations and customer-message drafts.

Each ranked recommendation is written idempotently to `revenue_events` as `automation_recommended` with:

- recommendation id and rank;
- opportunity score;
- expected commercial value as metadata, not realized revenue;
- governed Nexus action type;
- policy class and policy reason;
- Revenue Brain source and target link;
- explicit `measurement_only=true` marker.

The daily write dedupe key prevents duplicate snapshots during a day. Measurement also collapses recurring snapshots by stable recommendation id, so an unchanged open action is one recommendation rather than a new sample every day.

## Execution evidence

Opening a work surface is not treated as execution. An administrator must explicitly use **Bekreft utført** after completing the recommended work. The admin-only feedback endpoint writes an idempotent `automation_executed` event containing:

- stable `recommendation_id` and source id;
- the originating recommendation event id;
- governed action type and policy class;
- `execution_evidence=human_confirmed`;
- `feedback_contract=executed_action_v1`;
- an explicit marker that this was not automatic execution.

`FORBIDDEN` and `WAIT` recommendations cannot receive execution feedback. The feedback endpoint records evidence only; it never performs the recommended customer, pipeline, publishing or financial side effect.

## Outcomes

V1 attributes already-observed `revenue_events` only after linked execution evidence. Explicit `metadata.recommendation_id` linkage wins. Otherwise an outcome is owned by the most recently executed eligible recommendation for the same contact and brand inside the configured window. One outcome can never be credited to more than one recommendation.

Measured signals include:

- inbound email/reply activity;
- positive or negative property feedback;
- meetings and viewings;
- offers;
- won/lost deals;
- paid commission.

The engine records the first observable outcome, strongest downstream outcome, time to first outcome and realized revenue impact already present on the downstream event.

## Read model

`GET /api/nexus/outcome-measurement` is admin-only and returns:

- recommendation count, execution count and execution rate;
- outcome rate among executed recommendations;
- reply, viewing, offer and win rates;
- realized revenue impact;
- median time to first outcome;
- the same measures grouped by governed action type;
- recommendation-level attribution details.

Query parameters:

- `days` — source-event lookback, 7-365 days, default 90;
- `attributionDays` — attribution window, 1-90 days, default 30.

## Safety boundary

Outcome Measurement is observational only.

Unexecuted recommendations remain visible for execution-rate measurement, but they do not enter the learning sample and are not treated as failures.

It may later influence ranking, timing, wording, channel choice and which governed action Nexus recommends. It must never:

- convert `HUMAN_REQUIRED` to `AUTO_SAFE`;
- execute a `DRAFT_ONLY` action;
- override `FORBIDDEN`;
- loosen the Action Policy Registry because a historically risky action had strong conversion.

Policy is the control plane. Outcome data is the learning plane.
