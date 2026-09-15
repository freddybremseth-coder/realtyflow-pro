import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/(realty)/today/page.tsx", "utf8");

test("Revenue Today presents commission as primary economics", () => {
  assert.match(source, /Kjent provisjon/);
  assert.match(source, /Provisjonsdekning/);
  assert.match(source, /knownCommissionRevenue/);
  assert.match(source, /commissionCoveragePct/);
  assert.match(source, /commissionRevenue/);
});

test("transaction value remains secondary context and raw value is not promoted", () => {
  assert.match(source, /Transaksjonsverdi/);
  assert.match(source, /item\.transactionValue/);
  assert.match(source, /Provisjon ikke registrert/);
  assert.doesNotMatch(source, /Pipeline-verdi/);
  assert.doesNotMatch(source, /formatCurrency\(item\.value\)/);
});
