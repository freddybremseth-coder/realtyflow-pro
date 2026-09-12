import assert from "node:assert/strict";
import test from "node:test";
import { extractPropertyRecommendationFeedback } from "./property-recommendation-feedback";

function presentation() {
  return {
    summary: "Kunde søker villa på Costa Blanca.",
    sections: [
      {
        type: "properties",
        items: [
          { propertyId: "p1", reference: "N1001", title: "Villa Sol", location: "Moraira", publicUrl: "https://example.test/n1001", facts: ["€450 000"] },
          { propertyId: "p2", reference: "N1002", title: "Villa Mar", location: "Altea", publicUrl: "https://example.test/n1002", facts: ["€520 000"] },
          { propertyId: "p3", reference: "N1003", title: "Casa Verde", location: "Finestrat", publicUrl: "https://example.test/n1003", facts: ["€490 000"] },
        ],
      },
    ],
  };
}

test("maps mixed numbered customer feedback to the exact recommended properties", () => {
  const result = extractPropertyRecommendationFeedback({
    body: "Nr 2 er interessant og den vil vi gjerne se. Nr 1 blir for dyr. Bolig 3 liker vi ikke området på.",
    presentationJson: presentation(),
  });
  assert.equal(result.propertyFeedback.length, 3);
  assert.equal(result.propertyFeedback.find((item) => item.ordinal === 2)?.sentiment, "viewing");
  assert.equal(result.propertyFeedback.find((item) => item.ordinal === 1)?.sentiment, "negative");
  assert.equal(result.propertyFeedback.find((item) => item.ordinal === 1)?.signals.includes("price_too_high"), true);
  assert.equal(result.propertyFeedback.find((item) => item.ordinal === 3)?.signals.includes("location_negative"), true);
  assert.equal(result.buyerProfileSuggestions.some((item) => item.kind === "budget"), true);
  assert.equal(result.buyerProfileSuggestions.some((item) => item.kind === "location"), true);
  assert.equal(result.buyerProfileSuggestions.every((item) => item.autoApply === false), true);
  assert.equal(result.requiresHumanReview, true);
});

test("matches explicit property references without relying on order", () => {
  const result = extractPropertyRecommendationFeedback({
    body: "N1002 ser veldig interessant ut. Kan du sjekke om den fortsatt er tilgjengelig?",
    presentationJson: presentation(),
  });
  assert.equal(result.propertyFeedback.length, 1);
  assert.equal(result.propertyFeedback[0].reference, "N1002");
  assert.equal(["positive", "question"].includes(result.propertyFeedback[0].sentiment), true);
});

test("does not invent feedback for a generic reply", () => {
  const result = extractPropertyRecommendationFeedback({ body: "Takk, jeg skal se på dette i kveld.", presentationJson: presentation() });
  assert.deepEqual(result.propertyFeedback, []);
  assert.deepEqual(result.buyerProfileSuggestions, []);
  assert.equal(result.requiresHumanReview, false);
});

test("quoted outbound content is ignored", () => {
  const result = extractPropertyRecommendationFeedback({
    body: "Takk, jeg kommer tilbake.\n\nFra: Freddy\nNr 2 er interessant. Nr 1 er for dyr.",
    presentationJson: presentation(),
  });
  assert.deepEqual(result.propertyFeedback, []);
});
