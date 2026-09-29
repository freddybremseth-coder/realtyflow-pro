import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const usersApi = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspace-users/route.ts"), "utf8");
const resetApi = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/reset-password/route.ts"), "utf8");
const resetPage = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/reset-password/page.tsx"), "utf8");
const usersPage = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/workspace-users/page.tsx"), "utf8");

test("new workspace users receive self-service Supabase invitations", () => {
  assert.match(usersApi, /inviteUserByEmail\(email/);
  assert.match(usersApi, /reset-password\?flow=workspace-invite/);
  assert.doesNotMatch(usersApi, /action === "CREATE_USER"[\s\S]{0,5000}password: body\.password/);
  assert.match(usersPage, /Opprett og send invitasjon/);
  assert.match(usersPage, /Passord settes av brukeren/);
});

test("workspace password recovery is admitted only through active server-side directory state", () => {
  assert.match(resetApi, /workspace_login_directory/);
  assert.match(resetApi, /status.*active/s);
  assert.match(resetApi, /Do not reveal whether an email exists or has access/);
  assert.match(resetApi, /resetPasswordForEmail/);
});

test("invite and recovery password page applies workspace-strength password rules", () => {
  assert.match(resetPage, /password\.length < 12/);
  assert.match(resetPage, /groups < 3/);
  assert.match(resetPage, /gyldig Supabase invitasjon eller passordgjenoppretting/);
});
