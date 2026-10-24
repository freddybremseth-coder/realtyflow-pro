import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/inventory/import-insights/page.tsx"), "utf8");

test("import insights use brand-scoped catalogue without broad property API", () => {
  assert.match(page, /\/api\/workspaces\/\$\{encodeURIComponent\(brand\)\}\/properties/);
  assert.doesNotMatch(page, /fetch\(\s*["'`]\/api\/properties/);
  assert.doesNotMatch(page, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
});
test("cards do not claim unverified availability, price or inferred new build", () => {
  assert.match(page, /Tilgjengelighet og pris må bekreftes/);
  assert.doesNotMatch(page, />Nybygg</);
  assert.match(page, /plot_size/);
  assert.match(page, /plot_included_in_price/);
});
test("field coverage explicitly scoped to currently displayed page", () => {
  assert.match(page, /kun den viste siden/);
  assert.match(page, /properties\.length/);
});
