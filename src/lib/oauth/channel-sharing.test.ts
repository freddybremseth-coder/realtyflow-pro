import { describe, it } from "node:test";
import assert from "node:assert/strict";
const expect = (actual: boolean) => ({ toBe: (expected: boolean) => assert.equal(actual, expected) });
import { isExpectedChannelSharing } from "./channel-sharing";

const rows = (platform: string, external_id: string, brands: string[]) =>
  brands.map((brand_id) => ({ brand_id, platform, external_id }));

describe("intentional channel sharing", () => {
  it("recognizes the configured Freddy Meta destinations", () => {
    for (const platform of ["facebook", "instagram"]) {
      expect(isExpectedChannelSharing(rows(platform, "123", ["freddyb", "freddyart", "freddypublishing"]))).toBe(true);
    }
  });
  it("requires the canonical owner on the same exact account", () => {
    expect(isExpectedChannelSharing(rows("instagram", "123", ["freddyart", "freddypublishing"]))).toBe(false);
    expect(isExpectedChannelSharing([
      ...rows("instagram", "123", ["freddyart"]),
      ...rows("instagram", "456", ["freddyb"]),
    ])).toBe(false);
  });
  it("keeps unrelated brands and shared YouTube channels flagged", () => {
    expect(isExpectedChannelSharing(rows("facebook", "123", ["freddyb", "zeneco"]))).toBe(false);
    expect(isExpectedChannelSharing(rows("youtube", "123", ["freddyb", "freddyart"]))).toBe(false);
    expect(isExpectedChannelSharing(rows("facebook", "123", ["unknown", "unknown"]))).toBe(false);
  });
  it("allows a Search Console domain property to cover its brand subdomains", () => {
    expect(isExpectedChannelSharing(rows("google_search_console", "sc-domain:freddybremseth.com", ["freddyb", "freddyart", "freddypublishing", "remasterfreddy"]))).toBe(true);
  });
  it("does not infer sharing for wrong domains, suffix lookalikes or URL-prefix properties", () => {
    for (const property of ["sc-domain:bremseth.com", "sc-domain:com", "sc-domain:", "https://freddybremseth.com/"]) {
      expect(isExpectedChannelSharing(rows("google_search_console", property, ["freddyb", "freddyart"]))).toBe(false);
    }
    expect(isExpectedChannelSharing(rows("google_search_console", "sc-domain:freddybremseth.com", ["freddyb", "chatgenius"]))).toBe(false);
  });
});
