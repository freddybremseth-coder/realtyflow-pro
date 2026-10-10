import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/social-studio/route.ts"), "utf8");
const studio = fs.readFileSync(path.join(process.cwd(), "src/components/workspaces/social-studio-panel.tsx"), "utf8");
const catalogue = fs.readFileSync(path.join(process.cwd(), "src/components/workspaces/property-catalogue.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/workspace/[brandKey]/page.tsx"), "utf8");
const inventory = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/inventory/page.tsx"), "utf8");
const marketing = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/marketing/route.ts"), "utf8");
const propertyRenderer = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/property-social-card.ts"), "utf8");
const contentHubDrafts = fs.readFileSync(path.join(process.cwd(), "src/app/api/content-hub/drafts/route.ts"), "utf8");
const contentHubPage = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/content-hub/page.tsx"), "utf8");
const globalsCss = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const advisorPhotoAnalysis = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/advisor-photo-analysis.ts"), "utf8");
const referencePicker = fs.readFileSync(path.join(process.cwd(), "src/components/media-studio/reference-media-picker.tsx"), "utf8");
const mediaUpload = fs.readFileSync(path.join(process.cwd(), "src/app/api/media/assets/upload/route.ts"), "utf8");
const mediaLibraryRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/media/assets/route.ts"), "utf8");

test("SoMe Studio stays behind workspace marketing and property permissions", () => {
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "marketing\.draft"\)/);
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "properties\.catalog\.read"\)/);
  assert.match(route, /property_brand_visibility/);
});

test("Guide and magazine ingestion is restricted to the canonical brand website", () => {
  assert.match(route, /growthBrandDefinition\(brandKey\)/);
  assert.match(route, /normalizedHost\(candidate\.hostname\)/);
  assert.match(route, /redirect: "manual"/);
  assert.match(route, /ARTICLE_REDIRECT_OUTSIDE_BRAND/);
});

test("Studio produces three intentionally different editorial choices and channel copy", () => {
  for (const id of ["editorial_premium", "lifestyle_story", "advisor_insight"]) {
    assert.match(route, new RegExp(id));
  }
  assert.match(studio, /Tre ideer, ikke tre omskrivninger/);
  assert.match(studio, /facebookText/);
  assert.match(studio, /instagramText/);
});

test("Guide and magazine hero images are registered as approved brand media", () => {
  assert.match(route, /registerBrandWebsiteImage/);
  assert.match(route, /source: "brand_article_og_image"/);
  assert.match(route, /provider: "brand-website"/);
});

test("Property studio exposes all seven existing creative styles and registers rendered cards", () => {
  for (const style of ["hero_property", "lifestyle", "fact_card", "advisor", "carousel", "question_hook", "minimal_premium"]) {
    assert.match(studio, new RegExp(style));
  }
  assert.match(route, /renderPropertySocialCard/);
  assert.match(route, /media_assets/);
  assert.match(route, /storage_path/);
});

test("Saved drafts carry concept, source and property style learning tags", () => {
  assert.match(studio, /"concept-" \+ variant\.id/);
  assert.match(studio, /"source-" \+ \(source\?\.type \|\| sourceType\)/);
  assert.match(studio, /"style-" \+ \(styles\[variant\.id\]/);
});

test("Property template selection has an explicit rendered preview before draft save", () => {
  assert.match(studio, /previewVariant/);
  assert.match(studio, /Forhåndsvis valgt mal/);
  assert.match(studio, /aspect-\[4\/5\]/);
});

test("Property catalogue hands a selected listing into the shared SoMe Studio", () => {
  assert.match(catalogue, /onCreateSocial/);
  assert.match(catalogue, /Lag SoMe/);
  assert.match(workspace, /socialPropertySeed/);
  assert.match(workspace, /initialProperty=\{socialPropertySeed\}/);
});


test("Owner Inventory opens the canonical SoMe Studio instead of the legacy one-shot generator", () => {
  assert.match(inventory, /WorkspaceMarketingPanel/);
  assert.match(inventory, /Lag SoMe · 3 forslag/);
  assert.match(inventory, /setSocialStudioProperty/);
  assert.doesNotMatch(inventory, /generateSoMePost/);
  assert.doesNotMatch(inventory, /Lag SoMe-post for/);
  assert.match(studio, /setPropertyLookup\(initialProperty\.ref \|\| initialProperty\.id\)/);
});


test("Editorial picker discovers live brand content and editorial categories without cross-domain crawling", () => {
  assert.match(route, /action === "discover_content"/);
  assert.match(route, /discoverPublicWebsitePages/);
  assert.match(route, /\/sitemap\.xml/);
  assert.match(route, /allowedBrandUrl\(brandKey/);
  assert.match(route, /area_profiles/);
  assert.match(route, /notShared60Days/);
  for (const label of ["Anbefalt å fronte nå", "Nye guider", "Magasin", "Områder", "Ikke delt siste 60 dager"]) {
    assert.match(studio, new RegExp(label));
  }
});

test("Editorial picker can pair a selected property with guide or area content", () => {
  assert.match(route, /companionPropertyLookup/);
  assert.match(route, /KONTEKSTBOLIG SOM KAN KOBLES TIL KILDEN/);
  assert.match(route, /concept: "advisor_insight"/);
  assert.match(studio, /Foreslåtte kombinasjoner/);
  assert.match(studio, /Anbefalt vinkel: Advisor \/ Insight/);
  assert.match(studio, /paired-property/);
});

test("Owner can use the same canonical marketing draft flow as workspace members", () => {
  assert.match(marketing, /ownerMarketingSnapshot/);
  assert.match(marketing, /ownerImageApproved/);
  assert.match(marketing, /ownerChannelsActive/);
  assert.match(marketing, /owner_draft: true/);
  assert.doesNotMatch(marketing, /if \(!access\.value\.verifiedUserId\) return fail\(403, "STAFF_ONLY"\)/);
});


test("SoMe Studio tolerates wrapped JSON and retries without native schema before failing", () => {
  assert.match(route, /function parseAiJsonValue/);
  assert.match(route, /validVariantPayload/);
  assert.match(route, /structuredError/);
  assert.match(route, /native JSON-schema ikke er tilgjengelig/);
  assert.match(route, /SOCIAL_STUDIO_AI_UNAVAILABLE/);
  assert.match(studio, /AI-tjenesten er midlertidig utilgjengelig/);
});


test("SoMe Studio normalizes common AI response shapes before rejecting output", () => {
  assert.match(route, /function normalizeVariantPayload/);
  assert.match(route, /concepts/);
  assert.match(route, /suggestions/);
  assert.match(route, /facebook_text/);
  assert.match(route, /instagram_caption/);
  assert.match(route, /AI-SVAR SOM SKAL NORMALISERES/);
  assert.match(route, /AI output could not be normalized/);
});

test("SoMe Studio structured schema requires exactly three variants", () => {
  assert.match(route, /minItems:\s*3/);
  assert.match(route, /maxItems:\s*3/);
});

test("SoMe Studio salvages stringified, numbered and channel-separated AI shapes", () => {
  assert.match(route, /function rowFromLooseValue/);
  assert.match(route, /function channelSeparatedVariantRows/);
  assert.match(route, /facebookPosts/);
  assert.match(route, /instagramPosts/);
  assert.match(route, /depth > 5/);
  assert.match(route, /preferCandidate/);
});


test("SoMe Studio escalates malformed output across providers and never hard-stops on format alone", () => {
  assert.match(route, /validateResponse:\s*validVariantPayload/);
  assert.match(route, /fallbackOnInvalidResponse:\s*true/);
  assert.match(route, /const fallbackRaw = await askClaude/);
  assert.match(route, /const repairedRaw = await askClaude/);
  assert.match(route, /function buildDeterministicVariantPayload/);
  assert.match(route, /AI_FORMAT_RECOVERED_LOCALLY/);
  assert.match(route, /using source-safe local fallback/);
  assert.match(studio, /tre kildebaserte forslag lokalt/);
});



test("Local SoMe recovery stays source-based and still returns the three canonical concepts", () => {
  assert.match(route, /function fallbackExcerpt/);
  assert.match(route, /sourceCore = excerpt/);
  assert.match(route, /id: "editorial_premium"/);
  assert.match(route, /id: "lifestyle_story"/);
  assert.match(route, /id: "advisor_insight"/);
  assert.match(route, /raw = JSON\.stringify\(buildDeterministicVariantPayload\(sourceTitle, sourceText\)\)/);
  assert.match(route, /generationFallback = true/);
});

test("Property card rendering falls back to the approved property image and keeps the draft flow open", () => {
  assert.match(route, /property card fallback/);
  assert.match(route, /imageUrl: selectedSourceImageUrl/);
  assert.match(route, /rendered: false/);
  assert.match(route, /fallback: true/);
  assert.match(studio, /Kortmalen kunne ikke rendres akkurat nå/);
  assert.match(studio, /Åpne utkastet og gå videre/);
});


test("SoMe property-image approval targets the exact source property instead of a capped catalogue scan", () => {
  assert.match(marketing, /sourcePropertyId/);
  assert.match(marketing, /ownerImageApproved\(access\.value\.supabase, params\.brandKey, imageUrl, sourcePropertyId\)/);
  assert.match(marketing, /\.eq\("property_id", sourcePropertyId\)/);
  assert.match(marketing, /\.eq\("brand_id", brandKey\)/);
  assert.match(marketing, /imageUrl === property\.primary_image/);
  assert.match(studio, /sourcePropertyId: source\?\.type === "property"/);
});

test("SoMe action feedback stays next to generate, preview and save controls", () => {
  assert.match(studio, /generationFeedback/);
  assert.match(studio, /saveFeedback/);
  assert.match(studio, /previewFeedback/);
  assert.match(studio, /Tre forskjellige konsepter er klare/);
  assert.match(studio, /-utkastet er lagret i Content Hub/);
});


test("SoMe Studio exposes ZenEco content-mix strategy and recommendation guidance", () => {
  assert.match(route, /action === "strategy_snapshot"/);
  assert.match(route, /buildSocialStrategySnapshot/);
  assert.match(route, /content_features,published_at,created_at/);
  assert.match(studio, /Anbefalt neste · 90-dagers strategi/);
  assert.match(studio, /Rene boligposter/);
  assert.match(studio, /Bruk anbefalingen/);
  assert.match(studio, /social-category-/);
});

test("SoMe Studio assigns different property gallery images to the three concepts", () => {
  assert.match(route, /function propertyMediaUrls/);
  assert.match(route, /function variantPropertyImages/);
  assert.match(route, /variantImages = variantPropertyImages\(property\)/);
  assert.match(route, /sourceImageUrl: selectedSourceImageUrl/);
  assert.match(studio, /source\.variantImages\?\.\[variant\.id\]/);
  assert.match(studio, /Eget bilde valgt for dette konseptet/);
});

test("Saved owner drafts persist strategy category and concept metadata", () => {
  assert.match(marketing, /social_category: socialCategory/);
  assert.match(marketing, /is_property_presentation: socialCategory === "property"/);
  assert.match(marketing, /concept_id: conceptId/);
  assert.match(marketing, /visual_format: visualFormat/);
  assert.match(marketing, /strategy_period_id: strategyPeriodId/);
});


test("SoMe Studio keeps Instagram captions link-free and varies engagement CTAs", () => {
  assert.match(route, /function instagramCaptionWithoutLinks/);
  assert.match(route, /replace\(\/https\?:\\\/\\\/\[\^\\s/);
  assert.match(route, /function instagramEngagementCta/);
  assert.match(route, /Lagre posten/);
  assert.match(route, /Hvem ville du tatt med deg hit/);
  assert.match(route, /Send oss en melding/);
  assert.match(route, /Instagram-engasjement skal variere mellom konseptene/);
  assert.match(route, /facebookText: ensureLink/);
  assert.match(route, /instagramText: ensureInstagramEngagement/);
});

test("SoMe Studio supports a three-image collage visual format with safe fallback", () => {
  assert.match(route, /action === "render_property_collage"/);
  assert.match(route, /renderPropertySocialCollage/);
  assert.match(route, /sourceImageUrls: collageImages/);
  assert.match(route, /style: "collage_3"/);
  assert.match(route, /PROPERTY_COLLAGE_IMAGES_REQUIRED/);
  assert.match(studio, /type VisualFormat = "single_image" \| "property_card" \| "collage_3"/);
  assert.match(studio, /3-bilders kollasje/);
  assert.match(studio, /propertyImageCount/);
  assert.match(studio, /visual-/);
  assert.match(propertyRenderer, /renderPropertySocialCollage/);
  assert.match(propertyRenderer, /scale=710:1350/);
  assert.match(propertyRenderer, /scale=362:671/);
  assert.match(propertyRenderer, /xstack=inputs=3/);
});

test("Advisor insight defaults to collage only when at least three unique images exist", () => {
  assert.match(studio, /item\.id === "advisor_insight"/);
  assert.match(studio, /Number\(body\.source\?\.propertyImageCount \|\| 0\) >= 3/);
});


test("SoMe Studio can hand off all three concepts as one package with approved media", () => {
  assert.match(route, /action === "generate_concept_image"/);
  assert.match(route, /generateSocialStudioConceptImage/);
  assert.match(route, /createMediaPromptPlan/);
  assert.match(route, /createMediaJob/);
  assert.match(route, /social-studio-concept:/);
  assert.match(studio, /Lagre hele SoMe-pakken/);
  assert.match(studio, /savePackage/);
  assert.match(studio, /kanalutkast er lagret i Content Hub/);
  assert.match(studio, /package-/);
  assert.match(studio, /Lag alternativt AI-bilde/);
});

test("Topic and editorial drafts persist canonical Content Hub image fields", () => {
  assert.match(marketing, /ai_image_url: imageUrl \|\| null/);
  assert.match(marketing, /media_urls: imageUrl \? \[imageUrl\] : \[\]/);
  assert.match(marketing, /social_package_id: packageId/);
  assert.match(marketing, /ai_generated_image: true/);
  assert.match(marketing, /Mirror approved/);
});

test("Content Hub compact draft list keeps thumbnails visible", () => {
  assert.match(contentHubDrafts, /"thumbnail_url", "scheduled_platforms"/);
  assert.match(contentHubDrafts, /thumbnail_url: typeof row\.thumbnail_url === "string"/);
  assert.doesNotMatch(contentHubDrafts, /thumbnail_url: null,\n\s*image_compacted: true/);
});


test("SoMe Studio explains the full draft-to-publish workflow", () => {
  for (const label of ["Velg kilde", "Lag 3 forslag", "Se tekst og bilder", "Lagre som utkast", "Publiser / planlegg"]) {
    assert.match(studio, new RegExp(label.replace(/[\/]/g, "\\/")));
  }
  assert.match(studio, /Content Hub er stedet der SoMe-utkast lagres/);
  assert.match(studio, /SoMe Studio publiserer ikke automatisk/);
  assert.match(studio, /Lagre hele SoMe-pakken som utkast/);
  assert.match(studio, /packageProgress/);
});

test("SoMe package handoff opens the whole package instead of one arbitrary draft", () => {
  assert.match(studio, /savedPackageId/);
  assert.match(studio, /content-hub\?package=/);
  assert.match(studio, /from=social-studio&brand=/);
  assert.match(studio, /Åpne hele pakken i Content Hub/);
  assert.match(contentHubPage, /focusedPackageId/);
  assert.match(contentHubPage, /packageDrafts/);
  assert.match(contentHubPage, /Du ser nå bare denne pakken/);
  assert.match(contentHubPage, /Ingenting er publisert automatisk/);
  assert.match(contentHubPage, /Tilbake til SoMe Studio/);
});

test("Content Hub renders compact thumbnails and hides technical SoMe tags", () => {
  assert.match(contentHubPage, /draft\.thumbnail_url \|\| draft\.ai_image_url/);
  assert.match(contentHubPage, /isInternalSocialTag/);
  assert.match(contentHubPage, /SoMe Studio/);
  assert.match(contentHubPage, /socialConceptLabel/);
  assert.match(contentHubPage, /friendlyPlatformName/);
});

test("Individual SoMe saves clearly say they go to Content Hub and are not published", () => {
  assert.match(studio, /Lagre Facebook i Content Hub/);
  assert.match(studio, /Lagre Instagram i Content Hub/);
  assert.match(studio, /Ingenting er publisert ennå/);
  assert.match(studio, /Åpne utkastet og gå videre/);
});


test("SoMe review comes before package save and new recommendations clear stale handoff state", () => {
  assert.ok(studio.indexOf('id="social-studio-results"') < studio.indexOf('id="social-package-handoff"'));
  assert.match(studio, /function applyStrategyRecommendation\(\)[\s\S]*setPackageFeedback\(null\)/);
  assert.match(studio, /sourceType === "property" \? "7 eiendomsmaler" : "3 konsepter · kanaltilpasset"/);
});


test("SoMe workspace separates creation from Content Hub and keeps saved drafts easy to find", () => {
  assert.doesNotMatch(workspace, /SoMe Studio · Content Hub/);
  assert.match(workspace, /Når du lagrer, finner du utkastene i Content Hub/);
  assert.match(studio, /Se lagrede utkast/);
  assert.match(studio, /href=\{"\/content-hub\?from=social-studio&brand="/);
});

test("Content Hub prioritizes brand media and exposes planning from SoMe drafts", () => {
  assert.match(contentHubPage, /image-bank\?owner=" \+ encodeURIComponent\(brandId\)/);
  assert.match(contentHubPage, /Bilder for denne merkevaren vises først/);
  assert.match(contentHubPage, /isSocialStudioDraft \? "Publiser \/ planlegg" : "Publiser"/);
});


test("Content Hub opens saved SoMe drafts scoped to the originating brand", () => {
  assert.match(contentHubPage, /requestedOrigin === "social-studio" && requestedBrand/);
  assert.match(contentHubPage, /socialStudioBrandFocus/);
  assert.match(contentHubPage, /normalizeBrand\(draft\.brand_id\) === normalizeBrand\(socialStudioBrandFocus\)/);
  assert.match(contentHubPage, /SoMe-utkast · \{focusedBrandLabel\}/);
  assert.match(contentHubPage, /Vis alle merkevarer/);
  assert.match(contentHubPage, /Lag nytt SoMe-innlegg/);
  assert.match(contentHubPage, /Ingen utkast for denne merkevaren i valgt status/);
});


test("SoMe Studio and Content Hub protect human names from awkward line splitting", () => {
  assert.match(studio, /protectHumanText\(variant\.facebookText\)/);
  assert.match(studio, /protectHumanText\(variant\.instagramText\)/);
  assert.match(studio, /rf-human-name/);
  assert.match(studio, /rf-human-text/);
  assert.match(contentHubPage, /protectHumanText\(draft\.description/);
  assert.match(contentHubPage, /protectHumanText\(draft\.title/);
  assert.match(contentHubPage, /rf-human-name/);
  assert.match(globalsCss, /\.rf-human-text\s*\{/);
  assert.match(globalsCss, /word-break:\s*normal/);
  assert.match(globalsCss, /overflow-wrap:\s*normal/);
  assert.match(globalsCss, /hyphens:\s*none/);
  assert.match(globalsCss, /\.rf-human-name\s*\{/);
  assert.match(globalsCss, /white-space:\s*nowrap/);
});

test("Advisor composites require authorized listing, identity asset and consent", () => {
  assert.match(route, /action === "advisor_composite_create"/);
  assert.match(route, /confirmIdentityRights !== true/);
  assert.match(route, /propertyMediaUrls\(property\)\.includes\(sourceImageUrl\)/);
  assert.match(route, /ADVISOR_REFERENCE_NOT_AUTHORIZED/);
  assert.match(route, /autoExportToContentHub: false/);
  assert.match(route, /requiresManualApproval: true/);
});

test("Advisor preview cannot approve without reviewing identity, property and perspective", () => {
  assert.match(studio, /advisorReview\[variant\.id\]\?\.identity/);
  assert.match(studio, /advisorReview\[variant\.id\]\?\.property/);
  assert.match(studio, /advisorReview\[variant\.id\]\?\.perspective/);
  assert.match(studio, /Godkjenn bildet til utkast/);
  assert.match(studio, /advisorStaged\[variant\.id\] && !advisorApproved\[variant\.id\]/);
});

test("Advisor generation keeps the listing photograph first and labels synthetic output", () => {
  assert.match(route, /sourceImageUrls: \[sourceImageUrl, String\(identityAsset\.public_url\)\]/);
  assert.match(route, /Preserve all architecture, furniture, view, terrain/);
  assert.match(studio, /AI-illustrasjon: Rådgiveren er digitalt plassert i boligbildet/);
  assert.match(studio, /Originalboligen/);
});

test("Advisor status polling refreshes scoped image jobs without creating duplicate generations", () => {
  assert.match(route, /action === "advisor_composite_status"/);
  assert.match(route, /ADVISOR_JOB_NOT_FOUND/);
  assert.match(route, /startsWith\("advisor-composite:"\)/);
  assert.match(route, /existing\.operation !== "image_to_image"/);
  assert.match(studio, /action: "advisor_composite_status"/);
  assert.match(studio, /jobId: created\.jobId/);
  assert.match(studio, /Submit once\. All later requests ONLY refresh/);
});

test("Advisor visual review is opt-in, single-image and gated by the property catalogue", () => {
  assert.match(route, /action === "advisor_visual_analyze"/);
  assert.match(route, /ADVISOR_PHOTO_NOT_IN_LISTING/);
  assert.match(route, /reviewAdvisorPhoto\(sourceImageUrl\)/);
  assert.match(studio, /AI-vurder valgt boligfoto/);
  assert.match(studio, /action: "advisor_visual_analyze"/);
});

test("Advisor photo concepts have distinct visual instructions and explicitly review before save", () => {
  assert.match(route, /const conceptDirection/);
  assert.match(route, /architecture-first composition/);
  assert.match(route, /Candid Mediterranean lifestyle composition/);
  assert.match(route, /Confident but understated property-advisor stance/);
  assert.match(studio, /Godkjenn bildet til utkast/);
});

test("Advisor AI shortlist compares at most three explicit listing images", () => {
  assert.match(route, /action === "advisor_visual_rank"/);
  assert.match(route, /advisorPropertyPhotoCandidates\(property\)\.slice\(0, 3\)/);
  assert.match(route, /Promise\.allSettled\(candidates\.map/);
  assert.match(route, /requiresManualApproval: true/);
  assert.match(studio, /Finn beste bilde med AI \(maks 3 bilder\)/);
  assert.match(studio, /action: "advisor_visual_rank"/);
  assert.match(studio, /setAdvisorChosenImage\(recommendation\.imageUrl\)/);
});

test("Advisor visual analysis bounds image downloads and rejects unsafe network destinations", () => {
  assert.match(advisorPhotoAnalysis, /assertPublicDns\(url\.hostname\)/);
  assert.match(advisorPhotoAnalysis, /isPublicAddress\(item\.address\)/);
  assert.match(advisorPhotoAnalysis, /redirect: "error"/);
  assert.match(advisorPhotoAnalysis, /const maxBytes = 7 \* 1024 \* 1024/);
  assert.match(advisorPhotoAnalysis, /ADVISOR_PHOTO_URL_UNSAFE/);
});

test("Instagram carousel discloses AI visual if advisor appears on any slide", () => {
  assert.match(studio, /const containsAdvisorComposite = variants\.some\(item => Boolean\(advisorApproved\[item\.id\]\)\)/);
  assert.match(studio, /containsAdvisorComposite,/);
  assert.match(studio, /const hasAdvisorComposite = Boolean\(advisorApproved\[variant\.id\] \|\| options\.containsAdvisorComposite\)/);
  assert.match(studio, /hasAdvisorComposite \? \["ai-advisor-composite", "ai-illustration"\]/);
});

test("Advisor reference images must be explicitly uploaded and purpose-tagged", () => {
  assert.match(studio, /purpose="advisor_portrait"/);
  assert.match(referencePicker, /form\.set\("referencePurpose", "advisor_portrait"\)/);
  assert.match(referencePicker, /asset\.metadata_json\?\.purpose === "advisor_portrait"/);
  assert.match(mediaUpload, /purpose: metadata\.referencePurpose \|\| "media_reference"/);
  assert.match(route, /identityAsset\.metadata_json\?\.purpose !== "advisor_portrait"/);
});

test("Advisor portraits are filtered in the media API before the library limit", () => {
  assert.match(referencePicker, /referencePurpose=advisor_portrait/);
  assert.match(mediaLibraryRoute, /metadata_json->>purpose/);
  assert.match(mediaLibraryRoute, /"advisor_portrait", "media_reference"/);
});

test("Advisor image generation requires same resolved property as generated SoMe proposals", () => {
  assert.match(studio, /source\.propertyId !== advisorCandidatePropertyId/);
  assert.match(studio, /setAdvisorCandidatePropertyId\(typeof body\.propertyId === "string"/);
  assert.match(studio, /advisorRequestEpoch\.current \+= 1/);
});

test("Changing property clears old generated concepts and invalidates in-flight responses", () => {
  assert.match(studio, /const generationRequestEpoch = useRef\(0\)/);
  assert.match(studio, /const generationEpoch = \+\+generationRequestEpoch\.current/);
  assert.match(studio, /if \(generationEpoch !== generationRequestEpoch\.current\) return/);
  assert.match(studio, /setSource\(null\); setVariants\(\[\]\)/);
});
