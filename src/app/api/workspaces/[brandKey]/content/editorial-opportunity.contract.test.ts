import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/workspaces/[brandKey]/content/route.ts", "utf8");

test("Nexus editorial suggestions remain draft-first and attributable", () => {
  assert.match(source, /action === "opportunity_draft"/);
  assert.match(source, /requireBrandWorkspace\(request, params\.brandKey, "content\.edit"\)/);
  assert.match(source, /workspace_brand_content_draft_save/);
  assert.match(source, /nexus-opportunity:/);
  assert.match(source, /nexus-angle:/);
  assert.doesNotMatch(source, /action === "opportunity_publish"/);
});

test("Nexus opportunity dismissal is explicit and does not publish", () => {
  assert.match(source, /action === "opportunity_dismiss"/);
  assert.match(source, /status: "dismissed"/);
});


test("Nexus revalidates live property visibility and price before creating a draft", () => {
  assert.match(source, /property_brand_visibility/);
  assert.match(source, /properties\.show_on_website/);
  assert.match(source, /properties\.website_visible/);
  assert.match(source, /evidencePriceByRef/);
  assert.match(source, /changedPrices/);
  assert.match(source, /OPPORTUNITY_STALE_REFRESH_REQUIRED/);
  assert.match(source, /status:\s*"expired"/);
  assert.doesNotMatch(source, /OPPORTUNITY_STALE_REFRESH_REQUIRED[\s\S]{0,1000}workspace_brand_content_publish/);
});
