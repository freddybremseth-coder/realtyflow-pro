import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const routePaths = [
  "../../app/api/team-workload/route.ts",
  "../../app/api/internal-alerts/route.ts",
  "../../app/api/revenue/executive-briefing/route.ts",
  "../../app/api/os/status/route.ts",
  "../../app/api/workspaces/[brandKey]/capabilities/route.ts",
].map(path => fileURLToPath(new URL(path, import.meta.url)));

const helperPath = fileURLToPath(new URL("./team-core-snapshot.ts", import.meta.url));

test("workspace operational routes keep core behind the service-only RPC boundary", async () => {
  for (const routePath of routePaths) {
    const source = await readFile(routePath, "utf8");
    assert.match(source, /loadWorkspaceTeamCoreSnapshot/);
    assert.doesNotMatch(source, /schema\("core"\)/);
  }

  const helper = await readFile(helperPath, "utf8");
  assert.match(helper, /workspace_user_admin_snapshot/);
  assert.doesNotMatch(helper, /schema\("core"\)/);
});
