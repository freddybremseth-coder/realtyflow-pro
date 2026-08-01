# RealtyFlow Social Intelligence

`AI Personal Brand` is the first MVP slice of RealtyFlow Social Intelligence. It focuses on LinkedIn personal brand work without scraping or direct LinkedIn automation.

## Scope

- Manual LinkedIn profile intake by pasted/exported text.
- Brand Profile onboarding with role, market, services, expertise, audience, tone and goals.
- AI-assisted profile analysis with deterministic fallback when no AI key is configured.
- Profile Optimizer sections with approval/version history.
- Skill, authority and content pillar suggestions.
- Content ideas, post drafts, quality scoring, manual calendar status and manual performance metrics.
- CRM attribution through `social_entity_links` instead of modifying existing CRM tables.

## Architecture

- UI route: `src/app/(content)/ai-personal-brand/page.tsx`
- Client experience: `src/components/social-intelligence/social-intelligence-client.tsx`
- API route: `src/app/api/social-intelligence/route.ts`
- Contracts: `src/services/social-intelligence/contracts.ts`
- AI and deterministic generation: `src/services/social-intelligence/analysis.ts`
- Scoring formulas: `src/services/social-intelligence/scoring.ts`
- Persistence: `src/services/social-intelligence/repository.ts`
- Database migration: `supabase/migrations/20260801112121_social_intelligence_mvp.sql`

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

Rows are scoped by `organization_id` and `user_email`. Existing CRM records are linked by type/id strings in `social_entity_links` so the MVP does not require changes to CRM schema ownership boundaries.

## Security

- The browser never receives the Supabase service role key.
- All Social Intelligence tables have RLS enabled.
- Direct `anon` and `authenticated` table access is explicitly denied.
- Server-side code uses the existing service-role Supabase client and filters every read/write by `organization_id` and `user_email`.
- Raw profile imports are hashed with `sha256:v1:*` provenance and stored only after the user provides/pastes them.
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
