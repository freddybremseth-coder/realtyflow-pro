import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/youtube/route.ts"),
  "utf8",
);
const policy = fs.readFileSync(
  path.join(process.cwd(), "src/lib/workspaces/brand-policy.ts"),
  "utf8",
);
const moduleCatalog = fs.readFileSync(
  path.join(process.cwd(), "src/lib/workspaces/module-catalog.ts"),
  "utf8",
);

test("workspace YouTube phase one is explicitly Zen-only", () => {
  assert.match(route, /const BRAND = "zeneco"/);
  assert.match(route, /params\.brandKey !== BRAND/);
  assert.match(route, /YOUTUBE_NOT_AVAILABLE_FOR_BRAND/);
  assert.match(moduleCatalog, /brandScope: "zeneco-only"/);
  assert.match(policy, /"youtube\.read"/);
  assert.match(policy, /"youtube\.publish"/);
});

test("workspace YouTube requires separate read and publish permissions", () => {
  assert.match(route, /requireBrandWorkspace\(request, BRAND, "youtube\.read"\)/);
  assert.match(route, /requireBrandWorkspace\(request, BRAND, "youtube\.publish"\)/);
});

test("workspace YouTube publishes only a ready Zen Reel to the verified live channel", () => {
  assert.match(route, /\.eq\("brand", BRAND\)/);
  assert.match(route, /job\.state !== "ready"/);
  assert.match(route, /getTokensForBrandPlatform\(BRAND, "youtube"\)/);
  assert.match(route, /getChannelInfo\(BRAND, \{ requireBrandToken: true \}\)/);
  assert.match(route, /live\.id !== connection\.channel\.external_id/);
  assert.match(route, /expectedChannelId: channelState\.channel\.external_id/);
  assert.match(route, /requireBrandToken: true/);
  assert.match(route, /singleInsertAttempt: true/);
});

test("workspace YouTube reserves delivery before external upload and never auto-retries ambiguity", () => {
  const reserve = route.indexOf('.from("remaster_reel_deliveries").insert');
  const upload = route.indexOf("uploadVideo(buffer");
  assert.ok(reserve > -1);
  assert.ok(upload > reserve);
  assert.match(route, /YOUTUBE_PUBLISH_ALREADY_ATTEMPTED/);
  assert.match(route, /state: "needs_review"/);
});

test("workspace YouTube keeps Zen website attribution in published descriptions", () => {
  assert.match(route, /https:\/\/zenecohomes\.com\//);
});
