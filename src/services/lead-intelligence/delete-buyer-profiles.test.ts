import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deleteBuyerProfilesThroughStore, type BuyerProfileDeleteStore } from "./delete-buyer-profiles";

const IDS = {
  one: "11111111-1111-4111-8111-111111111111",
  two: "22222222-2222-4222-8222-222222222222",
  three: "33333333-3333-4333-8333-333333333333",
};

test("buyer profile deletion is brand-scoped and reports missing ids", async () => {
  const calls: Array<{ method: string; brand: string; ids: string[] }> = [];
  const store: BuyerProfileDeleteStore = {
    async listExisting(brand, ids) {
      calls.push({ method: "list", brand, ids });
      return [IDS.one, IDS.two];
    },
    async deleteExisting(brand, ids) {
      calls.push({ method: "delete", brand, ids });
      return [IDS.two, IDS.one];
    },
  };

  const result = await deleteBuyerProfilesThroughStore(store, {
    brand: "soleada",
    buyerProfileIds: [IDS.one, IDS.two, IDS.three, IDS.one],
  });

  assert.equal(result.brand, "soleada");
  assert.deepEqual(result.deletedBuyerProfileIds, [IDS.one, IDS.two]);
  assert.deepEqual(result.missingBuyerProfileIds, [IDS.three]);
  assert.equal(result.deletedCount, 2);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(calls[1], { method: "delete", brand: "soleada", ids: [IDS.one, IDS.two] });
});

test("buyer profile deletion does not issue delete when no profile exists", async () => {
  let deleteCalled = false;
  const store: BuyerProfileDeleteStore = {
    async listExisting() { return []; },
    async deleteExisting() { deleteCalled = true; return []; },
  };

  const result = await deleteBuyerProfilesThroughStore(store, {
    brand: "zeneco",
    buyerProfileIds: [IDS.one],
  });

  assert.equal(deleteCalled, false);
  assert.deepEqual(result.deletedBuyerProfileIds, []);
  assert.deepEqual(result.missingBuyerProfileIds, [IDS.one]);
});

test("buyer profile deletion validates UUIDs, brand and maximum batch size", async () => {
  const store: BuyerProfileDeleteStore = {
    async listExisting() { return []; },
    async deleteExisting() { return []; },
  };

  await assert.rejects(
    () => deleteBuyerProfilesThroughStore(store, { brand: "soleada", buyerProfileIds: ["not-a-uuid"] } as any),
  );
  await assert.rejects(
    () => deleteBuyerProfilesThroughStore(store, { brand: "unknown", buyerProfileIds: [IDS.one] } as any),
  );
  await assert.rejects(
    () => deleteBuyerProfilesThroughStore(store, {
      brand: "soleada",
      buyerProfileIds: Array.from({ length: 51 }, (_, index) => `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`),
    } as any),
  );
});

test("partial database deletion is surfaced as missing rather than claimed deleted", async () => {
  const store: BuyerProfileDeleteStore = {
    async listExisting() { return [IDS.one, IDS.two]; },
    async deleteExisting() { return [IDS.one]; },
  };

  const result = await deleteBuyerProfilesThroughStore(store, {
    brand: "pinosoecolife",
    buyerProfileIds: [IDS.one, IDS.two],
  });

  assert.deepEqual(result.deletedBuyerProfileIds, [IDS.one]);
  assert.deepEqual(result.missingBuyerProfileIds, [IDS.two]);
});

test("delete route no longer uses the restricted Lead Intelligence runtime transaction", () => {
  const route = readFileSync(
    new URL("../../app/api/lead-intelligence/buyer-profiles/delete/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /createSupabaseBuyerProfileDeleteStore/);
  assert.match(route, /deleteBuyerProfilesThroughStore/);
  assert.doesNotMatch(route, /withLeadIntelligenceTransaction/);
  assert.match(route, /contactsDeleted:\s*false/);
});
