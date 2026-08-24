import assert from "node:assert/strict";
import test from "node:test";
import { extractPublishedTags, syncGrowthInstagramMetrics } from "./growth-metrics-sync";

test("extractPublishedTags supports Unicode hashtags and case-insensitive dedupe", () => {
  const tags = extractPublishedTags("#Boligdrøm #CostaBlanca #boligdrøm #COSTABLANCA #Finestrat");
  assert.deepEqual(tags, ["boligdrøm", "costablanca", "finestrat"]);
});

test("extractPublishedTags returns empty list when caption has no hashtags", () => {
  assert.deepEqual(extractPublishedTags("Book en gratis boligsamtale i dag."), []);
});

test("Growth metrics excludes Instagram posts younger than 24 hours by default", async () => {
  const lteCalls: Array<{ column: string; value: string }> = [];

  const makeQuery = (table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      gte: () => query,
      lte: (column: string, value: string) => {
        lteCalls.push({ column, value });
        return query;
      },
      order: () => query,
      limit: () => query,
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    return query;
  };

  const supabase: any = {
    from: (table: string) => makeQuery(table),
  };

  const before = Date.now();
  const result = await syncGrowthInstagramMetrics(supabase, {
    brandId: "zeneco",
    accessToken: "test-token",
  });
  const after = Date.now();

  assert.equal(result.candidates, 0);
  assert.equal(lteCalls.length, 1);
  assert.equal(lteCalls[0].column, "updated_at");

  const cutoff = Date.parse(lteCalls[0].value);
  const expectedMin = before - 24 * 60 * 60 * 1000 - 1000;
  const expectedMax = after - 24 * 60 * 60 * 1000 + 1000;
  assert.ok(cutoff >= expectedMin && cutoff <= expectedMax, `unexpected maturity cutoff: ${lteCalls[0].value}`);
});
