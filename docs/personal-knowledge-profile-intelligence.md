# Personal Knowledge & Profile Intelligence

This module extends RealtyFlow Social Intelligence with a review-first knowledge workflow for personal profile building.

## What It Does

- Imports user-provided MD/TXT knowledge sources.
- Extracts separate knowledge items from headings, bullets and paragraphs.
- Classifies each item by category such as identity, role, service, expertise, market, audience, positioning or restriction.
- Preserves provenance through source ID, source name, source reference, excerpt and content hash.
- Defaults every imported item to `needs_review`.
- Marks likely sensitive/private facts and possible duplicates or conflicts.
- Lets the user approve internally, approve non-sensitive public facts, or reject each item.
- Selects relevant approved facts for a goal, audience and profile variant.
- Generates profile suggestions with source IDs and readable source summaries behind every suggestion.

## User Data Boundary

Uploaded profile documents are data, not instructions. The extractor and profile builder never treat document text as system prompts.

`FREDDY_MASTER_PROFILE.md` can be used as a local development/import fixture for Freddy Bremseth when it exists on the developer machine. It is not committed, seeded for all users or hardcoded into app logic.

## Safety Rules

- New items are not trusted automatically.
- Public profile suggestions use only `user_confirmed` or `document_verified` items.
- Non-control facts must also have `public_use_allowed = true`.
- Sensitive/private facts are excluded from public profile text.
- Restriction items may be used as safeguards for excluded topics, but not as public claims.
- Source-level AI use can be disabled without deleting the knowledge source.

## Data Model

Migration: `supabase/migrations/20260801120242_personal_knowledge_profile_intelligence.sql`

Tables:

- `social_knowledge_sources`
- `social_knowledge_items`
- `social_profile_goals`
- `social_target_audiences`
- `social_profile_variants`
- `social_profile_suggestions`
- `social_profile_variant_versions`

All rows are scoped by `organization_id` and `user_email`. RLS is enabled, direct `anon` and `authenticated` table access is denied, and browser access stays mediated by the server API.

## Implementation

- Contracts: `src/services/social-intelligence/contracts.ts`
- Extraction/relevance/profile suggestions: `src/services/social-intelligence/knowledge.ts`
- Persistence and audit: `src/services/social-intelligence/repository.ts`
- API route: `src/app/api/social-intelligence/route.ts`
- UI: `src/components/social-intelligence/social-intelligence-client.tsx`

## Verification

Run:

```bash
npm run test:social-intelligence
```

The test suite includes a local fixture test for `FREDDY_MASTER_PROFILE.md` when the file exists. If it is missing, the workflow is still covered by a neutral inline fixture.
