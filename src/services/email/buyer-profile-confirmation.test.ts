import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBuyerCriteriaLines,
  buildCriteriaConfirmationEmail,
  isAffirmativeCriteriaConfirmation,
  isBroadBuyerLocation,
} from "@/services/email/buyer-profile-confirmation";

test("buildBuyerCriteriaLines produces a concise customer-readable search summary", () => {
  const lines = buildBuyerCriteriaLines({
    budget: { amount: 450000, currency: "EUR" },
    locations: { preferred: ["Altea", "Albir"], excluded: [], flexible: false },
    propertyTypes: ["villa"],
    hardRequirements: [
      { key: "bedrooms", value: 3 },
      { key: "bathrooms", value: 2 },
    ],
    preferences: [
      { key: "pool", value: true },
    ],
    exclusions: [],
  });

  assert.ok(lines.some((line) => line.startsWith("Budsjett:")));
  assert.ok(lines.includes("Område: Altea, Albir"));
  assert.ok(lines.includes("Boligtype: villa"));
  assert.ok(lines.includes("Soverom: 3"));
  assert.ok(lines.includes("Bad: 2"));
  assert.ok(lines.includes("Basseng: Ja"));
});

test("confirmation email asks the customer to approve or correct specific criteria", () => {
  const email = buildCriteriaConfirmationEmail({
    customerName: "Kari Nordmann",
    analysis: {
      budget: { amount: 350000, currency: "EUR" },
      locations: { preferred: ["Villajoyosa"] },
      propertyTypes: ["apartment"],
      hardRequirements: [],
      preferences: [],
      exclusions: [],
    },
  });

  assert.equal(email.mode, "confirmation");
  assert.equal(email.requiresConfirmation, true);
  assert.match(email.bodyText, /Hei Kari,/);
  assert.match(email.bodyText, /Kan du bekrefte at dette er kriteriene/);
  assert.match(email.bodyText, /Ja, dette stemmer/);
  assert.match(email.confirmationContextText, /Kunden har eksplisitt bekreftet/);
});

test("broad country-only location becomes a natural clarification instead of a strange confirmation", () => {
  const email = buildCriteriaConfirmationEmail({
    customerName: "Bård Hansen",
    analysis: {
      locations: { preferred: ["Spain"] },
      propertyTypes: [],
      hardRequirements: [],
      preferences: [],
      exclusions: [],
    },
  });

  assert.equal(email.mode, "location_clarification");
  assert.equal(email.requiresConfirmation, false);
  assert.equal(email.subject, "Hvilket område i Spania er mest aktuelt?");
  assert.match(email.bodyText, /ser etter bolig i Spania/);
  assert.match(email.bodyText, /Hvilke områder eller byer er mest aktuelle/);
  assert.doesNotMatch(email.bodyText, /Kan du bekrefte at dette er kriteriene/);
  assert.doesNotMatch(email.bodyText, /Ja, dette stemmer/);
  assert.equal(email.confirmationContextText, "");
});

test("broad location clarification preserves useful known criteria without asking to confirm Spain", () => {
  const email = buildCriteriaConfirmationEmail({
    customerName: "Bård Hansen",
    analysis: {
      budget: { amount: 500000, currency: "EUR" },
      locations: { preferred: ["Spain"] },
      propertyTypes: ["villa"],
      hardRequirements: [{ key: "bedrooms", value: 3 }],
      preferences: [],
      exclusions: [],
    },
  });

  assert.equal(email.mode, "location_clarification");
  assert.match(email.bodyText, /Budsjett: EUR 500[ .]?000/);
  assert.match(email.bodyText, /Boligtype: villa/);
  assert.match(email.bodyText, /Soverom: 3/);
  assert.doesNotMatch(email.bodyText, /– Område: Spain/);
});

test("broad location detector covers country and over-broad regional values", () => {
  assert.equal(isBroadBuyerLocation("Spain"), true);
  assert.equal(isBroadBuyerLocation("Spania"), true);
  assert.equal(isBroadBuyerLocation("España"), true);
  assert.equal(isBroadBuyerLocation("Costa Blanca"), true);
  assert.equal(isBroadBuyerLocation("Altea"), false);
  assert.equal(isBroadBuyerLocation("Villajoyosa"), false);
});

test("short explicit confirmations are accepted", () => {
  assert.equal(isAffirmativeCriteriaConfirmation("Ja, dette stemmer."), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Stemmer, takk!"), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Yes, that is correct."), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Sí, correcto."), true);
});

test("corrections and ambiguous replies never count as confirmation", () => {
  assert.equal(isAffirmativeCriteriaConfirmation("Ja, men budsjettet er 500000"), false);
  assert.equal(isAffirmativeCriteriaConfirmation("Nei, området skal være Albir"), false);
  assert.equal(isAffirmativeCriteriaConfirmation("Det ser greit ut, men jeg er ikke sikker"), false);
});
