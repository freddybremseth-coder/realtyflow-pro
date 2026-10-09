import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static integration contracts until Meta Graph can be exercised with a
// dedicated test account. These checks do not publish or need credentials.
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const publisher = read("src/services/publishing/publisher.ts");
const schedule = read("src/app/api/schedule/route.ts");
const cron = read("src/app/api/cron/auto-publish/route.ts");
const migration = read("supabase/migrations/20261009163000_fix_carousel_publish_claim_status.sql");

test("carousels publish with child media then parent container", () => {
  assert.match(publisher, /is_carousel_item:\s*"true"/);
  assert.match(publisher, /media_type:\s*"CAROUSEL"/);
  assert.match(publisher, /post\("media_publish",\s*\{ creation_id: parentId \}\)/);
});
test("claim before external carousel publish and prevent blind retry", () => {
  const claim = publisher.indexOf('"claim_content_carousel_publish"');
  const publish = publisher.indexOf("return publishInstagramCarousel(");
  assert.ok(claim >= 0 && publish > claim, "claim must precede Meta publish");
  assert.match(publisher, /carouselClaimed\s*\?\s*"processing"\s*:\s*"failed"/);
  assert.match(publisher, /if \(!carouselUrls\.length \|\| carouselClaimed\)/);
  assert.match(migration, /status='processing'/);
});
test("scheduler and cron both refuse unsupported carousel scheduling", () => {
  assert.match(schedule, /draftRow\.visual_format === "carousel"/);
  assert.match(schedule, /CAROUSEL_SCHEDULING_NOT_READY/);
  assert.match(cron, /post\.visual_format === "carousel"/);
  assert.match(cron, /CAROUSEL_SCHEDULING_NOT_READY/);
});
