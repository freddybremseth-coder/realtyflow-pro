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
