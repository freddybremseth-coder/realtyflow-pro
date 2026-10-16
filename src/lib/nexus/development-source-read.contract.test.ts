import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const reader = fs.readFileSync("src/lib/nexus/development-source-read.ts", "utf8");
const route = fs.readFileSync("src/app/api/nexus/development-tasks/[taskId]/source/route.ts", "utf8");
test("GitHub source reads are revision-pinned and limited to allowlisted files", () => {
  assert.match(reader, /allowedDevelopmentSourcePaths\(repository\)\.includes\(path\)/);
  assert.match(reader, /searchParams\.set\("ref", sha\)/);
  assert.match(reader, /method: "GET"/);
  assert.doesNotMatch(reader, /method: "POST"/);
  assert.match(reader, /raw\.slice\(0, 12000\)/);
});
test("source endpoint checks owner and scoped task ownership", () => {
  assert.match(route, /actor\.role !== "OWNER"/);
  assert.match(route, /actor\.source !== "owner-session"/);
  assert.match(route, /\.eq\("requested_by", actor\.email\)/);
  assert.match(route, /executed: false/);
});
