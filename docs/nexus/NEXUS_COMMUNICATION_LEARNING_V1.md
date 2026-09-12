# Nexus Communication Learning v1

## Goal
Use observed communication outcomes to recommend better timing and message strategy without changing Action Policy Registry permissions or enabling customer-side effects.

## Learning dimensions
- brand
- tone
- language
- intent
- UTC send hour
- weekday
- message length bucket

## Evidence floors
- fewer than 8 sends: insufficient, no recommendation
- 8-24 sends: emerging evidence
- 25+ sends: established evidence

## Guardrails
- learning is observational and advisory
- no customer send, approval, booking, CRM mutation or policy mutation
- `HUMAN_REQUIRED`, `DRAFT_ONLY`, `WAIT`, `FORBIDDEN`, and `AUTO_SAFE` remain controlled only by Action Policy Registry
- timing or strategy recommendations must never override suppression, DNC, sender, preflight, or explicit approval requirements

## Output
For each brand and dimension/value, store sample size, reply rate, average edit ratio, evidence strength, verdict and finding in `nexus_communication_learning_rules`.

Recommended dimensions added in v1:
- `send_hour_utc`
- `weekday_utc`
- `message_length`

Message length buckets:
- short: < 450 characters
- medium: 450-1199 characters
- long: 1200+ characters

This gives Nexus a bounded basis for later deciding when to draft or recommend communication, while preserving all existing execution boundaries.
