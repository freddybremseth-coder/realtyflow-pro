import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/(content)/nexus-os/morning-brief/page.tsx"),
  "utf8",
);

const layout = fs.readFileSync(
  path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"),
  "utf8",
);

test("Morning Brief reads canonical Nexus and Personal Intelligence attention sources", () => {
  assert.match(page, /\/api\/os\/status/);
  assert.match(page, /\/api\/revenue\/today/);
  assert.match(page, /\/api\/personal-intelligence\/today/);
});

test("Morning Brief remains read-only and preserves execution boundaries", () => {
  assert.doesNotMatch(page, /method:\s*["']POST["']/);
  assert.doesNotMatch(page, /method:\s*["']PUT["']/);
  assert.doesNotMatch(page, /method:\s*["']PATCH["']/);
  assert.doesNotMatch(page, /method:\s*["']DELETE["']/);
  assert.match(page, /Nexus owns business action/);
  assert.match(page, /Personal Intelligence owns memory and learning/);
  assert.match(page, /Source:/);
});

test("Nexus Mission Control exposes Morning Brief without replacing canonical Today", () => {
  assert.match(layout, /href:\s*["']\/nexus-os\/morning-brief["']/);
  assert.match(layout, /href:\s*["']\/nexus-os\/today["']/);
});
