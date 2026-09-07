import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/property-feed-source-refresh/route.ts"), "utf8");

test("source refresh worker is cron-protected and bounded", () => {
  assert.match(route, /requireCronApi\(request\)/);
  assert.match(route, /const MAX_SOURCES_PER_RUN = 5/);
  assert.match(route, /const SOURCE_FACT_BATCH_SIZE = 500/);
  assert.match(route, /\.limit\(MAX_SOURCES_PER_RUN\)/);
});

test("source refresh only reads registered active XML URL sources and validates public URLs", () => {
  assert.match(route, /\.from\("import_sources"\)/);
  assert.match(route, /\.eq\("active", true\)/);
  assert.match(route, /\.eq\("type", "xml_url"\)/);
  assert.match(route, /validatePublicWebsiteUrl\(String\(source\.url\)\)/);
});

test("source refresh parses full RedSP facts and applies them through service RPC", () => {
  assert.match(route, /extractRedspEditorialSourceRows\(xmlText\)/);
  assert.match(route, /property_feed_source_cache/);
  assert.match(route, /\.rpc\("apply_property_feed_source_facts"/);
  assert.doesNotMatch(route, /\.from\("properties"\)\.(?:insert|upsert|delete)/);
});

test("source refresh records sanitized operational result metadata", () => {
  assert.match(route, /source_facts_refreshed_at/);
  assert.match(route, /source_facts_parsed/);
  assert.match(route, /source_facts_updated/);
  assert.match(route, /source_facts_status/);
  assert.match(route, /source_facts_consecutive_empty_runs/);
  assert.match(route, /source_facts_last_error/);
  assert.match(route, /slice\(0, 1000\)/);
});

test("zero-row diagnostics record structure only and never persist raw XML", () => {
  assert.match(route, /source_facts_diagnostics/);
  assert.match(route, /content_type/);
  assert.match(route, /response_bytes/);
  assert.match(route, /first_tags/);
  assert.match(route, /has_property_tag/);
  assert.match(route, /has_ref_tag/);
  assert.match(route, /has_desc_tag/);
  assert.match(route, /property_self_closing/);
  assert.match(route, /property_attribute_names/);
  assert.match(route, /feed_version/);
  assert.doesNotMatch(route, /source_facts_raw_xml|xml_preview|response_body/);
});

test("empty Kyero wrapper is classified without mutating property inventory", () => {
  assert.match(route, /function looksLikeEmptyFeed/);
  assert.match(route, /diagnostics\.response_bytes < 2048/);
  assert.match(route, /diagnostics\.property_self_closing/);
  assert.match(route, /status: "empty_feed"/);
  assert.match(route, /Property source returned an empty Kyero feed/);
  assert.match(route, /continue;/);
});
