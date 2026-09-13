import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    assert.equal(result.skipped, true);
    assert.equal(called, false);
  });

  it("emits one audit event and one canonical qualified outcome", async () => {
    const inserted: any[] = [];
    const supabase = {
      from(table: string) {
        assert.equal(table, "revenue_events");
        const builder: any = {
          insert(value: any) { inserted.push(value); return builder; },
          select() { return builder; },
          single() { return Promise.resolve({ data: { id: `event-${inserted.length}`, ...inserted.at(-1) }, error: null }); },
        };
        return builder;
      },
    } as any;

    const result = await recordPipelineTransition(supabase, {
      contactId: "contact-1",
      brandId: "zeneco",
      previousStatus: "CONTACT",
      nextStatus: "QUALIFIED",
      occurredAt: "2026-09-13T10:00:00.000Z",
      createdBy: "test",
    });

    assert.equal(result.outcomeType, "qualified");
    assert.equal(result.outcomeResult?.ok, true);
    assert.deepEqual(inserted.map((event) => event.event_type), ["contact_updated", "qualified"]);
    assert.equal(inserted[1].dedupe_key, "pipeline-outcome:zeneco:contact-1:qualified");
    assert.equal(inserted[1].metadata.next_status, "QUALIFIED");
  });

  it("does not manufacture a canonical outcome without brand identity", async () => {
    const inserted: any[] = [];
    const supabase = {
      from() {
        const builder: any = {
          insert(value: any) { inserted.push(value); return builder; },
          select() { return builder; },
          single() { return Promise.resolve({ data: { id: "audit", ...inserted.at(-1) }, error: null }); },
        };
        return builder;
      },
    } as any;
    const result = await recordPipelineTransition(supabase, {
      contactId: "contact-1",
      previousStatus: "CONTACT",
      nextStatus: "WON",
      createdBy: "test",
    });
    assert.deepEqual(inserted.map((event) => event.event_type), ["contact_updated"]);
    assert.equal(result.outcomeSkippedReason, "brand_id_required");
  });
});
