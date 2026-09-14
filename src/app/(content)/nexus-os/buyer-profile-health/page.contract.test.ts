import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/buyer-profile-health/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"), "utf8");

test("health page makes profile, evidence, freshness, match and review quality visible", () => {
  for (const value of ["Buyer Profile Health", "Komplett", "Evidens", "Ferskhet", "Datakvalitet", "Kundeklare", "Forbedre Buyer Profile"]) {
    assert.match(page, new RegExp(value, "i"));
  }
  assert.match(page, /read-only/i);
  assert.match(layout, /\/nexus-os\/buyer-profile-health/);
});
