import test from "node:test";
import assert from "node:assert/strict";
import { auditOneSite, SEO_AUDIT_TARGETS, SEO_SUPPLEMENTAL_AUDIT_TARGETS } from "./seo-audit";

const SITE = SEO_AUDIT_TARGETS[0];

test("live HTML and bot/sitemap signals are evidence, not ranking claims", async () => {
  const data = new Map([
    ["/", { status: 200, url: SITE.base + "/", contentType: "text/html", xRobots: "",
      body: '<!doctype html><html><head><title>Unique site</title><meta name="description" content="Example"><link href="https://www.zenecohomes.com/" rel="canonical"><script type="application/ld+json">{"@type":"WebSite"}</script></head><body><h1>Unique heading</h1></body></html>' }],
    ["/robots.txt", { status: 200, url: SITE.base + "/robots.txt", contentType: "text/plain", xRobots: "",
      body: "User-agent: *\nAllow: /\nSitemap: https://www.zenecohomes.com/sitemap.xml" }],
    ["/sitemap.xml", { status: 200, url: SITE.base + "/sitemap.xml", contentType: "application/xml", xRobots: "",
      body: '<?xml version="1.0"?><urlset><url><loc>https://www.zenecohomes.com/</loc></url></urlset>' }],
  ]);
  const result = await auditOneSite(SITE, async url => {
    const snapshot = data.get(new URL(url).pathname);
    if (!snapshot) throw new Error("Unexpected URL");
    return snapshot;
  });
  assert.equal(result.home.title, "Unique site");
  assert.equal(result.home.h1Count, 1);
  assert.equal(result.home.jsonLdCount, 1);
  assert.equal(result.home.jsonLdParseErrors, 0);
  assert.equal(result.robots.googlebotBlocked, false);
  assert.equal(result.sitemap.urlCountSample, 1);
  assert.equal(result.observations.length, 0);
  assert.ok(result.limitations.some(line => line.includes("not a full crawl")));
});

test("actual noindex, invalid JSON-LD, robots disallow and broken sitemap are reported", async () => {
  const result = await auditOneSite(SITE, async url => {
    const path = new URL(url).pathname;
    if (path === "/") return { status: 200, url, contentType: "text/html", xRobots: "noindex",
      body: '<html><head><meta content="noindex,follow" name="robots"><script type="application/ld+json">{bad}</script></head><body>hello</body></html>' };
    if (path === "/robots.txt") return { status: 200, url, contentType: "text/plain", xRobots: "",
      body: "User-agent: Googlebot\nDisallow: /\n" };
    return { status: 404, url, contentType: "text/plain", xRobots: "", body: "missing" };
  });
  assert.equal(result.home.title, null);
  assert.equal(result.home.jsonLdParseErrors, 1);
  assert.equal(result.robots.googlebotBlocked, true);
  assert.equal(result.sitemap.status, 404);
  assert.ok(result.observations.some(line => /noindex/.test(line)));
});

test("failed request remains unknown and never becomes a fabricated SEO error", async () => {
  const result = await auditOneSite(SITE, async url => {
    if (url.endsWith("/robots.txt")) throw new Error("Network unavailable");
    return { status: 200, url, contentType: url.endsWith("/") ? "text/html" : "application/xml",
      xRobots: "", body: url.endsWith("/") ? "<html><title>Hello</title><h1>Home</h1></html>" : "<urlset/>" };
  });
  assert.equal(result.robots.status, null);
  assert.equal(result.robots.googlebotBlocked, null);
  assert.ok(result.limitations.some(line => line.includes("Network unavailable")));
  assert.ok(!result.observations.some(line => line.includes("robots.txt did not return")));
});

test("art and care are additional bounded audit targets, not extra Search Console OAuth brands", () => {
  assert.equal(SEO_AUDIT_TARGETS.length, 7);
  assert.deepEqual(SEO_SUPPLEMENTAL_AUDIT_TARGETS.map(item => item.base), [
    "https://art.freddybremseth.com", "https://care.zenecohomes.com",
  ]);
  const origins = [...SEO_AUDIT_TARGETS, ...SEO_SUPPLEMENTAL_AUDIT_TARGETS].map(item => item.base);
  assert.equal(new Set(origins).size, 9);
});
