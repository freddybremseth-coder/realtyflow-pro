import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("property source diagnostics temporarily run every five minutes", () => {
  assert.match(
    vercel,
    /"path": "\/api\/cron\/property-feed-source-refresh", "schedule": "\*\/5 \* \* \* \*"/,
  );
});
