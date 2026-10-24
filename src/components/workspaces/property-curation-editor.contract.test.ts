import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
const api=fs.readFileSync(path.join(process.cwd(),"src/app/api/workspaces/[brandKey]/properties/curation/route.ts"),"utf8");
const ui=fs.readFileSync(path.join(process.cwd(),"src/components/workspaces/property-curation-editor.tsx"),"utf8");
const sql=fs.readFileSync(path.join(process.cwd(),"supabase/migrations/20261024140000_property_brand_curations.sql"),"utf8");
test("brand-scoped edits require verified explicit write grant and visible matching brand",()=>{
 assert.match(api,/requireBrandWorkspace\(req, params.brandKey, "content.edit"\)/);
 assert.match(api,/property_brand_visibility/);
 assert.match(api,/\.eq\("brand_id", scope.value.brandId\)/);
 assert.match(api,/\.eq\("visible", true\)/);
 assert.doesNotMatch(api,/from\("properties"\)\.update/);
});
test("recommendations and editorial data are not mixed with global properties",()=>{
 assert.match(sql,/primary key \(property_id, brand_key\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all .* from anon, authenticated/);
 assert.match(ui,/Anbefalt bolig/);
 assert.match(ui,/Forventes ferdig/);
});
