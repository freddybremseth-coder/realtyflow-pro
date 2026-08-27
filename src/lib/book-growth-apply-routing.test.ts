import { describe, expect, it } from "vitest";
import { getBookGrowthApplyRoute } from "./book-growth-apply-routing";

describe("getBookGrowthApplyRoute", () => {
  it("routes ASIN work to verification without claiming auto-apply", () => {
    const route = getBookGrowthApplyRoute("asin_linkage");
    expect(route.href).toBe("/book-growth/asins");
    expect(route.canAutoApply).toBe(false);
  });

  it("marks Amazon Ads work as manual external", () => {
    const route = getBookGrowthApplyRoute("ad_efficiency");
    expect(route.kind).toBe("manual_external");
    expect(route.canAutoApply).toBe(false);
  });

  it("recognizes the existing channel metadata apply workflow", () => {
    const route = getBookGrowthApplyRoute("channel_metadata");
    expect(route.href).toBe("/book-growth/channel-metadata");
    expect(route.canAutoApply).toBe(true);
  });

  it("fails closed for unknown recommendation types", () => {
    const route = getBookGrowthApplyRoute("future_unknown_type");
    expect(route.kind).toBe("review_required");
    expect(route.canAutoApply).toBe(false);
  });
});
