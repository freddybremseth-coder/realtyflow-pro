import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/components/care/care-dashboard.tsx"),
  "utf8",
);

test("Care lead actions deep-link to the exact Care property", () => {
  assert.match(source, /\/care\/customers#care-property-\$\{lead\.carePropertyId\}/);
  assert.match(source, /Se Care-kunde/);
});

test("Care operations queue opens the exact property when it has one", () => {
  assert.match(source, /item\.propertyId \? `\/care\/customers#care-property-\$\{item\.propertyId\}` : item\.href/);
});

test("Care customer cards expose stable property anchors and visual focus", () => {
  assert.match(source, /id=\{`care-property-\$\{property\.id\}`\}/);
  assert.match(source, /scroll-mt-24/);
  assert.match(source, /target:border-cyan-400/);
});
