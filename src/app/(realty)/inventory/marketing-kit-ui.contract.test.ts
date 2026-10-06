import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/(realty)/inventory/page.tsx"),
  "utf8",
);

test("AI selling copy is not line-clamped", () => {
  assert.doesNotMatch(
    source,
    /marketing_description[\s\S]{0,700}line-clamp-6/,
  );
  assert.match(source, /Hele teksten vises her og kan scrolles, kopieres eller lastes ned\./);
});

test("marketing kit content blocks support scrolling and text download", () => {
  assert.match(source, /safeDownloadStem\(field\)/);
  assert.match(source, /max-h-56 bg-slate-950\/25 p-2\.5/);
  assert.match(source, />Last ned<\/button>|Last ned\s*<\/button>/);
});
