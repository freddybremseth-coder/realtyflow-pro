import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const library = fs.readFileSync("src/lib/corporate-organic-content.ts", "utf8");
const runner = fs.readFileSync("src/lib/corporate-homes-content-runner.ts", "utf8");
const cron = fs.readFileSync("src/app/api/cron/corporate-homes-content-drafts/route.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const registry = fs.readFileSync("src/lib/automation/registry.ts", "utf8");
const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

test("Corporate Homes organic library contains 23 approved guide topics", () => {
  const slugs = library.match(/slug: "/g) || [];
  assert.equal(slugs.length, 23);
  assert.match(library, /corporateOrganicTopicsForWeek/);
  assert.match(library, /buildCorporateOrganicCopy/);
});

test("Corporate Homes content engine creates drafts only", () => {
  assert.match(runner, /status:\s*"draft"/);
  assert.match(runner, /scheduled_platforms:\s*\["linkedin",\s*"facebook"\]/);
  assert.match(runner, /external_publish_started:\s*false/);
  assert.doesNotMatch(runner, /status:\s*"published"/);
});

test("Corporate Homes content engine is weekly and safe-mode guarded", () => {
  assert.match(vercel, /\/api\/cron\/corporate-homes-content-drafts/);
  assert.match(vercel, /40 6 \* \* 1/);
  assert.match(cron, /evaluateCronSafeMode\(CORPORATE_CONTENT_PATH\)/);
  assert.match(registry, /Corporate Homes content drafts/);
  assert.match(registry, /draft-first/);
});

test("Corporate Homes dashboard exposes run-now draft generation", () => {
  assert.match(page, /Corporate Content Engine/);
  assert.match(page, /Lag ukens 3 utkast/);
  assert.match(page, /\/api\/corporate-homes\/content\/run/);
  assert.match(page, /Ingenting publiseres eksternt/);
});
