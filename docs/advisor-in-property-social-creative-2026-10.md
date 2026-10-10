# Advisor in Property — RealtyFlow SoMe Studio implementation contract

Status: implementation specification; NOT production-enabled.
Date: 2026-10-10
Entry: Inventory property -> SoMe Studio -> three variants -> Content Hub.
Scope: ZenEco first, reusable per brand. No new content silo.

## Goal
Generate an optional AI-assisted image of an **authorized, recognizable advisor** plausibly staged within a real listing photograph. The real listing's architectural facts, layout, surroundings and view MUST remain unchanged. No claim that the adviser physically visited the property. Label visibly as "AI-illustrasjon – rådgiver digitalt plassert i boligbildet" in preview and include disclosure in post metadata/caption. Keep original listing image accessible alongside composite.

## User journey
1. From Inventory choose property -> Create SoMe (existing seeded property flow).
2. New optional visual mode on the property source step: "Originalbilder" (default) or "Megler i bildet".
3. After opting in, choose approved advisor identity (Freddy profile by default *only if authenticated and explicitly authorized*), choose outfit from five style presets and pose, or select "La AI velge". Never infer image rights merely from workspace membership.
4. Show 3-6 ranked property photos, suggested placement (terrace / outside / interior / garden) and explanations; allow selecting another original and an alternate location/pose. Avoid photos with bad perspective, obstructed ground, no available standing zone, dominant property features obscured, or insufficient resolution.
5. Generate drafts independently for three existing concepts. Never regenerate a property photo *as a fictional building*. Return one composite media asset per approved concept (and retain property source media ID).
6. Preview side-by-side ORIGINAL / AI image, with identity and listing-fidelity QA. User can regenerate, choose source, switch outfit, or remove advisor before save.
7. Existing save-to-Content-Hub and publish handoff; publish only approved media and preserve disclosure.
8. Result never automatically published by Nexus without existing human approval boundary.

## Five outfit presets
- navy_armani: dark navy tailored designer suit, white open collar, classic aviator shades
- mediterranean_casual: beige trousers, white linen shirt, sockless loafers, no glasses
- light_grey: light grey suit, pale blue shirt, rectangular sunglasses
- sand_cream: cream designer suit, knitted polo, sockless loafers, no glasses
- charcoal_olive: deep charcoal/olive suit, white shirt, brown tinted rounded sunglasses

All are *styling inspirations*, not verified garment brand identity. Additional pose presets: relaxed railing, welcoming gesture, hands in pockets, walking toward entrance, standing in living room. Clothing and position are independent controls.

## Source and identity assets
- Store original uploaded identity portrait plus multiple user-approved photo references; preserve source file provenance, consent owner, brand scope and whether public redistribution is permitted.
- Prefer dedicated media_assets records and storage buckets; no inline base64 in API requests, no person photos in git.
- Profile references must support identity consistency across glasses/no glasses, original age and facial proportions. Generated images are not considered sole identity truth.
- Support revoke/unpublish future use of identity reference without deleting historical approved publications.
- Property image IDs and listing IDs must always come from authorized existing inventory in the selected workspace. Signed server-side media retrieval only; prevent SSRF and cross-brand lookups.

## Composition pipeline
A. Candidate scoring: category (terrace, exterior, lounge, garden), subject standing area, occlusion, depth, source resolution, exposure, important sales features, aspect ratio and safe zone for captions.
B. Perspective: estimate floor/contact plane, human scale from image geometry, gaze direction, horizon, crop/safe area; do not use a single fixed face/body scale across properties.
C. Composite: input = immutable property photo + adviser identity references + outfit/pose settings + segmentation/depth geometry + preserve-property constraint. Keep building and view unchanged. Add grounded contact shadows/reflections, matched lighting and realistic anatomy.
D. Quality gate: compare source/composite for walls, windows, furniture, pool, view, dimensions and visible selling features; reject invented stairs/windows/balconies, deformed person, extra limbs, bad lighting, implausible scale and low identity similarity. Stop and offer original listing photo when no candidate is suitable. Never silently use generated fictional property.
E. Save source and composite asset references, model/provider, job ID, QA status and disclosure. Deduplicate by listing/image/identity/outfit/pose/prompt version.

## API and persistence
Reuse `/api/workspaces/[brandKey]/social-studio` and existing media jobs, only adding validated actions/capabilities.
- `advisor_visual_options`: per-property ranked candidates + authorized identity/outfit presets.
- `advisor_composite_create`: idempotent queued job `property_id, source_image_id, advisor_profile_id, outfit, pose, placement, channel, variant_id`.
- `advisor_composite_status`: poll job, show staged asset and QA status.
- `advisor_composite_approve`: record manual approval before attaching output to existing drafts.
Extend existing publication media relations to associate source image, composite media, visual_mode, disclosure and approval, not a second publishing table.
Validate brand membership, property marketing rights, person consent, image usage rights and media cost/quota preflight server-side.

## UI
Keep the choice in the current social-studio-panel.tsx property flow and keep 3 proposal cards. Mark AI-image generation as optional, costly, and asynchronous; show honest progress/error status and fallback. After saving, provide explicit Content Hub link to newly created draft. Responsive on mobile and desktop; Norwegian UI first. Make mode available from the Inventory seeded flow; no buried second screen.

## Cost/safety
- Only one selected source image composited on initial request, not all listing images.
- Cache ranking and approved composites; use media jobs and existing quota/rate controls.
- No automatic multiple renders on every three-concept text generation.
- Explicit consent and rights check; retain audit of authorizing user.
- AI depiction disclosure in social caption/metadata and approval UI.
- Avoid implying personal visits, ownership, exclusive listing or verified features unsupported by source.

## Tests / release gates
1. Ranking picks reasonable exterior/terrace image and rejects a cramped bathroom; user override possible.
2. Identity permissions: access to another advisor denied; unauthorized brands denied.
3. Person proportions, shadow/perspective and original building fidelity QA on sample listings.
4. No fabricated property views or architectural elements; safe fallback to original.
5. Three variants can each select original or approved composite independently.
6. Existing property facts, image cards, Content Hub save, publish and brand restrictions unaffected.
7. Refresh/retry returns same job (idempotency); errors not masquerading as completed photos.
8. End-to-end check on one actual permitted property; manual approve; ensure no accidental publication.

## Existing code touchpoints (verified 2026-10-10)
- `src/components/workspaces/social-studio-panel.tsx` (source selection, 3 variants, previews, save)
- `src/app/api/workspaces/[brandKey]/social-studio/route.ts` (brand checks, generation, media jobs)
- `src/services/media/job-service.ts` (async job/retry)
- `src/services/media/prompt-director.ts` (prompt plan)
- `src/services/marketing/property-social-card.ts` (property creatives)
- `src/app/(content)/content-hub/page.tsx` (review/publish handoff)

Rollout: provider & identity capability audit -> backend ranking & rights gate -> composite generation & QA -> UI & previews -> tests -> gated release. Do not label as implemented or live before each gate passes.
