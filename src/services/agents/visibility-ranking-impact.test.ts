import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareVisibilityRankingWindows, type VisibilityRankingWindow } from "./visibility-ranking-impact";

const before: VisibilityRankingWindow = {start:"2026-08-01",end:"2026-08-30",query:"bolig albir",page:"/omrader/albir",clicks:10,impressions:100,position:15};
const after: VisibilityRankingWindow = {start:"2026-09-01",end:"2026-09-30",query:"bolig albir",page:"/omrader/albir",clicks:18,impressions:130,position:9};

describe("Visibility SEO ranking comparisons", () => {
  it("compares verified equivalent windows but never certifies causation", () => {
    const result = compareVisibilityRankingWindows(before,after);
    assert.equal(result.state,"COMPARABLE");
    assert.equal(result.deltaPosition,6);
    assert.equal(result.deltaClicks,8);
    assert.equal(result.causeVerified,false);
    assert.equal(result.releaseVerified,false);
  });
  it("rejects different page or query identities", () => {
    assert.equal(compareVisibilityRankingWindows(before,{...after,page:"/omrader/finestrat"}).state,"INSUFFICIENT_EVIDENCE");
    assert.equal(compareVisibilityRankingWindows(before,{...after,query:"villa albir"}).state,"INSUFFICIENT_EVIDENCE");
  });
  it("rejects missing measurements and overlapping windows", () => {
    assert.equal(compareVisibilityRankingWindows(before,{...after,position:null}).deltaPosition,null);
    assert.equal(compareVisibilityRankingWindows(before,{...after,start:"2026-08-25"}).state,"INSUFFICIENT_EVIDENCE");
  });
});
