# Nexus multi-business pipeline architecture

## Principle

Nexus is one operating system across the portfolio, but it must not force every business into one sales funnel.

A property buyer, a book reader, an AI prospect and an advisory client have different journeys, signals, economics, actions and definitions of success.

The architecture therefore separates:

1. **Nexus lifecycle phase** — a small cross-business comparison layer used for portfolio prioritization.
2. **Business pipeline** — the domain-specific stages, signals and next actions for one business model.
3. **Brand binding** — which business pipeline a brand normally feeds.
4. **Offer routing** — future layer for umbrella brands or brands with multiple commercial offers.

## Shared lifecycle phases

`awareness → engagement → qualification → consideration → conversion → delivery → retention`

These phases are only for comparison and portfolio-level orchestration. They must never replace the domain stages shown to the user.

## Canonical business pipelines

### Real estate sales

Typical journey:

`new_lead → qualified_buyer → property_matching → viewing → negotiation → reserved → completed`

Primary success: reservation / completed property purchase.

### Publishing

Typical journey:

`discovered → sample_engaged → purchase_intent → purchased → reader_retention`

Primary success: book sale, catalog purchase and long-term reader value.

### AI products & services

Typical journey:

`new_lead → qualified → discovery → demo_or_solution → proposal_or_pilot → won → expand`

Primary success: subscription, project, pilot or product purchase.

### Expert advisory

Typical journey:

`inquiry → fit_check → discovery_call → scope_defined → proposal → booked → completed`

Primary success: booked and delivered advisory engagement.

### Product commerce

Typical journey:

`discovered → product_interest → purchase_intent → purchased → repeat_customer`

Primary success: product purchase and repeat customer value.

### Creator & media

Typical journey:

`discovered → engaged → subscribed → returning`

Primary success: viewer/follower/subscriber and returning audience. This is explicitly not treated as a traditional sales pipeline.

## Current brand bindings

- Zen Eco Homes → Real estate sales
- Pinoso EcoLife → Real estate sales
- Freddy Publishing → Publishing
- ChatGenius.pro → AI products & services
- Freddy AI Products → AI products & services
- Freddy Bremseth professional → Expert advisory as its primary commercial pipeline, but with **umbrella** role
- Doña Anna → Product commerce
- Re-Master Freddy → Creator & media

## Umbrella-brand rule

Freddy Bremseth professional is not a catch-all sales funnel.

Content or leads originating from the professional umbrella must eventually route by the actual offer:

- book intent → Publishing
- RealtyFlow / Nexus / AI-product intent → AI products & services
- advisory intent → Expert advisory
- property intent → the relevant real-estate business

This offer-routing layer should be added before Nexus starts making autonomous cross-business commercial decisions.

## Nexus Today and Inbox

Nexus Today and Nexus Inbox may rank work across businesses, but each item must retain:

- business pipeline id
- brand / offer context
- domain stage
- shared lifecycle phase
- business-specific reason
- business-specific next action
- business-specific value/impact model

Portfolio ranking may compare urgency and expected impact, but it must not compare a €500,000 property transaction directly with a €10 book sale using raw transaction value alone.

## Next implementation steps

1. Add offer routing for umbrella/multi-offer brands.
2. Make Today/Inbox actions carry business pipeline context.
3. Split scoring/Next Best Action by business model.
4. Add business-specific pipeline views and KPIs.
5. Only then allow cross-business portfolio prioritization and learning.
