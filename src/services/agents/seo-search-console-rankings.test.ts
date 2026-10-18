import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankingBucket } from "./seo-search-console";

describe("Altovena Visibility GSC position buckets", () => {
  it("uses exact inclusive boundaries for average positions", () => {
    assert.equal(rankingBucket(1), "1-10");
    assert.equal(rankingBucket(10), "1-10");
    assert.equal(rankingBucket(10.01), "11-20");
    assert.equal(rankingBucket(20), "11-20");
    assert.equal(rankingBucket(20.01), "21-50");
    assert.equal(rankingBucket(50), "21-50");
    assert.equal(rankingBucket(50.01), "51+");
  });
});
