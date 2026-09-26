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

test("Sam flags a sitemapped book URL whose HTML canonical points to the books homepage", () => {
  const site = "https://books.freddybremseth.com";
  const page = inspectPublicSample(site + "/book/the-facade-of-justice", {
    url: site + "/book/the-facade-of-justice", status: 200, contentType: "text/html",
    body: '<html><head><title>The Facade of Justice</title><link rel="canonical" href="' + site +
      '/"><meta name="description" content="A real book"></head><body><h1>The Facade of Justice</h1></body></html>',
    xRobots: "",
  }, site);
  assert.match(page.issue || "", /canonical pointing to \/; verify/);
  assert.equal(page.canonical, site + "/");
});

test("Sam allows trailing-slash and www/apex aliases when a sitemap URL is otherwise self-canonical", () => {
  const page = inspectPublicSample(BASE + "/guide/example", {
    url: BASE + "/guide/example/", status: 200, contentType: "text/html",
    body: '<title>Guide</title><meta name="description" content="A complete real public guide"><link rel="canonical" href="https://zenecohomes.com/guide/example/"><h1>Guide</h1>',
    xRobots: "",
  }, BASE);
  assert.equal(page.issue, null);
});

test("Sam reports sitemap entry canonical with unintended query parameters or insecure protocol", () => {
  const query = inspectPublicSample(BASE + "/guide/example", {
    url: BASE + "/guide/example", status: 200, contentType: "text/html",
    body: '<title>Guide</title><meta name="description" content="A complete real public guide"><link rel="canonical" href="/guide/example?ref=track"><h1>Guide</h1>',
    xRobots: "",
  }, BASE);
  assert.match(query.issue || "", /canonical pointing to \/guide\/example\?ref=track/);
  const insecure = inspectPublicSample(BASE + "/guide/example", {
    url: BASE + "/guide/example", status: 200, contentType: "text/html",
    body: '<title>Guide</title><meta name="description" content="A complete real public guide"><link rel="canonical" href="http://www.zenecohomes.com/guide/example"><h1>Guide</h1>',
    xRobots: "",
  }, BASE);
  assert.match(insecure.issue || "", /non-HTTPS canonical/);
});

test("Books SEO chooses distinct actual titles rather than generic pages and rotates locales over days", () => {
  const base = "https://books.freddybremseth.com";
  const urls = [base + "/", base + "/about", base + "/library"];
  for (const title of ["one", "two", "three", "four"]) {
    for (const locale of ["", "/en", "/es"]) {
      urls.push(base + locale + "/book/" + title);
    }
  }
  urls.push(base + "/api/private", "https://books.freddybremseth.com.evil.invalid/book/malicious");
  const s = xml(urls);
  assert.deepEqual(choosePublicSitemapPages(s, base, 3, 0), [
    base + "/book/one", base + "/book/two", base + "/book/three",
  ]);
  assert.deepEqual(choosePublicSitemapPages(s, base, 3, 1), [
    base + "/en/book/four", base + "/en/book/one", base + "/en/book/two",
  ]);
  assert.deepEqual(choosePublicSitemapPages(s, base, 3, 2), [
    base + "/es/book/three", base + "/es/book/four", base + "/es/book/one",
  ]);
});

test("Art SEO checks up to three distinct actual artworks per day, never private or external URLs", () => {
  const base = "https://art.freddybremseth.com";
  const s = xml([base + "/", base + "/legal/privacy.html", base + "/collections/studio-archive/",
    ...["a", "b", "c", "d", "e"].map(slug => base + "/verk/" + slug + "/"),
    base + "/api/download", "https://art.freddybremseth.com.evil.invalid/verk/x/"]);
  assert.deepEqual(choosePublicSitemapPages(s, base, 3, 0), [
    base + "/verk/a/", base + "/verk/b/", base + "/verk/c/",
  ]);
  assert.deepEqual(choosePublicSitemapPages(s, base, 3, 1), [
    base + "/verk/d/", base + "/verk/e/", base + "/verk/a/",
  ]);
});

test("actual public audit retains its hard three-page bound while sampling sitemapped book entries", async () => {
  const base = "https://books.freddybremseth.com";
  const urls = ["one", "two", "three", "four"].flatMap(slug =>
    ["", "/en", "/es"].map(locale => base + locale + "/book/" + slug));
  const called: string[] = [];
  const result = await auditOneSite({ brandId: "freddypublishing", base }, async url => {
    const path = new URL(url).pathname;
    called.push(path);
    if (path === "/robots.txt") return { url, status: 200, contentType: "text/plain",
      body: "User-agent: *\\nAllow: /", xRobots: "" };
    if (path === "/sitemap.xml") return { url, status: 200, contentType: "application/xml",
      body: xml([base + "/", base + "/about", ...urls]), xRobots: "" };
    return { url, status: 200, contentType: "text/html",
      body: '<title>Actual book</title><meta name="description" content="Book"><link rel="canonical" href="' +
        url + '"><h1>Actual book</h1>', xRobots: "" };
  });
  assert.equal(called.length, 6);
  assert.equal(result.samples.length, 3);
  assert.equal(new Set(result.samples.map(row => row.path.split("/").filter(Boolean).at(-1))).size, 3);
  assert.ok(result.samples.every(row => row.path.includes("/book/") && row.issue === null));
});

test("Sam surfaces actual missing metadata on a public page declared in a sitemap", () => {
  const base = "https://books.freddybremseth.com";
  const url = base + "/book/example";
  const withoutCanonical = inspectPublicSample(url, {
    url, status: 200, contentType: "text/html",
    body: '<title>Example book</title><meta name="description" content="Author and series"><h1>Example book</h1>',
    xRobots: "",
  }, base);
  assert.equal(withoutCanonical.canonical, null);
  assert.match(withoutCanonical.issue || "", /has no canonical link/);
  const withoutDescription = inspectPublicSample(url, {
    url, status: 200, contentType: "text/html",
    body: '<title>Example book</title><link rel="canonical" href="' + url +
      '"><h1>Example book</h1>', xRobots: "",
  }, base);
  assert.equal(withoutDescription.descriptionPresent, false);
  assert.match(withoutDescription.issue || "", /has no HTML meta description/);
});

test("deliberately nonindex public sample stays a noindex finding rather than a missing-canonical rewrite instruction", () => {
  const base = "https://books.freddybremseth.com";
  const url = base + "/book/hidden";
  const sample = inspectPublicSample(url, {
    url, status: 200, contentType: "text/html",
    body: '<title>Hidden</title><meta name="robots" content="noindex"><h1>Hidden</h1>',
    xRobots: "",
  }, base);
  assert.match(sample.issue || "", /explicitly returns noindex/);
});

test("all portfolio brands rotate sampled pages while keeping category diversity and request limits", () => {
  const sitemap = xml([BASE + '/guide/one', BASE + '/guide/two', BASE + '/guide/three',
    BASE + '/eiendommer/one', BASE + '/eiendommer/two', BASE + '/omrader/altea']);
  const first = choosePublicSitemapPages(sitemap, BASE, 3, 0);
  const next = choosePublicSitemapPages(sitemap, BASE, 3, 1);
  assert.equal(first.length, 3);
  assert.equal(next.length, 3);
  assert.notDeepEqual(first, next);
  assert.ok(next.includes(BASE + '/guide/two'));
  assert.ok(next.includes(BASE + '/eiendommer/two'));
});
