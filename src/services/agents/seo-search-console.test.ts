import test from "node:test";
import assert from "node:assert/strict";
import { GSC_READ_SCOPE, selectGSCProperty, selectStoredGSCBrandChannels, targetForBrand, isFreddyFamilyDomainProperty, sumPageRows, selectGSCImpressionPages, readGSCAllBrands } from "./seo-search-console";

test("Search Console requests a distinct read-only grant", () => {
  assert.equal(GSC_READ_SCOPE, "https://www.googleapis.com/auth/webmasters.readonly");
  assert.ok(targetForBrand("zeneco"));
  assert.equal(targetForBrand("made-up-brand"), null);
});

test("Select exact verified brand URL-prefix before domain, not another property", () => {
  const sites = [
    { siteUrl: "sc-domain:zenecohomes.com", permissionLevel: "siteOwner" },
    { siteUrl: "https://www.zenecohomes.com/", permissionLevel: "siteFullUser" },
    { siteUrl: "https://evil.invalid/", permissionLevel: "siteOwner" },
  ];
  assert.equal(selectGSCProperty("zeneco", sites), "https://www.zenecohomes.com/");
  assert.equal(selectGSCProperty("pinosoecolife", sites), null);
});

test("Reject unverified, URL path and lookalike property for private brand", () => {
  assert.equal(selectGSCProperty("zeneco", [
    { siteUrl: "https://www.zenecohomes.com/", permissionLevel: "siteUnverifiedUser" },
    { siteUrl: "https://www.zenecohomes.com.evil.invalid/", permissionLevel: "siteOwner" },
    { siteUrl: "https://www.zenecohomes.com/admin", permissionLevel: "siteOwner" },
  ]), null);
});

test("Domain property can verify author's own subdomains; URL-prefix of root cannot", () => {
  assert.equal(selectGSCProperty("freddypublishing", [
    { siteUrl: "https://www.freddybremseth.com/", permissionLevel: "siteOwner" },
    { siteUrl: "sc-domain:freddybremseth.com", permissionLevel: "siteRestrictedUser" },
  ]), "sc-domain:freddybremseth.com");
  assert.equal(selectGSCProperty("freddyart", [
    { siteUrl: "sc-domain:freddybremseth.com", permissionLevel: "siteOwner" },
  ]), "sc-domain:freddybremseth.com");
  assert.equal(selectGSCProperty("remasterfreddy", [
    { siteUrl: "https://www.freddybremseth.com/", permissionLevel: "siteOwner" },
  ]), null);
  assert.equal(selectGSCProperty("chatgenius", [
    { siteUrl: "sc-domain:chatgenius.com", permissionLevel: "siteOwner" },
    { siteUrl: "sc-domain:chatgenius.pro", permissionLevel: "siteFullUser" },
  ]), "sc-domain:chatgenius.pro");
});

test("Saved Search Console channel lookup uses exact brand and Google property, never neighboring brands", () => {
  const channels = [
    { id: "a", brand_id: "zeneco", external_id: "https://www.zenecohomes.com/" },
    { id: "b", brand_id: "freddyb", external_id: "sc-domain:freddybremseth.com" },
    { id: "c", brand_id: "zeneco", external_id: "sc-domain:chatgenius.pro" },
    { id: "d", brand_id: "freddypublishing", external_id: "sc-domain:freddybremseth.com" },
  ];
  assert.deepEqual(selectStoredGSCBrandChannels("zeneco", channels).map(item => item.id), ["a"]);
  assert.deepEqual(selectStoredGSCBrandChannels("freddyb", channels).map(item => item.id), ["b"]);
  assert.deepEqual(selectStoredGSCBrandChannels("freddypublishing", channels).map(item => item.id), ["d"]);
  assert.deepEqual(selectStoredGSCBrandChannels("freddyart", channels).map(item => item.id), ["b"]);
  assert.deepEqual(selectStoredGSCBrandChannels("remasterfreddy", channels).map(item => item.id), ["b"]);
  assert.deepEqual(selectStoredGSCBrandChannels("pinosoecolife", channels), []);
});

test("Freddy parent Domain property can cover art, but root URL-prefix and lookalikes cannot", () => {
  assert.equal(isFreddyFamilyDomainProperty("sc-domain:freddybremseth.com"), true);
  for (const value of ["https://www.freddybremseth.com/", "sc-domain:art.freddybremseth.com",
    "sc-domain:freddybremseth.com.evil.invalid", "sc-domain:zenecohomes.com"]) {
    assert.equal(isFreddyFamilyDomainProperty(value), false);
  }
});

test("art GSC measurements never count books, root, remaster or lookalike domains", () => {
  const rows = [
    { keys: ["https://art.freddybremseth.com/kunstverk/one"], clicks: 2, impressions: 19 },
    { keys: ["https://books.freddybremseth.com/books/one"], clicks: 7, impressions: 80 },
    { keys: ["https://www.freddybremseth.com/es/"], clicks: 3, impressions: 30 },
    { keys: ["https://remaster.freddybremseth.com/"], clicks: 1, impressions: 50 },
    { keys: ["https://art.freddybremseth.com.evil.invalid/"], clicks: 9, impressions: 90 },
  ];
  assert.deepEqual(sumPageRows(rows, { base: "https://art.freddybremseth.com" }),
    { clicks: 2, impressions: 19, ctr: 0.1053 });
  assert.deepEqual(sumPageRows(rows, { base: "https://books.freddybremseth.com" }),
    { clicks: 7, impressions: 80, ctr: 0.0875 });
});

test("automated portfolio GSC cycle reads each of the eight approved public sites exactly once", async () => {
  const seen: string[] = [];
  const result = await readGSCAllBrands(async brandId => {
    seen.push(brandId);
    return null;
  });
  assert.equal(result.length, 8);
  assert.equal(new Set(seen).size, 8);
  assert.equal(seen.filter(item => item === "freddyart").length, 1);
  assert.deepEqual(result.map(item => item.brandId), [
    "zeneco", "pinosoecolife", "freddyb", "freddypublishing",
    "freddyart", "remasterfreddy", "donaanna", "chatgenius",
  ]);
});

test("one site failing does not prevent the other seven from returning measurement states", async () => {
  const result = await readGSCAllBrands(async brandId => {
    if (brandId === "freddyart") throw new Error("Art Google API unavailable");
    return null;
  });
  assert.equal(result.length, 8);
  assert.equal(result.find(item => item.brandId === "freddyart")?.status, "error");
  assert.equal(result.filter(item => item.status === "not_connected").length, 7);
});

test("GSC page sample keeps high-impression zero-click pages ahead of low-impression click pages, scoped to the exact host", () => {
  const target = { base: "https://www.zenecohomes.com" };
  const rows = [
    { keys: ["https://www.zenecohomes.com/en"], clicks: 1, impressions: 1, ctr: 1, position: 3 },
    { keys: ["https://www.zenecohomes.com/guide/purchase"], clicks: 0, impressions: 160, ctr: 0, position: 10 },
    { keys: ["https://other.example/guide/purchase"], clicks: 99, impressions: 99999, ctr: 0.5, position: 1 },
  ];
  const pages = selectGSCImpressionPages(rows, target);
  assert.deepEqual(pages.map(page => page.path), ["/guide/purchase", "/en"]);
  assert.equal(pages[0].impressions, 160);
  assert.equal(pages[0].clicks, 0);
});
