import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSpecialistMediaBridgeRows } from "@/services/media/specialist-asset-bridge";

const input = {
  sourceSystem: "remaster_reel_jobs",
  sourceJobId: "11111111-1111-4111-8111-111111111111",
  provider: "remaster",
  brandId: "zeneco",
  title: "Altea Hills Reel",
  description: "Rendered in Re-Master.",
  publicUrl: "https://example.com/storage/v1/object/public/remaster-reels/11111111-1111-4111-8111-111111111111.mp4",
  storageBucket: "remaster-reels",
  storagePath: "11111111-1111-4111-8111-111111111111.mp4",
  mimeType: "video/mp4",
  mediaType: "video" as const,
  durationSeconds: 30,
  aspectRatio: "9:16",
  model: "ffmpeg",
  operation: "reel_render",
  actorEmail: "owner@example.com",
  completedAt: "2026-10-03T08:00:00.000Z",
  sourceState: "ready",
  sourceMetadata: { visualCount: 4 },
  tags: ["reel"],
};

test("specialist bridge mirrors by reference instead of copying the rendered file", () => {
  const rows = buildSpecialistMediaBridgeRows(input, "22222222-2222-4222-8222-222222222222", "2026-10-03T08:01:00.000Z");

  assert.equal(rows.job.id, input.sourceJobId);
  assert.equal(rows.asset.id, input.sourceJobId);
  assert.equal(rows.asset.job_id, input.sourceJobId);
  assert.equal(rows.asset.storage_bucket, "remaster-reels");
  assert.equal(rows.asset.storage_path, input.storagePath);
  assert.equal(rows.asset.public_url, input.publicUrl);
  assert.equal((rows.asset.metadata_json as Record<string, unknown>).bridgeMode, "reference-only");
  assert.equal((rows.asset.metadata_json as Record<string, unknown>).copiedFile, false);
});

test("specialist bridge keeps the source renderer while Media Studio becomes the canonical library", () => {
  const rows = buildSpecialistMediaBridgeRows(input, "22222222-2222-4222-8222-222222222222");

  assert.equal(rows.job.provider, "remaster");
  assert.equal(rows.job.provider_job_id, input.sourceJobId);
  assert.equal(rows.job.status, "completed");
  assert.equal(rows.job.idempotency_key, `specialist:remaster_reel_jobs:${input.sourceJobId}`);
  assert.equal(rows.asset.asset_type, "specialist_render");
  assert.equal(rows.asset.ai_generated, false);
  assert.equal(rows.asset.status, "active");
  assert.deepEqual(rows.asset.tags, ["specialist-render", "remaster_reel_jobs", "zeneco", "video", "reel"]);
});
