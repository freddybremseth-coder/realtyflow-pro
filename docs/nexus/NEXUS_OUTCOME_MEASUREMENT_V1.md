# Nexus Outcome Measurement v1

## Purpose

Outcome Measurement gives Nexus a factual learning loop from commercial recommendations to observable results without allowing performance data to change safety policy.

The loop is:

`recommendation -> observed customer/business event -> attribution -> aggregate learning`

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

The daily dedupe key prevents an unchanged recommendation from being counted repeatedly while still allowing new recommendations to enter the measurement set during the day.

## Outcomes

V1 attributes already-observed `revenue_events` to a recommendation when they belong to the same contact, happen after the recommendation and fall inside the configured attribution window.

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

- recommendation count and overall outcome rate;
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

It may later influence ranking, timing, wording, channel choice and which governed action Nexus recommends. It must never:

- convert `HUMAN_REQUIRED` to `AUTO_SAFE`;
- execute a `DRAFT_ONLY` action;
- override `FORBIDDEN`;
- loosen the Action Policy Registry because a historically risky action had strong conversion.

Policy is the control plane. Outcome data is the learning plane.

## Next step

Add a learning-policy layer that uses statistically meaningful outcome history to adjust Revenue Brain ranking and timing while preserving the Action Policy Registry unchanged. Then expose the strongest evidence in the Executive Briefing so Freddy can see what Nexus changed and why.
