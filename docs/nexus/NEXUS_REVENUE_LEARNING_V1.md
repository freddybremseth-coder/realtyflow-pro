# Nexus Revenue Learning v1

## Purpose

Revenue Learning turns the Outcome Measurement layer into a conservative ranking signal for Revenue Brain. It is deliberately separate from the Action Policy Registry.

The learning plane may influence which governed opportunity Nexus ranks first. It may not grant permission to execute an action.

## Daily learning profile

`/api/cron/nexus-revenue-learning` runs once per day and reads the previous 90 days of Nexus recommendation and outcome events.

It builds a versioned learning profile in `brand_settings` under `nexus-revenue-learning:v1`.

For every governed action type it records:

- number of measured recommendations;
- outcome rate;
- win rate;
- realized downstream revenue impact;
- evidence strength;
- bounded ranking adjustment;
- human-readable reason for the adjustment.

## Evidence floor

V1 requires at least 8 observations for an action type before learning may affect ranking.

Evidence is classified as:

- `insufficient` — below the sample floor, adjustment is always zero;
- `emerging` — sample floor reached but fewer than 25 observations;
- `established` — at least 25 observations.

This prevents a handful of lucky or unlucky cases from materially steering Revenue Brain.

## Ranking adjustment

The signal compares the action-type outcome rate with the system baseline and adds a smaller win-rate component. Evidence is scaled by sample size.

The final adjustment is always bounded to **-8 to +8 Revenue Brain points**.

The original score is retained as `baseOpportunityScore`, the learning contribution is exposed as `learningAdjustment`, and the final value remains explainable as `opportunityScore`.

## Safety boundary

Revenue Learning is ranking-only.

It cannot:

- modify the Action Policy Registry;
- change `HUMAN_REQUIRED`, `DRAFT_ONLY`, `WAIT` or `FORBIDDEN` permissions;
- convert an action to `AUTO_SAFE`;
- send a customer message;
- approve a shortlist or presentation;
- book a viewing;
- make a legal, contractual or financial commitment.

A stored learning profile that claims policy mutation or autonomy expansion is allowed is rejected by the parser and ignored.

## Runtime use

The hourly Nexus outcome snapshot loads the latest valid learning profile and passes it into Revenue Brain. Revenue Brain resolves the policy first and only then looks up the ranking signal for that governed action type.

This ordering is intentional: policy decides what the action is allowed to do; learning decides only how high it should rank among opportunities.

## Auditability

Revenue Brain output exposes when learning changed a score, the original score, final score and the historical evidence reason. Automation logs record whether a learning profile was loaded and how many ranked actions were adjusted.

## Next step

Once sufficient history exists, add time-of-day, channel and message-strategy learning as separate recommendation signals. Keep the same rules: minimum evidence, bounded adjustments, explicit explanations and no ability to broaden execution permissions.
