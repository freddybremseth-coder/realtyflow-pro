import assert from "node:assert/strict";
import test from "node:test";
import { workspaceResponsibilities } from "./responsibility-summary";

test("workspace responsibilities are derived only from granted capabilities", () => {
  const result = workspaceResponsibilities("pinosoecolife", [
    "crm.read",
    "properties.catalog.read",
    "visibility.read",
    "content.edit",
    "reels.create",
    "email.draft",
    "nexus.read",
  ]);
  assert.deepEqual(result.map(item => item.id), [
    "customers", "properties", "growth", "social", "email", "nexus",
  ]);
});

test("Corporate responsibility is Zen-only even when a forged permission list is supplied", () => {
  const zen = workspaceResponsibilities("zeneco", ["corporate.read"]);
  const pinoso = workspaceResponsibilities("pinosoecolife", ["corporate.read"]);
  assert.equal(zen.some(item => item.id === "corporate"), true);
  assert.equal(pinoso.some(item => item.id === "corporate"), false);
});

test("read-only capabilities still appear as responsibility areas without inventing write access", () => {
  const result = workspaceResponsibilities("zeneco", [
    "crm.joint.read",
    "marketing.read",
    "email.read",
    "nexus.read",
  ]);
  assert.deepEqual(result.map(item => item.id), ["customers", "social", "email", "nexus"]);
});
