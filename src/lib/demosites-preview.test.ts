import assert from "node:assert/strict";
import { test } from "node:test";
import { getDemoSitesPreviewModel } from "@/lib/demosites-preview";
import { getDemoSitePreviewIndustryVisual } from "@/lib/demosites-preview-visuals";

test("DemoSites preview keeps logo out of hero and gallery images", () => {
  const logoUrl = "https://example.com/assets/company-logo.png";
  const workshopUrl = "https://example.com/assets/workshop-photo.jpg";
  const model = getDemoSitesPreviewModel({
    companyName: "Eidskog Dekk felg",
    templateSlug: "dekk",
    editableFields: {
      logo_url: logoUrl,
      gallery_images: [
        logoUrl,
        "https://example.com/assets/brandmark.svg",
        workshopUrl,
      ],
    },
    fallbackMode: "placeholders",
  });

  assert.equal(model.content.logo_url, logoUrl);
  assert.deepEqual(model.content.gallery_images, [workshopUrl]);
});

test("DemoSites preview visual profile maps key industries", () => {
  assert.equal(getDemoSitePreviewIndustryVisual("dekk").variant, "auto");
  assert.deepEqual(getDemoSitePreviewIndustryVisual("bilverksted").signalItems, ["Dekkskift", "Hjulhotell", "Verkstedtime"]);

  assert.equal(getDemoSitePreviewIndustryVisual("restaurant-cafe").variant, "hospitality");
  assert.deepEqual(getDemoSitePreviewIndustryVisual("restaurant").signalItems, ["Meny", "Bordbooking", "Selskap"]);

  assert.equal(getDemoSitePreviewIndustryVisual("ai-teknologi").variant, "neon");
  assert.match(getDemoSitePreviewIndustryVisual("ai-service").heroPanelText, /pilot/i);
});

test("DemoSites preview visual profile keeps unknown templates neutral", () => {
  const visual = getDemoSitePreviewIndustryVisual("unknown-business");

  assert.equal(visual.variant, "local");
  assert.match(visual.signalTitle, /standardmal/i);
  assert.deepEqual(visual.signalItems, ["Tjenester", "Tilbud", "Kontakt"]);
});
