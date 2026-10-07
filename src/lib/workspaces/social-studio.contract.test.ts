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


test("SoMe Studio captures raw provider output before RealtyFlow validation", () => {
  assert.match(route, /Do not validate inside the provider client/);
  assert.doesNotMatch(route, /validateResponse:\s*validVariantPayload/);
  assert.match(route, /const fallbackRaw = await askClaude/);
  assert.match(route, /const repairedRaw = await askClaude/);
});


test("Property card rendering falls back to the approved property image and keeps the draft flow open", () => {
  assert.match(route, /property card fallback/);
  assert.match(route, /imageUrl: property\.primary_image/);
  assert.match(route, /rendered: false/);
  assert.match(route, /fallback: true/);
  assert.match(studio, /Kortmalen kunne ikke rendres akkurat nå/);
  assert.match(studio, /Åpne dette utkastet i Content Hub/);
});
