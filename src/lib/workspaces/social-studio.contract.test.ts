import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/social-studio/route.ts"), "utf8");
const studio = fs.readFileSync(path.join(process.cwd(), "src/components/workspaces/social-studio-panel.tsx"), "utf8");
const catalogue = fs.readFileSync(path.join(process.cwd(), "src/components/workspaces/property-catalogue.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/workspace/[brandKey]/page.tsx"), "utf8");

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
