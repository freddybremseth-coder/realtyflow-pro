import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
const inventory=fs.readFileSync(path.join(process.cwd(),"src/app/(realty)/inventory/page.tsx"),"utf8");
const api=fs.readFileSync(path.join(process.cwd(),"src/app/api/workspaces/[brandKey]/properties/curation/route.ts"),"utf8");
const editor=fs.readFileSync(path.join(process.cwd(),"src/components/workspaces/property-curation-editor.tsx"),"utf8");
test("no 300-character cut in imported source description",()=> {
 assert.doesNotMatch(inventory,/description:\s*description\.length > 300/);
 assert.match(inventory,/sourceDescription: typeof row\.source_description/);
 assert.match(inventory,/Hele originalbeskrivelsen fra importen/);
});
test("brand staff access to source text requires content edit plus brand visibility",()=> {
 assert.match(api,/requireBrandWorkspace\(req, params.brandKey, "content.edit"\)/);
 assert.match(api,/property_brand_visibility/);
 assert.match(api,/source_description/);
 assert.match(editor,/Les hele originalbeskrivelsen fra importen/);
});
