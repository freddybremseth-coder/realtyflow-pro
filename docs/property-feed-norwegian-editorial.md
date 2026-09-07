# Property feed Norwegian editorial pipeline

## Goal

Generate stable, factual Norwegian property copy when feed data changes, without adding page-render latency or overwriting raw source facts.

## Flow

1. `/api/properties/import` fetches the XML feed after admin authentication and public-URL validation.
2. Full source descriptions and supported feed facts are extracted into `property_feed_source_cache` before the browser performs its existing chunked import.
3. `/api/properties` attaches cached source facts and upserts imported properties by unique `ref`, preserving the existing property UUID.
4. Feed inserts/updates queue `property_editorial_jobs` through a database trigger.
5. `/api/cron/property-editorial` processes small batches. Unchanged source hashes are reused without an AI call.
6. AI output is validated as structured JSON. If AI is unavailable or invalid, a deterministic factual Norwegian template is stored instead.
7. Generated copy is persisted in `editorial_no`, `title_no` and `description_no`. `editorial_no_approved` is reset to `false` whenever copy is regenerated.

## Stable source hash

The SHA-256 source hash covers the factual inputs that can change the generated copy: property type, bedrooms, bathrooms, location, built area, floor, supported amenities, EPC, price, raw source description and source orientation.

## Safety and editorial constraints

- No page-view AI calls.
- No source fact may be invented.
- No automatic superlatives such as `drømmebolig`, `unik`, `fantastisk`, `eksklusiv`, `spektakulær` or `perfekt`.
- Missing use/orientation information is stored as `Ikke angitt` rather than guessed.
- Raw source description is stored separately and is never replaced by generated copy.
- Feed import remains available if the additive source cache is temporarily unavailable.
- Repeated feed imports update the same property UUID instead of delete/reinsert.

## Retry

The worker processes up to six jobs per run. Failed jobs retry with exponential backoff up to five attempts. The Vercel cron invokes the worker every five minutes.
