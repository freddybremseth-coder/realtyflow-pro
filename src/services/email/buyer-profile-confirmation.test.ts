import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBuyerCriteriaLines,
  buildCriteriaConfirmationEmail,
  isAffirmativeCriteriaConfirmation,
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

test("confirmation email asks the customer to approve or correct the criteria", () => {
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

  assert.match(email.bodyText, /Hei Kari,/);
  assert.match(email.bodyText, /Kan du bekrefte at dette er kriteriene/);
  assert.match(email.bodyText, /Ja, dette stemmer/);
  assert.match(email.confirmationContextText, /Kunden har eksplisitt bekreftet/);
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
