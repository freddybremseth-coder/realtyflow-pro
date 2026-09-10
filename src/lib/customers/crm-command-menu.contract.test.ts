import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/customers/commands/route.ts"), "utf8");
const component = fs.readFileSync(path.join(process.cwd(), "src/components/crm/crm-command-menu.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/customers/page.tsx"), "utf8");
const nurtureApi = fs.readFileSync(path.join(process.cwd(), "src/lib/nurture-api.ts"), "utf8");

test("safe nurture-start command is admin-only and preview-first", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /mode === "preview"/);
  assert.match(component, /Forhåndsvis/);
  assert.match(component, /Start automatisk oppfølging/);
});

test("safe nurture-start command reuses canonical communication and sendability state", () => {
  assert.match(route, /buildCustomerCommunicationState/);
  assert.match(route, /state\.status !== "READY_NOT_STARTED"/);
  assert.match(route, /!state\.shouldReceiveEmail/);
  assert.match(route, /evaluateNurtureSendability/);
  assert.match(route, /normalizeNurtureEmail/);
  assert.match(route, /duplicateCounts/);
  assert.match(route, /blockedReasons/);
});

test("bulk execution is live-gated and capped", () => {
  assert.match(route, /isNurtureLiveEnabled/);
  assert.match(route, /const BATCH_SIZE = 25/);
  assert.match(route, /candidates\.slice\(0, BATCH_SIZE\)/);
  assert.match(route, /runNurtureCycle/);
  assert.match(route, /remaining/);
});

test("CRM command writes a non-PII audit summary and links result to Nexus", () => {
  assert.match(route, /crm_safe_nurture_command/);
  assert.match(route, /automation_logs/);
  assert.match(route, /agent_name: "crm_command_menu"/);
  assert.match(route, /blocked_reasons/);
  assert.match(route, /by_brand/);
  assert.doesNotMatch(route, /sample: preview\.sample/);
  assert.match(route, /nexusHref: "\/nexus-os\/communications"/);
  assert.match(component, /Se oppdatert nurture-resultat i Nexus Communications/);
});

test("nurture automation logs only use production-supported success/error statuses", () => {
  assert.match(nurtureApi, /status: result\.failed > 0 \? "error" : "success"/);
  assert.match(nurtureApi, /outcome/);
  assert.doesNotMatch(nurtureApi, /status: result\.failed > 0 \? "partial"/);
  assert.doesNotMatch(nurtureApi, /status: "failed"/);
});

test("CRM page exposes command menu and common filters", () => {
  assert.match(page, /CrmCommandMenu/);
  assert.match(page, /READY_NOT_STARTED/);
  assert.match(page, /REPLIED/);
  assert.match(page, /STOPPED/);
  assert.match(page, /NO_EMAIL/);
  assert.match(component, /Vis aktive kunder i pipeline/);
  assert.match(component, /Vis vunnet og tapt/);
});
