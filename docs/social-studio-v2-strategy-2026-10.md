# RealtyFlow SoMe Studio v2 — strategy and implementation plan

Date: 2026-10-07
Status: Locked product direction for ZenEcoHomes first, reusable per brand.

## Product goal

SoMe Studio must stop behaving like a property-caption generator and become a brand/content engine:
- varied editorial mix,
- three genuinely different concepts,
- different visual assets per concept,
- clear local feedback next to the action that triggered it,
- draft-first workflow into Content Hub,
- later multi-image/carousel publishing.

The current property-only bias is intentionally reduced for ZenEcoHomes for the next strategy period.

## ZenEcoHomes temporary content mix

Strategy period: 90 days, then review using engagement, saves, profile visits, website sessions, qualified leads and assisted conversions.

Hard rule:
- Pure property presentations: maximum 20% of published feed posts during the rolling strategy window.
- 20% is a ceiling, not a quota. During the trust-building period, the working target is normally 15–20%.
- Default cadence guard: after one pure property feed post, recommend at least four non-property feed posts before the next pure property presentation. Manual campaign override remains possible.

Recommended target mix:
- 15–20% property / selected listings
- 25% area + lifestyle
- 20% guides + buyer competence
- 15% market insight + advisor analysis
- 10% people / advisor / behind the scenes
- 10–15% proof / process / client journey / FAQ

The 20% property number is a strategic cap for the trust-building period, not a universal social-platform algorithm rule.

### Mix guard

SoMe Studio should inspect recent published content before recommending the next post.
Recommended implementation:
- classify every draft/publication with `content_features.social_category`
- categories: `property`, `area_lifestyle`, `guide_competence`, `market_insight`, `people_advisor`, `proof_process`
- use a rolling last-30-published-post window, with a 90-day strategy override
- if property share is >=20%, property is no longer shown as the primary recommended next post
- if the most recent feed post was a pure property presentation, the next four recommendations should prefer non-property categories
- property creation remains available manually; the system should guide, not silently block
- recommendation card should explain: “Property share is already 20% in the current mix. Recommended next: area/lifestyle or guide.”

## 1. UX feedback rules

Global top-of-studio alerts should be reserved for workspace-level/fatal errors only.

Action feedback must render locally:
- Generate button:
  - loading directly below button
  - success directly below button
  - generation error directly below button
  - optional “Go to results” action
- Preview button:
  - render/fallback/error message inside that concept card, below preview button
- Facebook save:
  - success/error directly below Facebook save button
  - direct “Open this draft in Content Hub”
- Instagram save:
  - same local behavior
- Content Hub handoff:
  - direct deep-link to exact publication id
  - Content Hub opens Drafts, scrolls to and highlights the saved draft

Mobile:
- one concept card at a time in horizontal snap/swipe
- secondary sections collapsed by default
- result header stays compact
- no requirement to scroll back to top to understand state

Desktop:
- three columns can remain
- local action feedback still applies

## 2. Three concepts must be genuinely different

The current rule “three rewrites” is forbidden. The three concepts differ in:
- editorial goal
- audience motivation
- visual asset
- composition/layout
- CTA
- copy structure

### Concept A — Editorial / Premium
Goal: desirability, architecture, quality, exclusivity.
Default visual:
- strongest hero/property image
- single-image premium composition
Copy:
- concise
- design/quality/location/value
CTA:
- view property / ask for details

### Concept B — Lifestyle / Story
Goal: sell the life around the property rather than the listing itself.
Default visual:
- a different gallery image than Concept A
- prioritize terrace, pool, view, street/beach, social setting or area context
Copy:
- narrative/day-in-the-life
- lower sales pressure
CTA:
- discover the area / imagine daily life / read more

### Concept C — Advisor / Insight
Goal: build trust and competence.
Default visual:
- third distinct image OR 3-image collage
- optional information card/fact-led composition
Copy:
- buyer decision support
- suitability, trade-offs, value, ownership/use case
CTA:
- speak with advisor / read guide / compare options

### Visual diversity rule

For a property source, the three concepts should not default to the same image if at least three usable images exist.

Image selector:
1. collect primary_image + gallery
2. remove duplicates / near-duplicates where possible
3. Concept A gets hero
4. Concept B gets the best lifestyle/context image not used by A
5. Concept C gets a third distinct image or collage
6. if insufficient assets, reuse is allowed but layout must differ visibly

Future enhancement:
- add vision-based image labels/scores: exterior, interior, terrace, pool, view, kitchen, bedroom, area/lifestyle, detail
- persist scores so RealtyFlow learns property-media quality once rather than re-analyzing every post

## 3. Collage format

Add visual format selector per concept:
- Single image
- Professional property card
- 3-image collage
- Later: Carousel / multi-image

### 3-image collage v1

Primary feed format:
- 1080 × 1350, 4:5

Default layout:
- one large hero panel
- two smaller supporting panels
- safe internal gutters
- minimal/no text over important visual areas
- discreet brand mark only

Alternative layouts:
- equal triptych
- vertical hero + two stacked support images
- editorial moodboard

Selection:
- image 1 = hero
- image 2 = lifestyle/detail
- image 3 = complementary room/view/area

Rendering:
- still-image compositing should move toward a serverless-friendly image compositor (prefer Sharp for collage/layout work)
- FFmpeg can remain for video/reel workflows
- every rendered asset must be registered in media_assets with property_id, brand_id, provider, format, concept, source image ids/urls and publication relation when saved

Fallback:
- collage failure never blocks saving
- fall back to a single approved property image and show the fallback locally

## 4. Multi-image / carousel support

Do not store multi-image posts as an opaque array only in UI state.

Existing RealtyFlow structure already supports the right direction:
- `content_publications.thumbnail_url` remains cover/legacy preview
- `media_assets.content_hub_publication_id` provides one-to-many publication assets
- `media_assets.metadata_json` can initially hold:
  - `carousel_index`
  - `role` (cover, detail, lifestyle, area, advisor)
  - `source_property_id`
  - `source_url`
  - `concept_id`
  - `visual_format`

Implementation v1:
- save draft publication first
- attach 2–10 approved media_assets to the publication
- mark one as cover and mirror it to thumbnail_url
- Content Hub displays/reorders assets
- channel adapter validates platform limits at publish time

Later:
- Instagram carousel adapter
- Facebook multi-image/carousel adapter
- channel-specific ordering/crops
- carousel-specific copy/slide captions if needed

## 5. Content recommendation engine

SoMe Studio home should answer: “What should we publish next?”

Inputs:
- rolling published mix
- last shared date per guide/article/area/property
- property freshness
- audience/engagement performance
- brand strategy targets
- duplicate-topic cooldown
- manual campaigns/priority

Recommended UI:
- “Recommended next”
- category
- reason
- source/content suggestion
- one-click “Create 3 concepts”

Examples:
- “Area/lifestyle is underrepresented: 17% vs target 30%.”
- “You have published 6 property posts in the last 20 posts. Choose guide or area content next.”
- “This guide has not been shared in 74 days and matches current property interest in Finestrat.”

## 6. Data contract

Add to `content_publications.content_features`:
- `social_category`
- `concept_id`
- `visual_format`
- `source_property_id`
- `source_content_id`
- `source_area_id`
- `strategy_period_id`
- `strategy_recommendation_reason`
- `is_property_presentation`

Use existing tags only as secondary/search metadata, not as the sole analytics contract.

For assets, use `media_assets.content_hub_publication_id` and metadata_json fields described above.

## 7. Implementation priority

### P0 — current production correctness
- exact property-image approval against source property + brand visibility
- action feedback next to generate/preview/save
- preserve direct Content Hub deep-link
- no false IMAGE_NOT_APPROVED_FOR_BRAND

### P1 — strategy + visual differentiation
- ZenEco 90-day strategy profile with max 20% pure property
- social category on every generated/saved draft
- rolling mix dashboard/recommendation
- distinct image selection for all three concepts
- concept-specific prompts and CTAs

### P2 — collage
- 3-image collage renderer
- visual-format selector
- register rendered collage as media_asset
- fallback path
- preview inside concept card

### P3 — multi-image drafts
- attach ordered media_assets to content_publications
- Content Hub multi-image preview + reorder
- preserve cover in thumbnail_url

### P4 — publishing adapters
- Instagram carousel
- Facebook multi-image/carousel
- per-channel validation/crops

### P5 — learning
- measure results by social_category, concept_id and visual_format
- learn which concept/visual format performs best by brand and channel
- recommendations use observed performance without violating the strategic mix guard

## Acceptance criteria

SoMe Studio v2 is accepted when:
1. no success/error message requires scrolling to the top to understand the last action;
2. the three concepts visibly differ even before reading the copy;
3. three property images are used when at least three suitable images exist;
4. collage can be selected and previewed without blocking saving if rendering fails;
5. a saved post opens directly in Content Hub;
6. Content Hub can represent multiple ordered assets for one draft;
7. ZenEco’s recommendation engine keeps pure property recommendations at or below a 20% rolling share during the strategy period;
8. operators can override recommendations deliberately, with the reason visible;
9. analytics can compare category × concept × visual format × channel.
