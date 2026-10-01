import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceTodayActions } from "./today-priority";

test("prioritizes existing customer work before role-based growth tasks", () => {
  const actions = buildWorkspaceTodayActions({
    brandKey: "zeneco",
    permissions: ["crm.read", "corporate.read", "content.read", "properties.catalog.read"],
    contactCount: 4,
  });
  assert.equal(actions[0]?.id, "crm-follow-up");
  assert.equal(actions[0]?.area, "leads");
});

test("includes Nexus attention only when nexus.read is granted", () => {
  const signal = [{ level: "action" as const, title: "Fix source", detail: "A source needs review." }];
  const withoutNexus = buildWorkspaceTodayActions({
    brandKey: "zeneco",
    permissions: ["content.read"],
    contactCount: 0,
    attention: signal,
  });
  assert.equal(withoutNexus.some(action => action.source === "nexus"), false);

  const withNexus = buildWorkspaceTodayActions({
    brandKey: "zeneco",
    permissions: ["nexus.read", "content.read"],
    contactCount: 0,
    attention: signal,
  });
  assert.equal(withNexus[0]?.source, "nexus");
});

test("does not surface Zen corporate or YouTube actions for Pinoso", () => {
  const actions = buildWorkspaceTodayActions({
    brandKey: "pinosoecolife",
    permissions: ["corporate.read", "youtube.read", "content.read"],
    contactCount: 0,
    limit: 10,
  });
  assert.equal(actions.some(action => action.id === "corporate"), false);
  assert.equal(actions.some(action => action.id === "youtube"), false);
});

test("falls back to training when the user has no actionable permissions", () => {
  const actions = buildWorkspaceTodayActions({
    brandKey: "zeneco",
    permissions: [],
    contactCount: 0,
  });
  assert.deepEqual(actions.map(action => action.id), ["training"]);
});


test("explicit personal responsibilities narrow Today priorities without removing access", () => {
  const actions = buildWorkspaceTodayActions({
    brandKey: "zeneco",
    permissions: [
      "crm.joint.read","properties.catalog.read","visibility.read","content.read",
      "reels.read","reels.create","email.read","email.draft","nexus.read",
    ],
    responsibilities: ["newsletter"],
    contactCount: 5,
    attention: [{ level: "action", title: "Nexus action", detail: "Needs work" }],
    limit: 10,
  });
  assert.deepEqual(actions.map(action => action.id), ["newsletter"]);
});

test("role profile responsibilities can prioritize customer and property work", () => {
  const actions = buildWorkspaceTodayActions({
    brandKey: "pinosoecolife",
    permissions: ["crm.read","properties.catalog.read","visibility.read","content.read"],
    responsibilities: ["new-leads","property-matching"],
    contactCount: 3,
    limit: 10,
  });
  assert.equal(actions[0]?.id, "crm-follow-up");
  assert.equal(actions.some(action => action.id === "properties"), true);
  assert.equal(actions.some(action => action.id === "visibility-content"), false);
});

test("newsletter responsibility needs email draft/send capability", () => {
  const actions = buildWorkspaceTodayActions({
    brandKey: "pinosoecolife",
    permissions: ["email.read"],
    responsibilities: ["newsletter"],
    contactCount: 0,
  });
  assert.deepEqual(actions.map(action => action.id), ["training"]);
});
