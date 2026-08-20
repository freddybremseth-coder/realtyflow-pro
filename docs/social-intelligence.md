# RealtyFlow Social Intelligence

`AI Personal Brand` is the first MVP slice of RealtyFlow Social Intelligence. It focuses on LinkedIn personal brand work without scraping or direct LinkedIn automation.

## Scope

- Manual LinkedIn profile intake by pasted/exported text.
- Brand Profile onboarding with role, market, services, expertise, audience, tone and goals.
- AI-assisted profile analysis with deterministic fallback when no AI key is configured.
- Profile Optimizer sections with approval/version history.
- Personal Knowledge & Profile Intelligence for uploaded MD/TXT knowledge sources, reviewable facts, profile goals, audiences and sourced profile variants.
- Skill, authority and content pillar suggestions.
- Content ideas, post drafts, quality scoring, manual calendar status and manual performance metrics.
- CRM attribution through `social_entity_links` instead of modifying existing CRM tables.

## Architecture

- UI route: `src/app/(content)/ai-personal-brand/page.tsx`
- Client experience: `src/components/social-intelligence/social-intelligence-client.tsx`
- API route: `src/app/api/social-intelligence/route.ts`
- Contracts: `src/services/social-intelligence/contracts.ts`
- AI and deterministic generation: `src/services/social-intelligence/analysis.ts`
- Personal knowledge extraction and profile building: `src/services/social-intelligence/knowledge.ts`
- Scoring formulas: `src/services/social-intelligence/scoring.ts`
- Persistence: `src/services/social-intelligence/repository.ts`
- Database migration: `supabase/migrations/20260801112121_social_intelligence_mvp.sql`
- Personal knowledge migration: `supabase/migrations/20260801120242_personal_knowledge_profile_intelligence.sql`

The API uses the existing RealtyFlow admin cookie/access model. GET requests require `marketing.read`; write actions require `marketing.write`.

## Data Model

The migration is additive and creates only `social_*` tables:

- `social_brand_profiles`
- `social_profile_imports`
- `social_profile_sections`
- `social_profile_versions`
- `social_skills`
- `social_content_pillars`
- `social_content_ideas`
- `social_posts`
- `social_post_versions`
- `social_post_metrics`
- `social_ai_recommendations`
- `social_entity_links`
- `social_audit_events`
- `social_knowledge_sources`
- `social_knowledge_items`
- `social_profile_goals`
- `social_target_audiences`
- `social_profile_variants`
- `social_profile_suggestions`
- `social_profile_variant_versions`

Rows are scoped by `organization_id` and `user_email`. Existing CRM records are linked by type/id strings in `social_entity_links` so the MVP does not require changes to CRM schema ownership boundaries.

## Personal Knowledge Workflow

The Knowledge tab accepts pasted text or MD/TXT files. Imported text is treated as user-uploaded data, not instructions. The extractor creates separate `social_knowledge_items`, classifies category, keeps `source_id`, `source_name`, `source_ref`, `source_excerpt` and `content_hash`, and sets every new item to `needs_review`.

Users can approve an item internally, approve a non-sensitive item for public profile use, or reject it. Potential duplicate and conflict markers are stored on the item so review decisions remain explicit. Sensitive items default away from public use, and the profile builder excludes them from public profile suggestions.

Data Sources let the user enable/disable AI use per source. Profile Builder stores a goal, target audience and variant, then selects only reviewed facts that match the variant. Suggestions store `source_knowledge_ids` and a readable `source_summary_json` so every profile proposal shows the sources behind it.

`FREDDY_MASTER_PROFILE.md` is only a local import fixture when present on the developer machine. It is not committed as seed data, not hardcoded in the application and not treated as system instructions.

## Security

- The browser never receives the Supabase service role key.
- All Social Intelligence tables have RLS enabled.
- Direct `anon` and `authenticated` table access is explicitly denied.
- Server-side code uses the existing service-role Supabase client and filters every read/write by `organization_id` and `user_email`.
- Raw profile imports are hashed with `sha256:v1:*` provenance and stored only after the user provides/pastes them.
- Knowledge imports are hashed and unchanged files are not reanalyzed.
- Private or sensitive knowledge is never used in public profile text by the deterministic profile builder.
- The module does not scrape LinkedIn and does not call LinkedIn APIs in MVP 1.

## AI Behavior

`analysis.ts` uses the shared `askClaude` wrapper and keeps a deterministic generator as fallback. Prompts instruct the model to treat pasted profile text as user-owned data, avoid invented facts, and return structured JSON. If parsing fails or no provider is configured, RealtyFlow still produces useful conservative suggestions locally.

The quality score is not a reach prediction. It evaluates structure, relevance, specificity, credibility, CTA, brand consistency and LinkedIn fit. Performance metrics are calculated only from manually entered impressions, engagement, clicks, leads and similar figures.

## Configuration

Required for persistence:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
REALTYFLOW_SESSION_SECRET=...
```

Optional:

```env
REALTYFLOW_SOCIAL_ORGANIZATION_ID=realtyflow
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

AI keys reuse the existing shared wrapper. Without them, deterministic analysis still works.

## Verification

Run the focused checks:

```bash
npm run test:social-intelligence
```

Full-project `tsc` currently reports unrelated pre-existing test type errors in lead-intelligence, saas demosites, constants tests and several revenue/remaster test files. The new module should remain free of Social Intelligence type errors.

## Future Phases

- Official LinkedIn integration through OAuth/API if approved and terms-compliant.
- Multi-platform support beyond LinkedIn.
- Network intelligence scoring with explicit imported data.
- Team-level comparisons after tenant/team membership is finalized.
- More granular recommendation lifecycle and approvals.

## Instagram Growth Intelligence

Instagram Business/Creator accounts connected through the existing Meta OAuth
flow now request `instagram_manage_insights`. The daily engagement tracker reads
the encrypted `social_channels` token and collects public media counters plus
available media Insights: views/plays, reach, impressions, shares, saves and
total interactions. Metrics remain linked to `content_publications` and are
stored in `engagement_snapshots`; extended metrics are retained in `raw_data`
without exposing OAuth tokens to the browser.

Existing Instagram connections must be reconnected once so Meta can grant the
new Insights permission. The application can pin a supported Graph API version
with `META_GRAPH_API_VERSION`; the existing integration version remains the
fallback until the wider Meta integration is upgraded together.

Phase 2 adds a closed learning loop in `/analytics` → `Instagram Growth`:

- Latest-snapshot semantics prevent cumulative Meta counters from being added repeatedly.
- A business-value score weights shares, saves and attributed leads above vanity metrics.
- Every publication gets a reproducible `utm_content=<publication_id>` tracking link.
- Public lead intake preserves UTM source, campaign and content on the CRM interaction.
- Content is classified by area, format, language, hook, goal and property type.
- Pattern insights require at least five posts; small groups are labelled directional.
- Winning variants create a Content Hub draft and a measurable growth experiment.
- Automatic Instagram results are mirrored into AI Personal Brand metrics when the
  publication is linked through `source_social_post_id`.

Optional configuration:

```env
NEXT_PUBLIC_SOCIAL_LEAD_URL=https://example.com/contact
META_GRAPH_API_VERSION=v25.0
```
