import test from "node:test";
import assert from "node:assert/strict";
import { GSC_READ_SCOPE, selectGSCProperty, selectStoredGSCBrandChannels, targetForBrand } from "./seo-search-console";

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
  assert.deepEqual(selectStoredGSCBrandChannels("pinosoecolife", channels), []);
});
