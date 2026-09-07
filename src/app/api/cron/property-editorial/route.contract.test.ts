import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/property-editorial/route.ts"),
  "utf8",
);
const diagnostics = fs.readFileSync(
  path.join(process.cwd(), "src/lib/realty/property-editorial-ai-diagnostics.ts"),
  "utf8",
);

test("property editorial worker is cron protected and processes small batches", () => {
  assert.match(route, /requireCronApi\(request\)/);
  assert.match(route, /const JOB_LIMIT = 6/);
  assert.match(route, /\.limit\(JOB_LIMIT\)/);
});

test("worker reuses unchanged hashes and retries failures with a bounded attempt count", () => {
  assert.match(route, /existingEditorialHasSameSource/);
  assert.match(route, /const MAX_ATTEMPTS = 5/);
  assert.match(route, /status: exhausted \? "failed" : "retry"/);
  assert.match(route, /retryAt\(attempts\)/);
});

test("worker includes facing in factual input and records safe AI provenance", () => {
  assert.match(route, /facing_source/);
  assert.match(route, /generatePropertyEditorialNoDiagnosed/);
  assert.match(route, /generation_mode: usedFallback \? "template" : "ai"/);
  assert.match(route, /configured_ai_providers: providers/);
  assert.match(route, /fallback_reason: fallbackReason/);
  assert.doesNotMatch(route, /ANTHROPIC_API_KEY\s*[:=]\s*["'][^"']+["']/);
  assert.doesNotMatch(route, /GEMINI_API_KEY\s*[:=]\s*["'][^"']+["']/);
  assert.doesNotMatch(route, /OPENAI_API_KEY\s*[:=]\s*["'][^"']+["']/);
});

test("diagnosed generator distinguishes provider failure from invalid output and accepts JSON fences", () => {
  assert.match(diagnostics, /"no_ai_provider"/);
  assert.match(diagnostics, /"provider_chain_unavailable"/);
  assert.match(diagnostics, /"invalid_output"/);
  assert.match(diagnostics, /stripJsonFence/);
  assert.match(diagnostics, /```\(\?:json\)\?/);
  assert.match(diagnostics, /fallbackOnInvalidResponse: true/);
});
