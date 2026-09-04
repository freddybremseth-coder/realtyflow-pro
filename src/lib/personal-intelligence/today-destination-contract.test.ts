import { describe, expect, it } from "vitest";
import { todayDestination } from "./today-destination";

describe("Personal Intelligence TODAY destinations", () => {
  it("routes each attention type to its owner-controlled surface", () => {
    expect(todayDestination("prediction_attention")).toBe("/personal-intelligence/predictions");
    expect(todayDestination("learning_review")).toBe("/personal-intelligence/learn");
    expect(todayDestination("action")).toBe("/personal-intelligence/commitments");
    expect(todayDestination("followup")).toBe("/personal-intelligence/commitments");
    expect(todayDestination("goal")).toBe("/personal-intelligence/commitments");
    expect(todayDestination("business_opportunity")).toBe("/nexus-os/today");
    expect(todayDestination("publishing_attention")).toBe("/books");
  });

  it("contains navigation only and no mutation or execution primitive", () => {
    const source = todayDestination.toString();
    expect(source).not.toMatch(/insert|update|delete|upsert|execute|fetch|POST|PATCH/i);
  });
});
