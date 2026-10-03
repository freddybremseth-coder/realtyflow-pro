import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/care/care-dashboard.tsx", "utf8");

test("Care key workspace can register a key against a Care property", () => {
  assert.match(source, /Registrer og spor Care-nøkler/);
  assert.match(source, /fetch\("\/api\/care\/keys"/);
  assert.match(source, /propertyId, label, storageLocation/);
  assert.match(source, /Full adresse skal ikke brukes som nøkkelmerking/);
});

test("Care key workspace supports check-out and check-in with holder context", () => {
  assert.match(source, /"checked_out" \| "checked_in" \| "lost" \| "retired"/);
  assert.match(source, /Hvem får nøkkelen\?/);
  assert.match(source, /Årsak, f\.eks\. rørlegger/);
  assert.match(source, />Sjekk ut</);
  assert.match(source, />Sjekk inn</);
});

test("Care key workspace can mark keys lost or retired and reload dashboard state", () => {
  assert.match(source, /Marker mistet/);
  assert.match(source, /Ta ut av bruk/);
  assert.match(source, /await onReload\(\)/);
  assert.match(source, /properties=\{dashboard\.properties\} onReload=\{load\}/);
});
