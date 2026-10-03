import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/components/care/care-dashboard.tsx"),
  "utf8",
);

test("Care daily queue prioritizes due, stale, high-priority and new leads", () => {
  assert.match(source, /function careLeadAttentionScore/);
  assert.match(source, /careLeadFollowUpDue\(lead\).*score \+= 100/s);
  assert.match(source, /careLeadAgeHours\(lead\) >= 24.*score \+= 70/s);
  assert.match(source, /lead\.priority\.toUpperCase\(\) === "HIGH".*score \+= 50/s);
  assert.match(source, /lead\.salesStage === "new".*score \+= 35/s);
});

test("Care overview exposes a focused attention queue with direct CRM actions", () => {
  assert.match(source, /Prioriterte Care-henvendelser/);
  assert.match(source, /Krever handling/);
  assert.match(source, /CareLeadCard key=\{lead\.id\} lead=\{lead\} onOnboard=\{setOnboardingLead\} onFollowUp=\{setFollowupLead\}/);
  assert.match(source, /href=\{lead\.customerHref\}/);
});

test("Care steering metrics keep open and stale leads separate", () => {
  assert.match(source, /label: "Åpne Care-leads"/);
  assert.match(source, /label: "Leads over 24 t"/);
  assert.match(source, /label: "Tilbud må følges"/);
  assert.match(source, /label: "Tilsyn neste 7 dager"/);
  assert.match(source, /label: "MRR Care"/);
});

test("Care lead list can filter to items that need action", () => {
  assert.match(source, /const \[attentionOnly, setAttentionOnly\] = useState\(false\)/);
  assert.match(source, /attentionOnly && !careLeadNeedsAttention\(lead\)/);
  assert.match(source, /Krever handling \(\{attentionCount\}\)/);
});
