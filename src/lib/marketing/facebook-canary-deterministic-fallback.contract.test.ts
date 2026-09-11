import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/marketing/campaign-draft/route.ts"), "utf8");
const production = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/campaign-production.ts"), "utf8");

test("manual-review Canary switches the final recoverable copy retry to deterministic Inventory copy", () => {
  assert.match(route, /attempt === maxAttempts/);
  assert.match(route, /isRecoverableCopyError\(previousErrors\)/);
  assert.match(route, /deterministicInventoryCopy: deterministicInventoryFallback/);
});

test("deterministic Inventory fallback bypasses AI prose generation", () => {
  assert.match(production, /makeDeterministicInventoryCreative/);
  assert.match(production, /input\.deterministicInventoryCopy\s*\? makeDeterministicInventoryCreative/);
  assert.match(production, /generatedBy: "deterministic-inventory-fallback"/);
  assert.match(production, /model: "none"/);
  assert.match(production, /promptVersion: "inventory-fallback-1\.0"/);
});

test("deterministic Inventory fallback only emits whitelisted literal source facts", () => {
  assert.match(production, /DETERMINISTIC_INVENTORY_FACT_PREFIXES/);
  assert.match(production, /"Energimerking:"/);
  assert.doesNotMatch(production, /deterministic-inventory-fallback[^]*energieffektivitet/i);
  assert.match(production, /factSources: safeFacts/);
  assert.match(production, /cta: undefined/);
});

test("deterministic fallback stays inside the existing quality and manual-review orchestration", () => {
  assert.match(production, /await dispatchGeneratedAsset/);
  assert.match(production, /reuseMode = input\.deterministicInventoryCopy \? "inventory_deterministic_fallback"/);
  assert.match(route, /const unexpected = res\.results\.find\(\(item\) => item\.mode !== "manual-review"\)/);
});
