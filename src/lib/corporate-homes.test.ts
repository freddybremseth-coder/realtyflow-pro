import test from "node:test";
import assert from "node:assert/strict";
import { corporateLeadProfile, isCorporateHomeLead, parseBudgetEstimate } from "./corporate-homes";

test("parseBudgetEstimate handles formatted EUR ranges", () => {
  assert.equal(parseBudgetEstimate("€300 000–€500 000"), 400000);
  assert.equal(parseBudgetEstimate("€500 000–€750 000"), 625000);
  assert.equal(parseBudgetEstimate("Over €1 000 000"), 1000000);
  assert.equal(parseBudgetEstimate("Ikke avklart"), 0);
});

test("corporate source and request markers are detected", () => {
  assert.equal(isCorporateHomeLead({ source: "zeneco-corporate-homes" }), true);
  assert.equal(isCorporateHomeLead({ notes: "Forespørsel: corporate-home" }), true);
  assert.equal(isCorporateHomeLead({ notes: "Vanlig boligkunde i Altea" }), false);
});

test("corporate profile extracts organisation data and prioritizes strong B2B leads", () => {
  const profile = corporateLeadProfile({
    source: "zeneco-corporate-homes",
    pipeline_status: "NEW",
    pipeline_value: 625000,
    notes: [
      "Forespørsel: corporate-home",
      "Virksomhet/organisasjon: Example AS",
      "Type: Bedrift",
      "Antall ansatte/medlemmer: 75",
      "Rolle: Daglig leder",
      "Ønsket modell: Bedriftshytte for ansatte",
      "Budsjett: €500 000–€750 000",
      "Tidslinje: 3–12 måneder",
      "Behov: Moderne bolig nær Alicante.",
    ].join("\n"),
  });

  assert.equal(profile.isCorporate, true);
  assert.equal(profile.organization, "Example AS");
  assert.equal(profile.users, 75);
  assert.equal(profile.role, "Daglig leder");
  assert.equal(profile.priority, "CRITICAL");
  assert.ok(profile.score >= 85);
  assert.match(profile.nextAction, /discovery/i);
});
