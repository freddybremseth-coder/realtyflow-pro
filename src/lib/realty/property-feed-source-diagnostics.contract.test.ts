import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("property source refresh runs every six hours after diagnostics", () => {
  assert.match(
    vercel,
    /"path": "\/api\/cron\/property-feed-source-refresh", "schedule": "0 \*\/6 \* \* \*"/,
  );
  assert.doesNotMatch(
    vercel,
    /"path": "\/api\/cron\/property-feed-source-refresh", "schedule": "\*\/5 \* \* \* \*"/,
  );
});
