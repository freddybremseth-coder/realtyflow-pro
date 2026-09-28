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


test("Corporate Growth deep link focuses the exact candidate without auto-creating it", () => {
  const corporatePage = fs.readFileSync(
    "src/app/(business)/corporate-homes/page.tsx",
    "utf8",
  );
  const improvementPage = fs.readFileSync(
    "src/app/(realty)/continuous-improvement/page.tsx",
    "utf8",
  );

  assert.match(corporatePage, /corporateGrowthCandidateId/);
  assert.match(corporatePage, /continuous-improvement\?candidate=/);

  assert.match(improvementPage, /URLSearchParams\(window\.location\.search\)/);
  assert.match(improvementPage, /focusCandidateId/);
  assert.match(improvementPage, /existingImprovementId/);
  assert.match(improvementPage, /candidate-\$\{candidate\.id\}/);
  assert.match(improvementPage, /improvement-detail/);
  assert.match(improvementPage, /Åpnet fra Corporate Growth Review/);
  assert.match(improvementPage, /må fortsatt opprettes manuelt/);
  assert.doesNotMatch(improvementPage, /useSearchParams/);
});


test("Corporate overview reads tracked improvement status without creating or updating it", () => {
  const overview = fs.readFileSync(
    "src/app/api/corporate-homes/overview/route.ts",
    "utf8",
  );
  const page = fs.readFileSync(
    "src/app/(business)/corporate-homes/page.tsx",
    "utf8",
  );

  assert.match(overview, /CONTINUOUS_IMPROVEMENT_SETTINGS_KEY/);
  assert.match(overview, /WEEKLY_MANAGEMENT_SETTINGS_KEY/);
  assert.match(overview, /buildContinuousImprovementRegister/);
  assert.match(overview, /corporateGrowthCandidateId/);
  assert.match(overview, /item\.candidateId === candidateId/);
  assert.match(overview, /effectTrend: tracked\.effect\.trend/);
  assert.doesNotMatch(overview, /CREATE_IMPROVEMENT|IMPROVEMENT_CREATED|\.upsert\(/);

  assert.match(page, /Åpne forbedringstiltak/);
  assert.match(page, /Tiltaksstatus/);
  assert.match(page, /Ansvarlig/);
  assert.match(page, /Frist/);
  assert.match(page, /Tiltak \/ rotårsak/);
  assert.match(page, /forfalt/);
});
