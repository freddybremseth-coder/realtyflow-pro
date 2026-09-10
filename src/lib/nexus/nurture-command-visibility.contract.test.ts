import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const api = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/communications/nurture/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/communications/nurture/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"), "utf8");
const crm = fs.readFileSync(path.join(process.cwd(), "src/components/crm/crm-command-menu.tsx"), "utf8");

test("Nexus nurture control is admin-only and read-only", () => {
  assert.match(api, /requireAdminApi/);
  assert.match(api, /readOnly: true/);
  assert.doesNotMatch(api, /export async function POST/);
  assert.doesNotMatch(page, /Start automatisk oppfølging \(maks/);
  assert.match(page, /Start av nye bulk-batcher skjer fortsatt eksplisitt fra CRM/);
});

test("Nexus nurture control reads canonical audit and nurture history", () => {
  assert.match(api, /crm_safe_nurture_command/);
  assert.match(api, /automation_logs/);
  assert.match(api, /lead_nurture_events/);
  assert.match(api, /feature:nurture_live/);
  assert.match(api, /nurture7d/);
  assert.match(api, /nurture30d/);
});

test("Nexus API exposes only sanitized command summary fields", () => {
  assert.match(api, /candidateCount/);
  assert.match(api, /blockedReasons/);
  assert.match(api, /byBrand/);
  assert.match(api, /started/);
  assert.match(api, /remaining/);
  assert.doesNotMatch(api, /email:/);
  assert.doesNotMatch(api, /name:/);
  assert.doesNotMatch(api, /contactId/);
});

test("Nurture Control is discoverable from Nexus and CRM", () => {
  assert.match(layout, /\/nexus-os\/communications\/nurture/);
  assert.match(layout, /Nurture Control/);
  assert.match(crm, /href="\/nexus-os\/communications\/nurture"/);
  assert.match(crm, /Se detaljert nurture-resultat i Nexus/);
});

test("Nexus UI shows outcome, blocks, brand distribution and run history", () => {
  assert.match(page, /Siste CRM-kontroll/);
  assert.match(page, /Fordeling per merkevare/);
  assert.match(page, /Blokkert av sikkerhetsport/);
  assert.match(page, /Siste kontroller og starter/);
  assert.match(page, /Nurture-resultat per merkevare/);
});
