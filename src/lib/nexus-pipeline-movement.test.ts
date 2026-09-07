import { describe, expect, it } from "vitest";
import { assessPipelineMovement } from "./nexus-pipeline-movement";

const now = new Date("2026-09-07T18:00:00.000Z");

describe("assessPipelineMovement", () => {
  it("keeps planned waiting out of stagnation", () => {
    const result = assessPipelineMovement({ id:"1", email:"a@example.com", pipeline_status:"ON_HOLD", waiting_on:"customer", waiting_until:"2026-10-01T10:00:00.000Z", waiting_reason:"Kunden kommer i oktober" }, now);
    expect(result?.cause).toBe("waiting_planned");
    expect(result?.needsAction).toBe(false);
  });

  it("moves qualified buyers with direction toward matching", () => {
    const result = assessPipelineMovement({ id:"2", email:"b@example.com", pipeline_status:"QUALIFIED", preferred_location:"Altea", last_contact:"2026-09-01T10:00:00.000Z" }, now);
    expect(result?.cause).toBe("ready_for_matching");
    expect(result?.targetStage).toBe("MATCHING");
  });

  it("flags qualified buyers without direction", () => {
    const result = assessPipelineMovement({ id:"3", email:"c@example.com", pipeline_status:"QUALIFIED", last_contact:"2026-09-01T10:00:00.000Z" }, now);
    expect(result?.cause).toBe("missing_buyer_direction");
  });

  it("surfaces unknown pipeline states as data quality", () => {
    const result = assessPipelineMovement({ id:"4", email:"d@example.com", pipeline_status:"paid" }, now);
    expect(result?.cause).toBe("data_quality");
    expect(result?.priority).toBe("CRITICAL");
  });
});
