import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const previewRoute = fs.readFileSync("src/app/api/workspace-user-preview/route.ts", "utf8");
const apiAdmin = fs.readFileSync("src/lib/api-admin.ts", "utf8");
const brandAccess = fs.readFileSync("src/lib/workspaces/require-brand-workspace.ts", "utf8");
const sidebar = fs.readFileSync("src/components/layout/sidebar.tsx", "utf8");
const workspace = fs.readFileSync("src/app/(realty)/workspace/[brandKey]/page.tsx", "utf8");
const users = fs.readFileSync("src/app/(realty)/workspace-users/page.tsx", "utf8");
const logout = fs.readFileSync("src/app/api/auth/logout/route.ts", "utf8");

test("owner preview is signed, owner-only and bound to a verified workspace identity", () => {
  assert.match(previewRoute, /verifyAdminSession/);
  assert.match(previewRoute, /owner\.role !== "OWNER"/);
  assert.match(previewRoute, /verifyWorkspaceDirectorySession/);
  assert.match(previewRoute, /admitWorkspaceMemberLogin/);
  assert.match(previewRoute, /createWorkspacePreviewSession/);
  assert.match(apiAdmin, /source: "owner-preview"/);
  assert.match(apiAdmin, /verifyWorkspacePreviewSession/);
});

test("owner preview mirrors the member UI but cannot mutate workspace data", () => {
  assert.match(brandAccess, /OWNER_PREVIEW_READ_ONLY/);
  assert.match(brandAccess, /previewAllowsWorkspaceMethod\(request\.method\)/);
  assert.match(sidebar, /Forhåndsvisning · skrivebeskyttet/);
  assert.match(sidebar, /Avslutt forhåndsvisning/);
  assert.match(users, /Forhåndsvis som bruker/);
  assert.match(logout, /realtyflow_owner_preview/);
  assert.match(workspace, /Forhåndsvisning · skrivebeskyttet/);
  assert.match(workspace, /Avslutt forhåndsvisning og åpne som eier/);
  assert.match(workspace, /workspace-user-preview/);
});
