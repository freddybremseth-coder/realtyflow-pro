import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const nextConfig = fs.readFileSync("next.config.mjs", "utf8");

test("Vercel production build keeps peak memory below the standard builder ceiling", () => {
  assert.equal(packageJson.engines?.node, "24.x");
  assert.match(packageJson.scripts.build, /--max-old-space-size=5120/);
  assert.match(nextConfig, /webpackBuildWorker:\s*true/);
  assert.match(nextConfig, /productionBrowserSourceMaps:\s*false/);
  assert.match(nextConfig, /serverSourceMaps:\s*false/);
  assert.match(nextConfig, /outputFileTracingIncludes/);
  assert.match(nextConfig, /config\.cache = false/);
  assert.match(nextConfig, /sourcemap:\s*false/);
});
