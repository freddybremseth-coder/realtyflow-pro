import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { MARKETING_EVENT_TYPES } from "@/lib/marketing/events";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260906093500_marketing_events_metrics_snapshot.sql"),
  "utf8",
);

describe("marketing event database contract", () => {
  it("allows every canonical Marketing Growth OS event type", () => {
    for (const eventType of MARKETING_EVENT_TYPES) {
      assert.ok(migration.includes(`'${eventType}'::text`));
    }
  });

  it("keeps metrics_snapshot explicitly constrained rather than disabling validation", () => {
    assert.ok(migration.includes("add constraint marketing_events_event_type_check"));
    assert.ok(migration.includes("'metrics_snapshot'::text"));
    assert.equal(migration.includes("drop column"), false);
  });
});
