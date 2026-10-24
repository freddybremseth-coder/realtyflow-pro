import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(),"src/app/(realty)/inventory/page.tsx"),"utf8");
const upload = fs.readFileSync(path.join(process.cwd(),"src/app/api/properties/floorplans/upload/route.ts"),"utf8");
const migration = fs.readFileSync(path.join(process.cwd(),"supabase/migrations/20261024130000_property_expected_completion.sql"),"utf8");

test("manual completion is editable and displays a safe fallback", () => {
  assert.match(page, /expectedCompletionManual/);
  assert.match(page, /expected_completion_manual/);
  assert.match(page, /Ta kontakt for informasjon om planlagt ferdigstillelse/);
  assert.match(migration, /expected_completion_source text/);
  assert.match(migration, /expected_completion_manual text/);
});
test("plans are stored separately and uploaded through guarded server API", () => {
  assert.match(page, /floorplans: \[\.\.\.new Set/);
  assert.match(page, /api\/properties\/floorplans\/upload/);
  assert.match(upload, /requireAdminApi\(req\)/);
  assert.match(upload, /8 \* 1024 \* 1024/);
  assert.match(upload, /image\/png/);
  assert.match(upload, /\.from\(BUCKET\)\.upload/);
});
