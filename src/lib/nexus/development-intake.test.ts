import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdvanceDevelopmentWork,
  normalizeDevelopmentPagePath,
  prepareDevelopmentIntake,
} from "./development-intake";

test("development intake is never treated as permission to execute", () => {
  const intake = prepareDevelopmentIntake({
    request: "  Fiks feilen på denne siden  ",
    scope: "bug",
    brandKey: "ZenEco",
    pagePath: "/content-studio?tab=posts",
  });
  assert.deepEqual(intake, {
    request: "Fiks feilen på denne siden",
    scope: "bug",
    brandKey: "zeneco",
    pagePath: "/content-studio",
    status: "requested",
    executionAuthorized: false,
  });
});

test("reject empty or oversized requests and untrusted paths", () => {
  assert.equal(prepareDevelopmentIntake({ request: " ", scope: "feature" }), null);
  assert.equal(prepareDevelopmentIntake({ request: "x".repeat(5001), scope: "feature" }), null);
  assert.equal(normalizeDevelopmentPagePath("https://outside.example"), null);
  assert.equal(normalizeDevelopmentPagePath("//outside.example"), null);
  assert.equal(normalizeDevelopmentPagePath("/foo\\bar"), null);
});

test("approval is necessary before execution and production deployment", () => {
  assert.equal(canAdvanceDevelopmentWork("needs_approval", "in_progress", false), false);
  assert.equal(canAdvanceDevelopmentWork("needs_approval", "in_progress", true), true);
  assert.equal(canAdvanceDevelopmentWork("verified", "deployed", false), false);
  assert.equal(canAdvanceDevelopmentWork("verified", "deployed", true), true);
  assert.equal(canAdvanceDevelopmentWork("requested", "deployed", true), false);
});
