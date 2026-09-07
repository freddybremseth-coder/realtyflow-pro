import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/property-editorial/route.ts"),
  "utf8",
);

test("property editorial worker is cron protected and processes small batches", () => {
  assert.match(route, /requireCronApi\(request\)/);
  assert.match(route, /const JOB_LIMIT = 6/);
  assert.match(route, /\.limit\(JOB_LIMIT\)/);
});

test("worker reuses unchanged hashes and retries failures with a bounded attempt count", () => {
  assert.match(route, /existingEditorialHasSameSource/);
  assert.match(route, /const MAX_ATTEMPTS = 5/);
  assert.match(route, /status: exhausted \? "failed" : "retry"/);
  assert.match(route, /retryAt\(attempts\)/);
});
