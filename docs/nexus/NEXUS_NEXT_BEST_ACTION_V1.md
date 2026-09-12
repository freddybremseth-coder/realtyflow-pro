# Nexus Next Best Action v1

## Goal
Turn Revenue Brain ranking and communication learning into one advisory next-best-action payload without expanding autonomous permissions.

## What the endpoint does
`GET /api/nexus/next-best-action` builds the current Revenue Command Center, ranks actions with Revenue Brain and attaches evidence-backed communication advice for the action's CRM contact and brand.

The advice can include:
- preferred UTC send hour
- preferred UTC weekday
- preferred tone
- preferred language
- preferred intent
- preferred message-length bucket
- evidence-backed values to avoid
- concise reasons from measured communication outcomes

## Evidence rules
Only active `prefer` / `avoid` rules with at least moderate evidence and at least 10 observations are eligible. Strong evidence is preferred over moderate evidence, then higher reply rate and larger sample.

Rules are isolated by brand. Learning from ZenEco must not leak into Soleada or another brand.

## Safety boundary
Communication learning is recommendation-only.

It cannot:
- send an email
- approve a shortlist or presentation
- book a viewing
- change CRM state
- relax buyer criteria
- change Action Policy Registry policy
- turn `HUMAN_REQUIRED`, `DRAFT_ONLY`, `WAIT` or `FORBIDDEN` into `AUTO_SAFE`

The Action Policy Registry remains authoritative. The endpoint explicitly returns `automaticSending: false` and `policyRegistryStillAuthoritative: true`.

## Relationship to Executive Briefing
This v1 creates the operational next-best-action API that Executive Briefing can consume. The next integration step is to surface the most relevant communication advice directly in the briefing UI without duplicating learning or policy logic.
