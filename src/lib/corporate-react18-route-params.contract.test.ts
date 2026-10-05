import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const files = [
  "src/app/(business)/corporate-homes/prospects/[id]/page.tsx",
  "src/app/(business)/corporate-homes/partners/[id]/page.tsx",
  "src/app/(realty)/workspace/[brandKey]/corporate/[prospectId]/page.tsx",
];

test("Corporate client routes use Next 14 compatible route params", () => {
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /useParams/);
    assert.doesNotMatch(source, /\buse\(params\)/);
    assert.doesNotMatch(source, /params:\s*Promise</);
    assert.doesNotMatch(source, /import\s*\{[^}]*\buse\s*,/);
  }
});
