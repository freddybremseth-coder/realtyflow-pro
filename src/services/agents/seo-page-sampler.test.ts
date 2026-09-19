import test from "node:test";
import assert from "node:assert/strict";
import { choosePublicSitemapPages, inspectPublicSample } from "./seo-page-sampler";
import { auditOneSite, SEO_AUDIT_TARGETS } from "./seo-audit";

const BASE = SEO_AUDIT_TARGETS[0].base;
const xml = (urls: string[]) => '<urlset>' + urls.map(url => "<url><loc>" + url + "</loc></url>").join("") + "</urlset>";

test("sample exact first-party sitemapped public URLs, prefer distinct commercial, editorial and local pages", () => {
  const sites = xml([
    BASE + "/", BASE + "/de", BASE + "/en", BASE + "/eiendommer/N42",
    BASE + "/magasin/kjop-bolig", BASE + "/omrader/altea", BASE + "/eiendommer/N43",
    "https://www.zenecohomes.com.evil.invalid/eiendommer/test",
    BASE + "/auth/login", BASE + "/api/private", BASE + "/magasin/secret?email=user@example.com",
    "https://127.0.0.1/private", "http://www.zenecohomes.com/magasin/http",
  ]);
  assert.deepEqual(choosePublicSitemapPages(sites, BASE), [
    BASE + "/eiendommer/N42", BASE + "/magasin/kjop-bolig", BASE + "/omrader/altea",
  ]);
  assert.deepEqual(choosePublicSitemapPages('<sitemapindex><sitemap><loc>' + BASE + '/a.xml</loc></sitemap></sitemapindex>', BASE), []);
});

test("actual sitemap sample HTTP 404 and noindex are findings, failed fetches are unknown", async () => {
  const target = SEO_AUDIT_TARGETS[0];
  const called: string[] = [];
  const result = await auditOneSite(target, async url => {
    const pathname = new URL(url).pathname;
    called.push(pathname);
    if (pathname === "/") return { url, status: 200, contentType: "text/html",
      body: '<html><title>Home</title><meta name="description" content="Home"><link rel="canonical" href="/"><h1>Home</h1></html>', xRobots: "" };
    if (pathname === "/robots.txt") return { url, status: 200, contentType: "text/plain", body: "User-agent: *\nAllow: /", xRobots: "" };
    if (pathname === "/sitemap.xml") return { url, status: 200, contentType: "application/xml",
      body: xml([BASE + "/", BASE + "/eiendommer/N42", BASE + "/magasin/closed", BASE + "/omrader/altea"]),
      xRobots: "" };
    if (pathname === "/eiendommer/N42") return { url, status: 404, contentType: "text/html", body: "missing", xRobots: "" };
    if (pathname === "/magasin/closed") return { url, status: 200, contentType: "text/html",
      body: '<html><title>Closed</title><meta name="robots" content="noindex"><h1>Closed</h1></html>', xRobots: "" };
    if (pathname === "/omrader/altea") throw new Error("network timeout");
    throw new Error("unexpected page");
  });
  assert.equal(result.samples.length, 2);
  assert.equal(result.samples[0].status, 404);
  assert.equal(result.samples[1].noindex, true);
  assert.ok(result.observations.some(item => item.includes("/eiendommer/N42") && item.includes("404")));
  assert.ok(result.observations.some(item => item.includes("/magasin/closed") && item.includes("noindex")));
  assert.ok(result.limitations.some(item => item.includes("/omrader/altea") && item.includes("unknown")));
  assert.equal(called.length, 6);
});

test("no guessing about indexability from one 200 HTML sample", () => {
  const actual = inspectPublicSample(BASE + "/eiendommer/N44", {
    url: BASE + "/eiendommer/N44", status: 200, contentType: "text/html",
    body: '<title>Villa in Spain</title><meta name="description" content="Villa"><link rel="canonical" href="/eiendommer/N44"><h1>Villa</h1>',
    xRobots: "",
  }, BASE);
  assert.equal(actual.issue, null);
  assert.equal(actual.titlePresent, true);
  assert.equal(actual.noindex, false);
});
