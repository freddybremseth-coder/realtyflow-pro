import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { extractApprovedBookIdeas, isApprovedPublishingSignalSource } from "./publishing-market-watch";

test("market watch only accepts approved provider and import sources", () => {
  assert.equal(isApprovedPublishingSignalSource("amazon_creators_api"), true);
  assert.equal(isApprovedPublishingSignalSource("kdp_report_import"), true);
  assert.equal(isApprovedPublishingSignalSource("amazon_search"), false);
  assert.equal(isApprovedPublishingSignalSource("web_scrape"), false);
});

test("book ideas require both a named opportunity and provider evidence", () => {
  const ideas = extractApprovedBookIdeas([
    {
      id: "snapshot-1",
      source: "amazon_creators_api",
      query: "practical retirement planning",
      marketplace: "amazon.com",
      created_at: "2026-08-27T12:00:00Z",
      summary: { book_ideas: [
        { title: "Evidence First Retirement", angle: "Specific underserved question", opportunity_score: 82, evidence: { demand_index: 71, competition_index: 28 } },
        { title: "Unsupported Guess", angle: "No evidence", opportunity_score: 99 },
      ] },
    },
    {
      source: "amazon_search",
      query: "scraped",
      summary: { book_ideas: [{ title: "Scraped Idea", angle: "Disallowed", evidence: { result_count: 1 } }] },
    },
  ]);
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].title, "Evidence First Retirement");
  assert.equal(ideas[0].source, "amazon_creators_api");
});

test("market watch implementation contains no Amazon HTML fetch or browser impersonation", () => {
  const source = readFileSync(resolve(process.cwd(), "src/services/automation/publishing-market-watch.ts"), "utf8");
  assert.doesNotMatch(source, /amazon\.com\/s\?k=/i);
  assert.doesNotMatch(source, /mozilla\/5\.0/i);
  assert.doesNotMatch(source, /parseamazonresults/i);
  assert.doesNotMatch(source, /fetch\s*\(/i);
});
