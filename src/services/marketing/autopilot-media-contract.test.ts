import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const media = fs.readFileSync(
  path.join(process.cwd(), "src/services/marketing/autopilot-media.ts"),
  "utf8",
);
const organization = fs.readFileSync(
  path.join(process.cwd(), "src/services/media/organization.ts"),
  "utf8",
);
const orchestrator = fs.readFileSync(
  path.join(process.cwd(), "src/services/marketing/autonomous-orchestrator.ts"),
  "utf8",
);

test("Growth OS media bridge uses the canonical RealtyFlow Media Studio tenant", () => {
  assert.match(media, /getDefaultMediaOrganizationId/);
  assert.match(organization, /export async function getDefaultMediaOrganizationId/);
  assert.doesNotMatch(media, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test("Growth OS media bridge creates an idempotent 4:5 Instagram image through the existing job service", () => {
  assert.match(media, /createMediaJob/);
  assert.match(media, /platform:\s*"instagram"/);
  assert.match(media, /mediaType:\s*"image"/);
  assert.match(media, /aspectRatio:\s*"4:5"/);
  assert.match(media, /qualityTier:\s*"balanced"/);
  assert.match(media, /growth-instagram-media:/);
});

test("Growth OS media bridge recovers the same idempotent job instead of creating duplicate media", () => {
  assert.match(media, /retryMediaJob/);
  assert.match(media, /refreshMediaJob/);
  assert.match(media, /\["failed",\s*"expired",\s*"cancelled"\]/);
  assert.match(media, /\["submitted",\s*"processing"\]/);
  assert.match(media, /if \(result\.existing\)/);
  assert.match(media, /recoverExistingMediaJob/);
});

test("Growth OS media bridge requires a completed public HTTPS asset and conservative visual claims", () => {
  assert.match(media, /String\(job\.status\) !== "completed"/);
  assert.match(media, /public_url/);
  assert.match(media, /\^https:/);
  assert.match(media, /Do not invent a product interface/);
  assert.match(media, /Do not include readable text/);
});

test("Instagram without image or video fails closed before policy/live persistence", () => {
  const mediaGate = orchestrator.indexOf('asset.channel === "instagram"');
  const policy = orchestrator.indexOf("// 4) Policy Engine");
  const liveDraftPersist = orchestrator.indexOf('await persist({ state: "draft"');
  assert.ok(mediaGate > 0);
  assert.ok(mediaGate < policy);
  assert.ok(mediaGate < liveDraftPersist);
  assert.match(orchestrator, /MEDIA_ASSET_MISSING/);
  assert.match(orchestrator, /autonomy_mode:\s*"blocked"/);
});
