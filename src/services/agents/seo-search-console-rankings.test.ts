import { describe, expect, it } from "vitest";
import { rankingBucket } from "@/services/agents/seo-search-console";

describe("Altovena Visibility GSC position buckets", () => {
  it("uses exact inclusive boundaries for average positions", () => {
    expect(rankingBucket(1)).toBe("1-10");
    expect(rankingBucket(10)).toBe("1-10");
    expect(rankingBucket(10.01)).toBe("11-20");
    expect(rankingBucket(20)).toBe("11-20");
    expect(rankingBucket(20.01)).toBe("21-50");
    expect(rankingBucket(50)).toBe("21-50");
    expect(rankingBucket(50.01)).toBe("51+");
  });
});
