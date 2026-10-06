import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const routePath = fileURLToPath(new URL("./route.ts", import.meta.url));
const pagePath = fileURLToPath(new URL("../../../(content)/os/page.tsx", import.meta.url));

test("OS status reads workspace responsibility coverage through the service-only snapshot boundary", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /loadWorkspaceTeamCoreSnapshot/);
  assert.doesNotMatch(source, /schema\("core"\)/);
  assert.match(source, /buildWorkspaceTeamResponsibilityOverview/);
  assert.match(source, /buildWorkspaceResponsibilityAttention/);
  assert.match(source, /sourceError\(sourceErrors, "Team ansvar"/);
});

test("OS status exposes responsibility summary and attention without creating write actions", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /workspaceResponsibilityUnassigned/);
  assert.match(source, /workspaceResponsibilityShared/);
  assert.match(source, /workspaceResponsibilities:/);
  assert.doesNotMatch(source, /brand_workspace_responsibilities"\)\.insert/);
  assert.doesNotMatch(source, /brand_workspace_responsibilities"\)\.update/);
  assert.doesNotMatch(source, /brand_workspace_responsibilities"\)\.delete/);
});

test("Attention Center links team responsibility health to owner administration", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /href="\/workspace-users"/);
  assert.match(source, />Teamansvar</);
  assert.match(source, /workspaceResponsibilityUnassigned/);
  assert.match(source, /workspaceResponsibilityShared/);
});
