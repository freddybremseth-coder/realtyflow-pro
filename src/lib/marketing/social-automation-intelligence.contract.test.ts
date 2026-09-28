import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const readiness = fs.readFileSync(path.join(process.cwd(), "src/app/api/marketing/readiness/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/social-automation/page.tsx"), "utf8");

test("readiness exposes actionable learning evidence and unified business performance", () => {
  assert.match(readiness, /loadUnifiedGrowthScore/);
  assert.match(readiness, /avg_business_value/);
  assert.match(readiness, /evidenceWeight/);
  assert.match(readiness, /nextBehavior/);
  assert.match(readiness, /freshness/);
  assert.match(readiness, /avg_qualified_lead_rate/);
  assert.match(readiness, /total_leads/);
  assert.match(readiness, /total_sales/);
  assert.match(readiness, /learningInsights/);
  assert.match(readiness, /performanceSummary/);
});

test("social automation explains what Nexus learned using persisted rules", () => {
  assert.match(page, /What Nexus learned/);
  assert.match(page, /Dokumentert læring som påvirker neste innhold/);
  assert.match(page, /insight\.verdict/);
  assert.match(page, /insight\.finding/);
  assert.match(page, /Evidens:/);
  assert.match(page, /Dette endrer Nexus:/);
  assert.match(page, /insight\.nextBehavior/);
  assert.match(page, /insight\.freshness/);
});

test("performance surface shows business outcomes instead of reach-only status", () => {
  assert.match(page, /From oppmerksomhet|Fra oppmerksomhet til business-resultat/);
  assert.match(page, /portfolio\?\.funnel\.leads/);
  assert.match(page, /portfolio\?\.funnel\.qualifiedLeads/);
  assert.match(page, /portfolio\?\.funnel\.sales/);
  assert.match(page, /attributionCoveragePct/);
});

test("learning/performance surface stays read-only", () => {
  assert.doesNotMatch(page, /fetch\([^\n]*(POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(readiness, /marketing_learning_rules"[\s\S]*\.update\(/);
  assert.doesNotMatch(readiness, /marketing_learning_rules"[\s\S]*\.insert\(/);
});
