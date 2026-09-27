import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Corporate dossier exposes direct internal CRM and Closing handoff", () => {
  const source = fs.readFileSync("src/app/(business)/corporate-homes/prospects/[id]/page.tsx", "utf8");
  assert.match(source, /Legg i CRM/);
  assert.match(source, /promoteProspectToCrm/);
  assert.match(source, /\/api\/corporate-homes\/prospects\/\$\{encodeURIComponent\(id\)\}\/promote/);
  assert.match(source, /Fortsett i Closing/);
  assert.match(source, /href="\/closing"/);
  assert.match(source, /Automatisk nurture er fortsatt pauset/);
});
