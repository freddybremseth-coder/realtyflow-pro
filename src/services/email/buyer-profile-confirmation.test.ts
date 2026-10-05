import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBuyerCriteriaLines,
  buildCriteriaConfirmationEmail,
  buildBuyerPriorityQuestion,
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
  assert.match(email.bodyText, /Ser dette riktig ut\?/);
  assert.match(email.bodyText, /beliggenhet, standard eller pris/);
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
  assert.equal(email.subject, "Hvilket område skal jeg prioritere i boligsøket?");
  assert.match(email.bodyText, /bredt område registrert/);
  assert.match(email.bodyText, /Hvilke 1–3 områder eller byer er mest aktuelle/);
  assert.doesNotMatch(email.bodyText, /Ser dette riktig ut\?/);
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
  assert.match(email.bodyText, /Budsjett: EUR 500\s?000/u);
  assert.match(email.bodyText, /Boligtype: villa/);
  assert.match(email.bodyText, /Soverom: 3/);
  assert.doesNotMatch(email.bodyText, /– Område: Spain/);
});

test("confirmation email asks only for high-value missing information", () => {
  const email = buildCriteriaConfirmationEmail({
    customerName: "Roy",
    analysis: {
      budget: { amount: null, currency: "EUR" },
      locations: { preferred: ["Punta Prima"] },
      propertyTypes: [],
      hardRequirements: [{ key: "bedrooms", value: 2 }],
      preferences: [{ key: "pool", value: true }],
      exclusions: [],
      missingInformation: [
        { key: "total_budget", priority: "high", question: "What is your budget?" },
        { key: "property_type", priority: "high", question: "What property type?" },
        { key: "bedrooms", priority: "medium", question: "How many bedrooms?" },
      ],
    },
  });

  assert.equal(email.mode, "confirmation");
  assert.equal(email.followUpQuestions.length, 2);
  assert.match(email.bodyText, /totalbudsjett/);
  assert.match(email.bodyText, /leilighet, rekkehus eller villa/);
  assert.doesNotMatch(email.bodyText, /Hvor mange soverom trenger du minimum/);
  assert.match(email.bodyText, /Du trenger ikke skrive langt/);
});

test("multi-country broad preference triggers prioritization instead of empty confirmation", () => {
  const email = buildCriteriaConfirmationEmail({
    customerName: "Ellen",
    analysis: {
      locations: { preferred: ["Spain", "Portugal", "Greece"] },
      propertyTypes: [],
      hardRequirements: [],
      preferences: [],
      exclusions: [],
      missingInformation: [
        { key: "location", priority: "high" },
        { key: "total_budget", priority: "high" },
        { key: "property_type", priority: "high" },
      ],
    },
  });

  assert.equal(email.mode, "location_clarification");
  assert.equal(email.requiresConfirmation, false);
  assert.match(email.bodyText, /Spania|Spain/);
  assert.match(email.bodyText, /Portugal/);
  assert.match(email.bodyText, /Greece/);
  assert.match(email.bodyText, /prioritere ett land eller område først/);
  assert.match(email.bodyText, /totalbudsjett/);
  assert.match(email.bodyText, /leilighet, rekkehus eller villa/);
});

test("priority question prefers concrete area choice when several areas are known", () => {
  const question = buildBuyerPriorityQuestion({
    locations: { preferred: ["Punta Prima", "La Mata"] },
    preferences: [
      { key: "pool", value: true, weight: 0.8 },
      { key: "distance_to_beach", value: "walking distance", weight: 0.7 },
    ],
  });

  assert.equal(question, "Hvis du skulle prioritere ett område først, er Punta Prima eller La Mata viktigst for deg?");
});

test("priority question compares only documented soft preferences", () => {
  const question = buildBuyerPriorityQuestion({
    locations: { preferred: ["Villajoyosa"] },
    hardRequirements: [{ key: "bedrooms", value: 3 }],
    preferences: [
      { key: "pool", value: true, weight: 0.9 },
      { key: "distance_to_beach", value: "walking distance", weight: 0.8 },
    ],
  });

  assert.equal(question, "Hvis vi må prioritere mellom basseng og gangavstand til stranden, hva er viktigst for deg?");
});

test("hard requirements are never turned into a tradeoff question", () => {
  const question = buildBuyerPriorityQuestion({
    locations: { preferred: ["Villajoyosa"] },
    hardRequirements: [
      { key: "bedrooms", value: 3 },
      { key: "bathrooms", value: 2 },
    ],
    preferences: [],
  });

  assert.equal(question, null);
});

test("priority question is added only when fewer than three missing-data questions remain", () => {
  const email = buildCriteriaConfirmationEmail({
    customerName: "Roy",
    analysis: {
      budget: { amount: 450000, currency: "EUR" },
      locations: { preferred: ["Punta Prima"] },
      propertyTypes: [],
      hardRequirements: [],
      preferences: [
        { key: "pool", value: true, weight: 0.9 },
        { key: "distance_to_beach", value: "walking distance", weight: 0.8 },
      ],
      exclusions: [],
      missingInformation: [
        { key: "property_type", priority: "high" },
        { key: "bedrooms", priority: "medium" },
      ],
    },
  });

  assert.equal(email.followUpQuestions.length, 3);
  assert.equal(email.priorityQuestion, "Hvis vi må prioritere mellom basseng og gangavstand til stranden, hva er viktigst for deg?");
  assert.match(email.bodyText, /Hvis vi må prioritere mellom basseng og gangavstand til stranden/);
});

test("broad location detector covers country and over-broad regional values", () => {
  assert.equal(isBroadBuyerLocation("Spain"), true);
  assert.equal(isBroadBuyerLocation("Spania"), true);
  assert.equal(isBroadBuyerLocation("España"), true);
  assert.equal(isBroadBuyerLocation("Costa Blanca"), true);
  assert.equal(isBroadBuyerLocation("Portugal"), true);
  assert.equal(isBroadBuyerLocation("Greece"), true);
  assert.equal(isBroadBuyerLocation("Altea"), false);
  assert.equal(isBroadBuyerLocation("Villajoyosa"), false);
});

test("short explicit confirmations are accepted", () => {
  assert.equal(isAffirmativeCriteriaConfirmation("Ja, dette stemmer."), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Ja d stemmer"), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Stemmer, takk!"), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Yes, that is correct."), true);
  assert.equal(isAffirmativeCriteriaConfirmation("Sí, correcto."), true);
});

test("corrections and ambiguous replies never count as confirmation", () => {
  assert.equal(isAffirmativeCriteriaConfirmation("Ja, men budsjettet er 500000"), false);
  assert.equal(isAffirmativeCriteriaConfirmation("Nei, området skal være Albir"), false);
  assert.equal(isAffirmativeCriteriaConfirmation("Det ser greit ut, men jeg er ikke sikker"), false);
});
