import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_EVENT_TYPES } from "@/lib/marketing/events";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260906093500_marketing_events_metrics_snapshot.sql"),
  "utf8",
);

describe("marketing event database contract", () => {
  it("allows every canonical Marketing Growth OS event type", () => {
    for (const eventType of MARKETING_EVENT_TYPES) {
      expect(migration).toContain(`'${eventType}'::text`);
    }
  });

  it("keeps metrics_snapshot explicitly constrained rather than disabling validation", () => {
    expect(migration).toContain("add constraint marketing_events_event_type_check");
    expect(migration).toContain("'metrics_snapshot'::text");
    expect(migration).not.toContain("drop column");
  });
});
