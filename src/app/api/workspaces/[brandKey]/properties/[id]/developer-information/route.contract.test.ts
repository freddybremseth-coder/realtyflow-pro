import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const api = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/properties/[id]/developer-information/route.ts"), "utf8");
const catalogue = fs.readFileSync(path.join(process.cwd(), "src/components/workspaces/property-catalogue.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/workspace/[brandKey]/page.tsx"), "utf8");

test("developer notes require a verified content editor and exact brand visibility", () => {
  assert.match(api, /requireBrandWorkspace\(request, brandKey, "content.edit"\)/);
  assert.match(api, /\.from\("property_brand_visibility"\)/);
  assert.match(api, /\.eq\("property_id", propertyId\)/);
  assert.match(api, /\.eq\("brand_id", brandKey\)/);
  assert.match(api, /\.eq\("visible", true\)/);
});

test("developer note PATCH is limited to one plain-text field", () => {
  assert.match(api, /Object\.keys\(body\)\.some\(\(key\) => key !== "additional_information"\)/);
  assert.match(api, /typeof body\.additional_information !== "string"/);
  assert.match(api, /body\.additional_information\.length > MAX_LENGTH/);
  assert.match(api, /\.update\(\{ additional_information: body\.additional_information\.trim\(\) \}\)/);
  assert.doesNotMatch(api, /\.update\(body\)/);
});

test("workspace only offers editing with content.edit permission and approved brand property", () => {
  assert.match(workspace, /canEditDeveloperInfo=\{permissions\.includes\("content.edit"\)\}/);
  assert.match(catalogue, /canEditDeveloperInfo && canMarketHere/);
  assert.match(catalogue, /Mer informasjon fra utbygger/);
  assert.match(catalogue, /Lagre informasjon/);
  assert.match(catalogue, /role="alert"/);
});
