import assert from "node:assert/strict";
import test from "node:test";
import { unsupportedOutcomeClaims } from "./claim-guard";

test("blocks unsourced modern property wording", () => {
  assert.deepEqual(
    unsupportedOutcomeClaims("En moderne villa med 3 soverom.", []),
    ["modern property"],
  );
});

test("allows modern property wording when Inventory explicitly supports it", () => {
  assert.deepEqual(
    unsupportedOutcomeClaims(
      "En moderne villa med 3 soverom.",
      [{ claim: "Beskrivelse: moderne villa med privat basseng", source: "Inventory N1234" }],
    ),
    [],
  );
});

test("blocks energy-efficient property inference without explicit source", () => {
  assert.deepEqual(
    unsupportedOutcomeClaims(
      "En energieffektiv bolig med energimerking B.",
      [{ claim: "Energimerking: B", source: "Inventory N1234" }],
    ),
    ["energy-efficient property"],
  );
});

test("blocks unsourced luxury and exclusive property wording", () => {
  const claims = unsupportedOutcomeClaims("Eksklusiv villa og luksuriøs bolig nær stranden.", []);
  assert.ok(claims.includes("exclusive property"));
  assert.ok(claims.includes("luxury property"));
});

test("does not treat generic modern workflow language as a property claim", () => {
  assert.deepEqual(
    unsupportedOutcomeClaims("Vi bruker en moderne arbeidsflyt for oppfølging av kjøpere.", []),
    [],
  );
});
