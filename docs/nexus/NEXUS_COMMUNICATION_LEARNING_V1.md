# Nexus Communication Learning v1

## Goal
Use observed communication outcomes to recommend better timing and message strategy without changing Action Policy Registry permissions or enabling customer-side effects.

## Learning dimensions
- brand
- tone
- language
- intent
- UTC send-hour bucket
- UTC weekday
- message-length bucket

## Evidence floors
- fewer than 5 sends: insufficient, observation only
- 5-9 sends: limited evidence, observation only
- 10-24 sends: moderate evidence, bounded prefer/avoid recommendations allowed
- 25+ sends: strong evidence

## Guardrails
- learning is observational and advisory
- no customer send, approval, booking, CRM mutation or policy mutation
- `HUMAN_REQUIRED`, `DRAFT_ONLY`, `WAIT`, `FORBIDDEN`, and `AUTO_SAFE` remain controlled only by Action Policy Registry
- timing or strategy recommendations never override suppression, DNC, sender, preflight, or explicit approval requirements
- timing authority is recommendation-only in v1

## Output
For each brand and dimension/value, store sample size, reply rate, average edit ratio, evidence strength, verdict and finding in `nexus_communication_learning_rules`.

New dimensions in v1:
- `send_hour_utc`: `00-05`, `06-09`, `10-13`, `14-17`, `18-21`, `22-23`
- `weekday_utc`: `sun` through `sat`
- `message_length`: `short`, `medium`, `long`

Message length buckets:
- short: 0-280 characters
- medium: 281-900 characters
- long: 901+ characters

The admin learning API returns timing recommendations separately from content recommendations so future schedulers can consume timing evidence without accidentally treating it as draft-writing guidance.
