import assert from "node:assert/strict";
import test from "node:test";
import { areaProfileForLocation, buildPropertyRecommendationTemplate } from "@/services/email/property-recommendation-template";

function presentationJson() {
  return {
    version: "lead-customer-presentation-v1",
    summary: "Kunden ønsker villa rundt Moraira med 3 soverom.",
    sections: [
      {
        type: "properties",
        items: [
          {
            propertyId: "33333333-3333-4333-8333-333333333333",
            reference: "N8513",
            title: "Villa nær Moraira",
            location: "Moraira",
            imageUrl: "https://images.example.test/n8513.jpg",
            publicUrl: "https://properties.example.test/n8513",
            facts: ["Ref N8513", "Moraira", "650 000 €", "3 sov", "2 bad"],
            reasons: [
              "Prisen ligger innenfor budsjettet vi har lagt til grunn.",
              "Beliggenheten passer godt med ønsket område i Moraira.",
            ],
          },
          {
            propertyId: "44444444-4444-4444-8444-444444444444",
            reference: "N8514",
            title: "Moderne villa i Benitachell",
            location: "Benitachell / Moraira",
            imageUrl: "https://images.example.test/n8514.jpg",
            publicUrl: "https://properties.example.test/n8514",
            facts: ["Ref N8514", "Benitachell / Moraira", "695 000 €", "3 sov", "3 bad"],
            reasons: ["Antall soverom ser ut til å passe behovet."],
          },
        ],
      },
    ],
  };
}

test("builds a rich customer template with property and area details", () => {
  const result = buildPropertyRecommendationTemplate({
    brandId: "zeneco",
    customerName: "Bård Hansen",
    presentationJson: presentationJson(),
  });

  assert.equal(result.propertyCount, 2);
  assert.match(result.subject, /2 boliger som matcher søket ditt/i);
  assert.match(result.bodyText, /Hei Bård,/);
  assert.match(result.bodyText, /Villa nær Moraira/);
  assert.match(result.bodyText, /Hvorfor den matcher:/);
  assert.match(result.bodyText, /Om Moraira:/);
  assert.match(result.bodyText, /marina/i);
  assert.match(result.bodyText, /Se bilder, pris og boligdetaljer:/);
  assert.match(result.bodyHtml, /<img/);
  assert.match(result.bodyHtml, /Se bilder og alle boligdetaljer/);
  assert.match(result.bodyHtml, /Om Moraira/);
  assert.match(result.bodyText, /Pris og tilgjengelighet kan endres/);
});

test("never includes properties without a safe public URL in the customer template", () => {
  const source = presentationJson();
  source.sections[0].items.push({
    propertyId: "55555555-5555-4555-8555-555555555555",
    reference: "NO-LINK",
    title: "Intern kandidat",
    location: "Altea",
    imageUrl: "https://images.example.test/internal.jpg",
    publicUrl: null as unknown as string,
    facts: ["Altea"],
    reasons: ["Boligtypen virker relevant."],
  });

  const result = buildPropertyRecommendationTemplate({
    brandId: "soleada",
    customerName: "Kari Nordmann",
    presentationJson: source,
  });

  assert.equal(result.propertyCount, 2);
  assert.equal(result.bodyText.includes("Intern kandidat"), false);
  assert.equal(result.bodyHtml.includes("Intern kandidat"), false);
});

test("known Costa Blanca and inland locations receive a useful area profile", () => {
  assert.equal(areaProfileForLocation("Altea Hills")?.label, "Altea Hills");
  assert.equal(areaProfileForLocation("La Nucía")?.label, "La Nucía");
  assert.equal(areaProfileForLocation("Villajoyosa")?.label, "Villajoyosa");
  assert.equal(areaProfileForLocation("Pinoso")?.label, "Pinoso");
  assert.equal(areaProfileForLocation("Biar")?.label, "Biar");
  assert.equal(areaProfileForLocation("Unknown place"), null);
});

test("template does not expose internal scores or review metadata", () => {
  const source = presentationJson();
  source.sections[0].items[0] = {
    ...source.sections[0].items[0],
    score: 99,
    dataQualityScore: 45,
    concerns: ["internal concern"],
    questionsToVerify: ["internal question"],
  } as typeof source.sections[0]["items"][number];

  const result = buildPropertyRecommendationTemplate({
    brandId: "zeneco",
    customerName: "Ola Nordmann",
    presentationJson: source,
  });

  assert.equal(result.bodyText.includes("99"), false);
  assert.equal(result.bodyText.includes("dataQuality"), false);
  assert.equal(result.bodyText.includes("internal concern"), false);
  assert.equal(result.bodyHtml.includes("internal question"), false);
});
