import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Continuous Improvement surfaces Corporate Growth candidates but keeps creation manual", () => {
  const source = fs.readFileSync(
    "src/app/api/revenue/command/continuous-improvement/route.ts",
    "utf8",
  );
  const getStart = source.indexOf("export async function GET");
  const postStart = source.indexOf("export async function POST");
  assert.ok(getStart >= 0 && postStart > getStart);
  const getSource = source.slice(getStart, postStart);

  assert.match(source, /buildCorporateGrowthImprovementCandidate/);
  assert.match(source, /corporate_homes_growth_review/);
  assert.match(source, /\.limit\(8\)/);
  assert.match(source, /additionalCandidates/);
  assert.match(source, /action === "CREATE_IMPROVEMENT"/);
  assert.match(source, /candidateById\(register, candidateId\)/);

  assert.doesNotMatch(getSource, /saveSettings|makeImprovementEvent|IMPROVEMENT_CREATED|\.upsert\(/);
});
