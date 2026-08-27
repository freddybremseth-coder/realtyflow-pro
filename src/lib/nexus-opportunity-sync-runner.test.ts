import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runNexusOpportunitySync,
  scheduledNexusOpportunitySources,
} from "@/lib/nexus-opportunity-sync-runner";

test("fast schedule always includes real estate and AI but not publishing outside 6-hour windows", () => {
  assert.deepEqual(
    scheduledNexusOpportunitySources(new Date("2026-08-27T02:15:00Z")),
    ["real_estate", "ai_demosites"],
  );
});

test("publishing joins the sync only at the six-hour UTC window", () => {
  assert.deepEqual(
    scheduledNexusOpportunitySources(new Date("2026-08-27T06:00:00Z")),
    ["real_estate", "ai_demosites", "publishing"],
  );
  assert.deepEqual(
    scheduledNexusOpportunitySources(new Date("2026-08-27T06:15:00Z")),
    ["real_estate", "ai_demosites"],
  );
});

test("runner fetches only requested sources", async () => {
  const fetched: string[] = [];
  const result = await runNexusOpportunitySync({
    fetchSource: async (source) => {
      fetched.push(source);
      if (source === "real_estate") return { priorities: [] };
      if (source === "ai_demosites") return { orders: [], events: [] };
      return { priority: [] };
    },
    upsertOpportunity: async () => ({ ok: true }),
  }, ["real_estate", "ai_demosites"]);

  assert.deepEqual(fetched, ["real_estate", "ai_demosites"]);
  assert.deepEqual(result.sourcesRequested, ["real_estate", "ai_demosites"]);
  assert.equal(result.sources.publishing, undefined);
  assert.equal(result.totals.errors, 0);
});

test("one source failure is isolated and reported", async () => {
  const result = await runNexusOpportunitySync({
    fetchSource: async (source) => {
      if (source === "real_estate") throw new Error("revenue unavailable");
      return { orders: [], events: [] };
    },
    upsertOpportunity: async () => ({ ok: true }),
  }, ["real_estate", "ai_demosites"]);

  assert.equal(result.ok, false);
  assert.equal(result.sources.real_estate.errors[0], "revenue unavailable");
  assert.equal(result.sources.ai_demosites.errors.length, 0);
  assert.equal(result.totals.errors, 1);
});
