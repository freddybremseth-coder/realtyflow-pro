import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/workspaces/[brandKey]/reels/route.ts", "utf8");
const publishRoute = fs.readFileSync("src/app/api/workspaces/[brandKey]/reels/publish/route.ts", "utf8");
const middleware = fs.readFileSync("src/middleware.ts", "utf8");
const accessControl = fs.readFileSync("src/lib/access-control.ts", "utf8");

test("workspace Reels is limited to approved brands and exact capabilities", () => {
  assert.match(route, /new Set\(\["zeneco", "pinosoecolife"\]\)/);
  assert.match(publishRoute, /new Set\(\["zeneco", "pinosoecolife"\]\)/);
  assert.match(route, /requireBrandWorkspace\(request, brandKey, "reels\.read"\)/);
  assert.match(route, /requireBrandWorkspace\(request, brandKey, "reels\.create"\)/);
  assert.match(publishRoute, /requireBrandWorkspace\(request, brandKey, "reels\.publish"\)/);
  assert.match(middleware, /resource === "reels"/);
  assert.match(accessControl, /workspaceParts\[4\] === "reels"/);
});

test("property-specific Reel creation rechecks catalogue access and exact brand visibility", () => {
  assert.match(route, /requireBrandWorkspace\(request, brandKey, "properties\.catalog\.read"\)/);
  assert.match(route, /from\("property_brand_visibility"\)/);
  assert.match(route, /\.eq\("brand_id", brandKey\)/);
  assert.match(route, /\.eq\("visible", true\)/);
  assert.match(route, /PROPERTY_NOT_AVAILABLE_FOR_BRAND/);
  assert.match(route, /\.eq\("show_on_website", true\)/);
  assert.match(route, /\.eq\("website_visible", true\)/);
});

test("workspace Reel jobs remain brand-scoped through create, ready and failure transitions", () => {
  assert.match(route, /brand: brandKey/);
  assert.match(route, /created_by: access\.value\.verifiedEmail/);
  assert.match(route, /\.eq\("id", created\.id\)\.eq\("brand", brandKey\)\.eq\("state", "rendering"\)/);
  assert.match(route, /state: "failed"/);
});

test("workspace Reel publishing binds job, channel and OAuth account to the same brand", () => {
  assert.match(publishRoute, /\.eq\("id", jobId\)\.eq\("brand", brandKey\)/);
  assert.match(publishRoute, /getTokensForBrandPlatform\(brandKey, channel\)/);
  assert.match(publishRoute, /connection\.channel\.brand_id !== brandKey/);
  assert.match(publishRoute, /social_channel_id: connection\.channel\.id/);
  assert.match(publishRoute, /brand_id: brandKey/);
  assert.match(publishRoute, /REEL_CHANNEL_NOT_CONNECTED/);
  assert.match(publishRoute, /REEL_CHANNEL_SCOPE_MISSING/);
});

test("workspace Reel publishing reserves delivery before external publication and fails closed on ambiguity", () => {
  const reserve = publishRoute.indexOf('.from("remaster_reel_deliveries").insert');
  const instagramPublish = publishRoute.indexOf("publisher.publish(");
  const facebookPublish = publishRoute.indexOf("publishFacebookPageReel({");
  assert.ok(reserve > -1);
  assert.ok(instagramPublish > reserve);
  assert.ok(facebookPublish > reserve);
  assert.match(publishRoute, /REEL_PUBLISH_ALREADY_ATTEMPTED/);
  assert.match(publishRoute, /state: "needs_review"/);
  assert.match(publishRoute, /REEL_PUBLICATION_UNCONFIRMED/);
});

test("property Reel captions keep a direct canonical property URL for the selected brand", () => {
  assert.match(route, /www\.pinosoecolife\.com/);
  assert.match(route, /www\.zenecohomes\.com/);
  assert.match(route, /\/eiendommer\//);
  assert.match(route, /REEL_PROPERTY_LINK_UNAVAILABLE/);
});
