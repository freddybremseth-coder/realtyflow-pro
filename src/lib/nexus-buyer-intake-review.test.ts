import { describe, expect, it } from "vitest";
import { buildBuyerIntakeLeadIntelligenceReview } from "@/lib/nexus-buyer-intake-review";

describe("Buyer Intake Lead Intelligence review adapter", () => {
  it("turns explicit lifestyle evidence into reviewable namespaced preferences", () => {
    const result = buildBuyerIntakeLeadIntelligenceReview({
      contact: {
        id: "contact-1",
        name: "Kari Nordmann",
        email: "kari@example.com",
        pipelineStatus: "QUALIFIED",
        pipelineValue: 350000,
      },
      metadata: {
        imported_lead: {
          property_interest: "Leilighet nær sjøen",
          preferences: { property_type: "apartment", location: "Albir" },
        },
        buyer_intelligence: {
          lifestyleCandidates: [
            {
              key: "daily_life:beach_walkability",
              value: true,
              strength: "strong_preference",
              confidence: 0.92,
              sourceText: "gangavstand til strand",
              customerConfirmed: true,
            },
          ],
          personaCandidates: [{ id: "retiree", confidence: 0.9, evidence: ["pensjonist"] }],
        },
      },
    });

    expect(result.analysis.preferences.map((item) => item.otherKey || item.key)).toEqual([
      "property_type",
      "location",
      "daily_life:beach_walkability",
    ]);
    expect(result.reviewedCriteria).toHaveLength(3);
    expect(result.reviewedCriteria.every((item) => item.approvalStatus === "pending_review")).toBe(true);
    expect(result.reviewedCriteria[2]?.customerConfirmed).toBe(true);
  });

  it("keeps persona as evidence and never persists it as a matching criterion", () => {
    const result = buildBuyerIntakeLeadIntelligenceReview({
      contact: { id: "contact-2", name: "Ola", pipelineStatus: "CONTACT" },
      metadata: {
        buyer_intelligence: {
          lifestyleCandidates: [],
          personaCandidates: [{ id: "retiree", confidence: 0.95, evidence: ["pensjonist"] }],
        },
      },
    });

    expect(result.personas[0]?.id).toBe("retiree");
    expect(result.analysis.preferences).toHaveLength(0);
    expect(result.safety.personaNotPersistedAsMatchingCriterion).toBe(true);
  });

  it("does not infer ready-to-buy from QUALIFIED stage or lifestyle persona", () => {
    const result = buildBuyerIntakeLeadIntelligenceReview({
      contact: { id: "contact-3", name: "Per", pipelineStatus: "QUALIFIED" },
      metadata: {
        buyer_intelligence: {
          lifestyleCandidates: [{ key: "environment:quiet", value: true, customerConfirmed: true }],
          personaCandidates: [{ id: "retiree", confidence: 0.9, evidence: ["retired"] }],
        },
      },
    });

    expect(result.analysis.purchaseReadiness.level).toBe("warm");
    expect(result.analysis.hardRequirements).toEqual([]);
    expect(result.safety.purchaseReadinessNotInferredFromPersona).toBe(true);
  });
});
