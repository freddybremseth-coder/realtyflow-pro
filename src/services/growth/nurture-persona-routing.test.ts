import assert from "node:assert/strict";
import test from "node:test";
import { resolveNurtureSequenceWithPersona } from "@/services/growth/nurture-persona-routing";
import { renderTemplate } from "@/services/growth/nurture-sequences";

test("ZenEco keeps base sequence when no approved routing persona is supplied", () => {
  const sequence = resolveNurtureSequenceWithPersona("zeneco", "zeneco-import", null);
  assert.ok(sequence);
  assert.equal(sequence.id, "zeneco-buyer-v1");
});

test("approved investor persona changes ZenEco sequence identity and first message", () => {
  const sequence = resolveNurtureSequenceWithPersona("zeneco", "zeneco-import", "investor");
  assert.ok(sequence);
  assert.equal(sequence.id, "zeneco-buyer-v1:persona:investor");
  assert.match(sequence.steps[0].subject, /investeringsboliger/i);
  assert.match(sequence.steps[0].text, /investering eller utleie/i);
});

test("unrecognized persona never changes nurture copy", () => {
  const sequence = resolveNurtureSequenceWithPersona("zeneco", "zeneco-import", "made_up_persona");
  assert.ok(sequence);
  assert.equal(sequence.id, "zeneco-buyer-v1");
});

test("Soleada relationship ownership always wins over persona routing", () => {
  const sequence = resolveNurtureSequenceWithPersona("soleada", "soleada-import", "investor");
  assert.ok(sequence);
  assert.equal(sequence.sendBrandId, "zeneco");
  assert.equal(sequence.fromName, "Freddy Bremseth – Zen Eco Homes");
  assert.deepEqual(sequence.eligibleStatuses, ["NEW", "CONTACT", "QUALIFIED", ""]);
  assert.equal(sequence.maxNewEnrollmentsPerRun, 25);
  assert.equal(sequence.steps[0].subject, "Er bolig i Spania fortsatt aktuelt for deg?");
  assert.doesNotMatch(sequence.steps[0].subject, /\{name\}/);
  assert.match(sequence.steps[0].text, /kundeforholdet og et eventuelt boligsalg ligger fortsatt hos Soleada\.no/i);
});

test("historical Casaverano source is internal and never appears in outward ZenEco copy", () => {
  const sequence = resolveNurtureSequenceWithPersona("zeneco", "casaverano-import", "holiday_home");
  assert.ok(sequence);
  const rendered = renderTemplate(sequence.steps[0].text, {
    name: "Kari Nordmann",
    brand: sequence.brandName,
    advisor: sequence.advisor,
    booking_url: sequence.bookingUrl,
  });
  assert.doesNotMatch(rendered, /casaverano/i);
  assert.match(rendered, /Zen Eco Homes/i);
});
