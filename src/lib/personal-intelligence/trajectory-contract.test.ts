import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildTrajectory } from "./trajectory-service";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/trajectory/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/trajectory/page.tsx"), "utf8");

test("trajectory endpoint is owner-only and read-only", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /writesPerformed: 0/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("trajectory only consumes validated or canonical claims", () => {
  assert.match(route, /\.in\("status", \["validated", "canonical"\]\)/);
});

test("trajectory avoids personality scoring and LLM temporal inference", () => {
  assert.doesNotMatch(route + page, /askClaude|askOpenAI|personality_score|overall_score/i);
  assert.match(page, /No LLM temporal inference/i);
  assert.match(page, /Unknown stays unknown/i);
});

test("trajectory uses explicit past evidence and goals for future", () => {
  const data = buildTrajectory([
    {
      id: "past", predicate: "history_turning_point", value_text: "Moved abroad", claim_type: "fact", status: "canonical",
      confidence: 0.99, privacy_level: "private", source_id: "source-1", source_excerpt: "I moved abroad", valid_from: null,
      valid_to: null, confirmed_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "current", predicate: "interest_finance", value_text: "Interested in finance", claim_type: "interest", status: "validated",
      confidence: 0.9, privacy_level: "internal", source_id: "source-2", source_excerpt: null, valid_from: null,
      valid_to: null, confirmed_at: null, updated_at: "2026-01-01T00:00:00Z",
    },
  ], [{
    id: "goal", title: "Learn Spanish", description: null, domain: "learning", goal_type: "development", priority: 1,
    status: "idea", target_date: null, why_it_matters: "Live well in Spain", privacy_level: "private", updated_at: "2026-01-01T00:00:00Z",
  }], new Date("2026-09-04T00:00:00Z"));

  assert.equal(data.historical.length, 1);
  assert.equal(data.current.length, 1);
  assert.equal(data.future.length, 1);
  assert.equal(data.future[0]?.status, "idea");
  assert.equal(data.principles.goalIsNotPrediction, true);
});
