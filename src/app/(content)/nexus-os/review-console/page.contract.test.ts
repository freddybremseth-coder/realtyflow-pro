import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/review-console/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"), "utf8");

test("Freddy Review Console renders every locked-plan decision surface", () => {
  for (const value of ["Kunde og Buyer Profile", "Match og shortlist", "presentasjon og e-postutkast", "Anbefaling og usikkerhet", "Godkjenn send", "Avvis", "Rediger / review", "Be kunden avklare"]) {
    assert.match(page, new RegExp(value, "i"));
  }
});

test("send approval delegates to the governed final-review route and states the preflight consequence", () => {
  assert.match(page, /\/api\/nexus\/presentation-reviews/);
  assert.match(page, /explicitApproval: true/);
  assert.match(page, /ny, grønn send-preflight/);
  assert.doesNotMatch(page, /sendBrandEmail/);
});

test("Nexus navigation includes Freddy Review Console", () => {
  assert.match(layout, /\/nexus-os\/review-console/);
  assert.match(layout, /Freddy Review/);
});
