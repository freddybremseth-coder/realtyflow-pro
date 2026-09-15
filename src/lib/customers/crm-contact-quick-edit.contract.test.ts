import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const cardSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/crm/crm-customer-card.tsx"),
  "utf8",
);
const updatePanelSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/customers/customer-update-panel.tsx"),
  "utf8",
);

test("CRM customer card exposes direct contact-info editing from the header", () => {
  assert.match(cardSource, /Rediger kontaktinfo/);
  assert.match(cardSource, /function openContactDetails\(\)/);
  assert.match(cardSource, /setUpdateDefaultTab\("details"\)/);
  assert.match(cardSource, /onClick=\{openContactDetails\}/);
});

test("missing email or phone exposes a direct add shortcut", () => {
  assert.match(cardSource, /Legg til e-post/);
  assert.match(cardSource, /Legg til telefon/);
  assert.match(cardSource, /data\.contact\.email \?/);
  assert.match(cardSource, /data\.contact\.phone \?/);
});

test("direct edit reuses the existing CustomerUpdatePanel instead of a second CRM writer", () => {
  assert.match(cardSource, /<CustomerUpdatePanel/);
  assert.match(cardSource, /defaultTab=\{updateDefaultTab\}/);
  assert.match(updatePanelSource, /action: "UPDATE_DETAILS"/);
  assert.match(updatePanelSource, /email:/);
  assert.match(updatePanelSource, /phone:/);
  assert.doesNotMatch(cardSource, /fetch\("\/api\/contacts"[\s\S]*method:\s*"PATCH"/);
});

test("normal Details & update navigation still opens the activity-update flow", () => {
  assert.match(cardSource, /function openCustomerUpdate\(\)/);
  assert.match(cardSource, /setUpdateDefaultTab\("update"\)/);
  assert.match(cardSource, /id === "update" \? openCustomerUpdate\(\)/);
});
