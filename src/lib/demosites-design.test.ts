import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_SITE_DESIGN_CYCLE,
  DEMO_SITE_SIGNATURE_LAYOUTS,
  isDemoSiteLayout,
  isSignatureDemoSiteLayout,
  nextDemoSiteDesign,
  resolveDemoSiteDesign,
} from "./demosites-design";

test("registers all five Signature 2026 layouts", () => {
  assert.deepEqual(
    DEMO_SITE_SIGNATURE_LAYOUTS.map((layout) => layout.id),
    ["cinematic", "bento", "atelier", "kinetic", "panorama"],
  );

  for (const layout of DEMO_SITE_SIGNATURE_LAYOUTS) {
    assert.equal(isDemoSiteLayout(layout.id), true);
    assert.equal(isSignatureDemoSiteLayout(layout.id), true);
  }
});

test("saved signature design resolves without changing legacy defaults", () => {
  assert.deepEqual(
    resolveDemoSiteDesign({
      templateSlug: "restaurant",
      editableFields: { layout_variant: "atelier", style_preset: "elegant" },
    }),
    { layout: "atelier", style: "elegant" },
  );

  assert.deepEqual(
    resolveDemoSiteDesign({
      templateSlug: "restaurant",
      editableFields: {},
    }),
    { layout: "fullbleed", style: "warm" },
  );
});

test("curated design cycle includes every signature layout", () => {
  const cycleLayouts = new Set(
    DEMO_SITE_DESIGN_CYCLE.map((design) => design.layout),
  );
  for (const layout of DEMO_SITE_SIGNATURE_LAYOUTS) {
    assert.equal(cycleLayouts.has(layout.id), true);
  }

  assert.deepEqual(
    nextDemoSiteDesign({ layout: "editorial", style: "elegant" }),
    { layout: "cinematic", style: "modern" },
  );
});
