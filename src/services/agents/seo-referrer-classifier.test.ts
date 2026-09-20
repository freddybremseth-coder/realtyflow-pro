import test from "node:test";
import assert from "node:assert/strict";
import { classifySearchDiscoveryReferrer } from "./seo-referrer-classifier";

test("AI referral from Gemini is not a Google web-search arrival", () => {
  assert.deepEqual(classifySearchDiscoveryReferrer("https://gemini.google.com/app/secret?query=private"), {
    source: "google_gemini", host: "gemini.google.com",
  });
  assert.deepEqual(classifySearchDiscoveryReferrer("https://www.google.com/search?q=privacy"), {
    source: "google_search", host: "www.google.com",
  });
});

test("known search and AI source hostnames are classified without visitor paths or queries", () => {
  const cases = [
    ["https://www.google.es/search?q=private", "google_search"],
    ["https://www.google.co.uk/search?q=private", "google_search"],
    ["https://www.bing.com/search?q=private", "bing_search"],
    ["https://chatgpt.com/c/private?token=secret", "chatgpt"],
    ["https://copilot.microsoft.com/chat?secret=x", "microsoft_copilot"],
    ["https://www.perplexity.ai/search?q=secret", "perplexity"],
    ["https://search.brave.com/search?q=secret", "brave_search"],
    ["https://duckduckgo.com/?q=secret", "duckduckgo"],
  ] as const;
  for (const [referrer, source] of cases) {
    const actual = classifySearchDiscoveryReferrer(referrer);
    assert.equal(actual?.source, source);
    assert.ok(actual?.host);
    assert.ok(!JSON.stringify(actual).includes("secret"));
    assert.ok(!JSON.stringify(actual).includes("private"));
  }
});

test("collector rejects spoofed, untrusted, malformed or insecure search-referrer hosts", () => {
  for (const referrer of [
    "", "not-a-url", "https://notgoogle.com/search", "https://google.com.evil.invalid/",
    "https://fakegoogle.com/", "https://evil-google.com/", "https://gemini.google.com.evil.invalid/",
    "https://www.bing.com.evil.invalid/", "https://chatgpt.evil.invalid/",
    "http://google.com/", "https://user:password@google.com/",
    "https://google.com:8443/", "javascript:alert(1)",
    "https://google.com/".padEnd(5000, "x"),
  ]) assert.equal(classifySearchDiscoveryReferrer(referrer), null, referrer);
});
