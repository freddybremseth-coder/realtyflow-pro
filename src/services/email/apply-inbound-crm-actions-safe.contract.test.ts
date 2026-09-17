import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./apply-inbound-crm-actions-safe.ts", import.meta.url), "utf8");
const tsconfig = fs.readFileSync(new URL("../../../tsconfig.json", import.meta.url), "utf8");

test("all canonical inbound CRM imports route through the safe resolver", () => {
  assert.match(tsconfig, /@\/services\/email\/apply-inbound-crm-actions/);
  assert.match(tsconfig, /apply-inbound-crm-actions-safe\.ts/);
});

test("safe resolver blocks duplicate or cross-brand identities before mutation", () => {
  assert.match(source, /rows\.length === 1/);
  assert.match(source, /String\(rows\[0\]\.brand_id/);
  assert.match(source, /if \(!resolved\) return unresolvedResult/);
  assert.match(source, /applyResolvedInboundCrmActions/);
});
