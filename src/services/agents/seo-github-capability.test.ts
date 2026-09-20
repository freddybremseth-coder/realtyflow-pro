import test from "node:test";
import assert from "node:assert/strict";
import { classifyGithubSeoCapability } from "./seo-github-capability";

const repo = "freddybremseth-coder/freddybremseth";
const file = { sha: "a".repeat(40), type: "file" };

test("exact repo, file and push permission are necessary, not proof of a live website publisher", () => {
  assert.deepEqual(classifyGithubSeoCapability(repo,
    { full_name: repo, permissions: { push: true } }, file),
  { canReadTarget: true, hasPushPermission: true, status: "permission_detected" });
});

test("read-only token, missing target, spoofed repository and directory all fail closed", () => {
  assert.equal(classifyGithubSeoCapability(repo,
    { full_name: repo, permissions: { push: false } }, file).status, "read_only");
  assert.equal(classifyGithubSeoCapability(repo,
    { full_name: repo, permissions: { push: true } }, null).status, "target_unavailable");
  assert.equal(classifyGithubSeoCapability(repo,
    { full_name: "attacker/freddybremseth", permissions: { push: true } }, file).status, "github_unavailable");
  assert.equal(classifyGithubSeoCapability(repo,
    { full_name: repo, permissions: { admin: true } }, { sha: "a".repeat(40), type: "dir" }).status, "target_unavailable");
  assert.equal(classifyGithubSeoCapability(repo,
    { full_name: repo, permissions: { admin: true } }, { sha: "incomplete", type: "file" }).status, "target_unavailable");
});
