import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src/app/(content)/nexus-os/stage-readiness/profile-activation/page.tsx"), "utf8");

test("profile activation keeps one-contact explicit approval and offers only explicit next navigation", () => {
  assert.match(source, /\/api\/nexus\/persona-backfill\/approve/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /\/api\/nexus\/profile-activation-priority/);
  assert.match(source, /Neste kunde/);
  assert.doesNotMatch(source, /autoApprove|bulkApprove|approveAll/);
  assert.doesNotMatch(source, /Promise\.all\([^)]*approve/);
});
