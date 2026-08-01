# AI Media Studio

AI Media Studio is the provider-independent creative production module for RealtyFlow Pro. It gives the user one task-based entrypoint, asks "Hva ønsker du å lage?", turns that request into a validated media production plan, routes the job to the best available provider, stores the result as a durable asset, and lets the user download, reuse, variant-generate, or export it to Content Hub.

## Architecture

The module is implemented as an integrated RealtyFlow content module, not as a parallel app.

- UI: `src/app/(content)/media-studio/page.tsx` and `src/components/media-studio/media-studio-client.tsx`
- API: `src/app/api/media/*`
- Core services: `src/services/media/*`
- OpenArt MCP extension: `src/services/integrations/openart-client.ts`
- Database migration: `supabase/migrations/20260801133000_ai_media_studio.sql`
- Navigation and permissions: `src/lib/constants.ts`, `src/lib/navigation.ts`, `src/lib/access-control.ts`

Main views:

- Overview
- Create
- Image Studio
- Product Studio
- Property Studio
- Avatar Studio
- Video Studio
- Voice Studio
- Brand Studio
- Projects
- Media Library
- Templates
- Jobs
- Settings

The first production core supports the complete image/video job path. Avatar and voice are represented by provider-aware shells and stay disabled unless a connected provider reports matching capabilities.

## Provider System

Providers implement `MediaProvider` from `src/services/media/types.ts`.

Current providers:

- Gemini: low-cost image and image-variant provider.
- OpenArt: MCP-backed image and video provider.

The UI and job API never call provider APIs directly from the browser. The server creates a prompt plan, checks capabilities, chooses the provider, writes a database job, submits the provider request, persists results, and records usage events.

To add a provider:

1. Create `src/services/media/providers/<provider>-media-provider.ts`.
2. Implement `getCapabilities`, supported `generate*` methods, `getJobStatus`, and optional `cancelJob`.
3. Add the provider ID to the schemas in `src/services/media/types.ts`.
4. Add routing rules in `src/services/media/provider-router.ts`.
5. Add capability storage/mapping in `src/services/media/capabilities.ts`.
6. Add tests for capability mapping and routing.

## OpenArt MCP

OpenArt is still integrated through OAuth + MCP. The existing client keeps:

- encrypted token storage
- token refresh
- MCP session initialization
- `tools/call`
- image wrapper
- video wrapper
- creation polling
- account status

AI Media Studio adds:

- `listOpenArtTools()`
- `refreshOpenArtCapabilities()`
- capability persistence in `media_provider_capabilities`
- provider-neutral OpenArt wrapper in `src/services/media/providers/openart-media-provider.ts`

Tokens remain server-side only. The browser only receives status, account summary, tools metadata, and capability booleans.

## Gemini

Gemini image generation is moved behind `GeminiMediaProvider`. It uses `GEMINI_API_KEY` on the server and supports:

- text-to-image
- image-to-image through source image inline data
- inline base64 result persistence

If `GEMINI_API_KEY` is not configured, Gemini is reported as `unavailable` and the router will not use it.

## Capability Registry

Capabilities are provider-neutral and stored with timestamps:

- `image.textToImage`
- `image.imageToImage`
- `image.inpainting`
- `image.outpainting`
- `image.upscaling`
- `image.backgroundRemoval`
- `video.textToVideo`
- `video.imageToVideo`
- `video.audioGeneration`
- `avatar.avatarCreation`
- `avatar.talkingAvatar`
- `voice.textToSpeech`
- `voice.voiceClone`

OpenArt capabilities are derived from real MCP `tools/list` output at runtime and cached for one hour. Gemini capabilities are derived from local server configuration.

Unsupported features are either hidden, shown as unavailable, or routed to another configured provider. The module does not assume that OpenArt web-app features exist in MCP.

## Prompt Director

`src/services/media/prompt-director.ts` transforms natural language into a Zod-validated `MediaPromptPlan`.

It builds provider-independent prompt blocks:

- SUBJECT
- PURPOSE
- AUDIENCE
- ENVIRONMENT
- ACTION
- COMPOSITION
- CAMERA
- LIGHTING
- COLOR
- STYLE
- BRAND RULES
- REFERENCE PRESERVATION
- TEXT RULES
- OUTPUT FORMAT
- QUALITY
- EXCLUSIONS

Simple and guided modes use the structured plan. Professional mode exposes more of the generated plan but still sends a validated provider prompt, not raw user text by default.

## Provider Router

`src/services/media/provider-router.ts` chooses Gemini or OpenArt based on:

- media type
- operation
- requested quality
- source image/reference needs
- live capabilities
- provider status
- relative cost tier

The job service re-checks `supportsCapability()` before submission, so a provider cannot be selected only because it is online; it must support the exact operation.

## Job System

`media_generation_jobs` is the durable async job table.

Supported statuses:

- `draft`
- `queued`
- `submitted`
- `processing`
- `completed`
- `failed`
- `cancelled`
- `expired`

The API supports:

- create job: `POST /api/media/jobs`
- list jobs: `GET /api/media/jobs`
- poll/refresh: `GET /api/media/jobs/[id]`
- retry: `POST /api/media/jobs/[id]/retry`
- cancel: `POST /api/media/jobs/[id]/cancel`

Jobs use an idempotency key to avoid duplicate submissions on double-click. Write actions also have a lightweight in-memory rate limit to protect provider credits.

## Data Model

The migration adds:

- `media_projects`
- `media_brand_profiles`
- `media_templates`
- `media_provider_capabilities`
- `media_prompt_plans`
- `media_generation_jobs`
- `media_assets`
- `media_asset_links`
- `media_usage_events`

Assets can be linked to projects, campaigns, properties, Content Hub drafts, social posts, books, products, contacts, and leads through `media_asset_links`.

## RLS

All new tables have RLS enabled.

Tenant isolation is enforced through `media_studio_can_access(organization_id)`, which allows:

- server-side service role access
- future direct authenticated tenant access through `core.is_tenant_member`

The current admin APIs resolve to the `realtyflow` tenant from `core.tenants` and filter every read/write by `organization_id`.

## Storage

Generated media is uploaded to the `media-studio` Supabase Storage bucket. Images are also mirrored into the existing `user_image_bank` for compatibility with current RealtyFlow image workflows.

The MVP bucket follows the existing generated-media pattern used by `ad-creatives`, `plot-assets`, and `content-images`: stored objects get public URLs so Content Hub, cards, downloads, and downstream social workflows can use them directly.

Hardening path:

- add private asset classes for person-sensitive media
- serve signed URLs through API routes
- keep public URLs only for explicitly publishable campaign/media assets

## Content Hub

`src/services/media/content-hub-export.ts` exports a `media_assets` row into `content_publications` without duplicating the file. It passes through:

- title
- description
- media URL
- thumbnail URL
- brand
- campaign
- tags
- AI-generated / AI-edited flags

The asset is updated with `content_hub_publication_id` and `exported_to_content_hub_at`, and a `media_asset_links` row records the relationship.

## Cost Control

The module uses cost tiers, not fake precise prices:

- low
- medium
- high
- premium

Controls currently implemented:

- capability-aware provider choice
- OpenArt credit display when account status exposes credits
- estimated cost category in plans/jobs/assets
- write-action rate limiting
- idempotency keys
- maximum source/result file size
- maximum image/video counts in provider wrappers
- usage event logging

Future billing can attach organization/user quotas to `media_usage_events`.

## Templates

System templates are seeded for:

- LinkedIn-portrett
- LinkedIn-annonse
- Instagram-post
- Instagram-Reel
- Facebook-annonse
- Eiendomshero
- Eiendoms-Reel
- Produktreklame
- Middelhavslivsstil
- Bokomslag
- Forfatterportrett
- Bloggheader
- Kampanjepakke

To add a template, insert into `media_templates` with prompt blocks, default aspect ratio, quality tier, provider preference, required inputs, optional inputs, and `is_system`.

## Adding A Media Type

1. Add the media type and operation semantics in `src/services/media/types.ts`.
2. Add Prompt Director detection and prompt blocks.
3. Add capability fields if needed.
4. Implement provider methods.
5. Add UI task shell or full workflow.
6. Add migration constraints if a new persistent type is introduced.
7. Add route and service tests.

## Avatar Providers

Avatar support must stay capability-gated. A provider should expose:

- `avatar.avatarCreation`
- `avatar.talkingAvatar`
- consent requirements in request metadata
- no sensitive attribute classification

Do not implement face recognition or sensitive inference.

## Voice Providers

Voice support must stay capability-gated. A provider should expose:

- `voice.textToSpeech`
- optional `voice.voiceClone`
- explicit consent gates before voice cloning

The existing interface is `VoiceGenerationInput`.

## Known Limitations

- OpenArt capabilities require a live OAuth connection and server environment; local development without `.env.local` reports OpenArt as not connected.
- Avatar and voice are architecture/UI shells until a connected provider reports capabilities.
- Public media URLs follow current RealtyFlow generated-media conventions; private/signed URL handling is the next security hardening for sensitive person assets.
- Prompt Director is deterministic in this phase. It is structured and Zod-validated, but can later use an LLM with strict schema validation.
- Full organization/user quota billing is not implemented yet; usage events provide the foundation.
- E2E provider tests should use mocks and must not spend real OpenArt credits.

## Next Phase

1. Add signed URL mode for sensitive asset classes.
2. Add database-backed organization/user quotas.
3. Add mocked E2E tests for create → job → asset → Content Hub.
4. Add richer Property Studio workflows for staging/concept classification.
5. Add provider plugins for voice/avatar when a provider exposes supported capabilities.
6. Add campaign/property linking UI actions from the asset detail drawer.
