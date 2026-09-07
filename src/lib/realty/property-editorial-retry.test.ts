import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("property editorial cron keeps retry policy bounded", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/cron/property-editorial/route.ts"),
    "utf8",
  );
  assert.match(route, /MAX_ATTEMPTS = 5/);
  assert.match(route, /Math\.min\(2 \*\* Math\.max\(attempts - 1, 0\) \* 5, 60\)/);
});
