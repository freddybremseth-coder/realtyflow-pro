# Lead Intelligence Property Matching Core

Status: PR 4A foundation only.

This document describes the first deterministic property-matching core for Lead Intelligence.

## Scope

Included:

- raw property row normalization into bounded Lead Intelligence facts
- configurable purchase-cost estimation for buyer budgets that include costs
- deterministic hard-requirement evaluation
- deterministic exclusion evaluation
- deterministic weighted preference scoring
- data-quality and verification warnings
- stable ranking helper
- unit tests with the Emmadale buyer-profile shape

Not included:

- production SQL
- schema migration
- API route
- UI
- database reads or writes
- property shortlist persistence
- presentation or email draft creation
- email, WhatsApp, SMS, or any customer communication
- AI-generated match scoring
- automatic contact, lead, or CRM updates

## Safety Model

The match core does not let an LLM decide eligibility or score. It uses deterministic rules first:

1. check hard requirements
2. calculate budget result
3. apply exclusions
4. score weighted preferences
5. penalize unknown or low-quality data
6. return traceable reasons, concerns, and questions to verify

Unknown facts are never treated as satisfied. For example:

- unknown lift does not satisfy a lift requirement
- unknown future building risk remains a question to verify
- missing purchase price or estimated total cost does not pass budget matching

Verified, unverified, inferred, and unknown property facts stay separate in the output.

## Budget Assumptions

The default cost profile is intentionally configurable:

- resale tax: `10%`
- new-build tax: `10%`
- professional fees: `3%`
- safety margin: `2%`

When a buyer budget includes costs and no explicit total cost is available, the service estimates total cost from purchase price and marks the result as an estimate. This is not legal, financial, or tax advice.

## Normalized Facts

The first normalizer maps common existing RealtyFlow property fields into canonical Lead Intelligence fact keys, including:

- `property_type`
- `purchase_price`
- `estimated_total_cost`
- `bedrooms`
- `bathrooms`
- `location`
- `terrace_area_m2`
- `has_lift`
- `parking`
- `pool`
- `living_area_m2`
- `plot_area_m2`
- `floor_position`
- `new_build_or_resale`
- `view_quality`
- `future_building_risk`

Facts inferred from text are marked `inferred`; missing facts are marked `unknown`.

## Next PR

The next property-matching PR should add a protected, feature-flagged server route that reads approved buyer profiles and a bounded set of properties, runs this core, and returns preview-only match results.

It should still avoid:

- persistence of matches
- shortlist creation
- email drafts
- customer communication
- automatic CRM updates
