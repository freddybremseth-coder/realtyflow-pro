import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/customers/commands/route.ts"), "utf8");
const component = fs.readFileSync(path.join(process.cwd(), "src/components/crm/crm-command-menu.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/customers/page.tsx"), "utf8");

test("bulk first-email command is admin-only and preview-first", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /mode === "preview"/);
  assert.match(component, /Forhåndsvis/);
  assert.match(component, /Send trygg batch nå/);
});

test("safe first-email command reuses canonical communication state", () => {
  assert.match(route, /buildCustomerCommunicationState/);
  assert.match(route, /state\.status !== "READY_NOT_STARTED"/);
  assert.match(route, /!state\.shouldReceiveEmail/);
  assert.match(route, /duplicateCounts/);
  assert.match(route, /validSingleEmail/);
});

test("bulk execution is live-gated and capped", () => {
  assert.match(route, /isNurtureLiveEnabled/);
  assert.match(route, /candidates\.slice\(0, 25\)/);
  assert.match(route, /runNurtureCycle/);
  assert.match(route, /remaining:/);
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
