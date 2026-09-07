import { describe, expect, it } from "vitest";
import { recordPipelineTransition } from "./pipeline-transition";

describe("recordPipelineTransition", () => {
  it("skips unchanged normalized pipeline status", async () => {
    let called = false;
    const supabase = { from() { called = true; throw new Error("should not be called"); } } as any;
    const result = await recordPipelineTransition(supabase, {
      contactId: "11111111-1111-1111-1111-111111111111",
      previousStatus: "qualified",
      nextStatus: "QUALIFIED",
      createdBy: "test",
    });
    expect(result.skipped).toBe(true);
    expect(called).toBe(false);
  });
});
