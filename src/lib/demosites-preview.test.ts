import assert from "node:assert/strict";
import { test } from "node:test";
import { getDemoSitesPreviewModel } from "@/lib/demosites-preview";

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
