import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRemasterPipelineIdempotencyKey,
  canonicalRemasterPipelineInput,
  stableStringify,
} from "./remaster-job-idempotency";
import {
  assertValidPipelineStepTransition,
  assertValidStatusTransition,
  canStartYoutubeUpload,
  classifyExistingJobForCreate,
  classifyCancellation,
  classifyRetry,
  isYoutubeUploadAmbiguous,
} from "./remaster-job-state";
import type { RemasterPipelineIdempotencyInput, RemasterPipelineJobRow } from "./remaster-job-types";

function idempotencyInput(overrides: Partial<RemasterPipelineIdempotencyInput> = {}): RemasterPipelineIdempotencyInput {
  return {
    brand: "remasterfreddy",
    songId: "song-123",
    audioReference: "sha256:audio",
    metadataVersion: "metadata-v1",
    slideshowImages: ["https://assets.example/1.png", "https://assets.example/2.png"],
    logoUrl: "https://assets.example/logo.png",
    thumbnailUrl: null,
    publishingSettings: {
      mode: "manual",
      publishAt: "2026-06-07T18:00:00.000Z",
      timezone: "Europe/Madrid",
    },
    inputVersion: "input-v1",
    ...overrides,
  };
}

function job(overrides: Partial<RemasterPipelineJobRow> = {}): RemasterPipelineJobRow {
  return {
    id: "job-id",
    brand: "remasterfreddy",
    song_id: "song-123",
    status: "running",
    pipeline_step: "render_video",
    progress: 50,
    input_version: "input-v1",
    input_config: {},
    idempotency_key: "remaster_pipeline:test",
    retry_count: 0,
    max_retries: 3,
    retry_classification: "unknown",
    next_retry_at: null,
    error_code: null,
    error_message: null,
    lease_token: "lease",
    lease_owner: "worker",
    lease_expires_at: null,
    heartbeat_at: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    youtube_upload_started_at: null,
    youtube_video_id: null,
    youtube_url: null,
    manual_review_required: false,
    manual_review_reason: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
    ...overrides,
  };
}

test("builds canonical SHA-256 idempotency keys from effective input only", () => {
  const left = idempotencyInput({
    publishingSettings: {
      timezone: "Europe/Madrid",
      publishAt: "2026-06-07T18:00:00.000Z",
      mode: "manual",
    },
  });
  const right = idempotencyInput({
    publishingSettings: {
      mode: "manual",
      publishAt: "2026-06-07T18:00:00.000Z",
      timezone: "Europe/Madrid",
    },
  });

  assert.equal(buildRemasterPipelineIdempotencyKey(left), buildRemasterPipelineIdempotencyKey(right));
  assert.match(buildRemasterPipelineIdempotencyKey(left), /^remaster_pipeline:[a-f0-9]{64}$/);
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("changes idempotency key when input version changes after completion", () => {
  const first = buildRemasterPipelineIdempotencyKey(idempotencyInput({ inputVersion: "input-v1" }));
  const second = buildRemasterPipelineIdempotencyKey(idempotencyInput({ inputVersion: "input-v2" }));

  assert.notEqual(first, second);
});

test("classifies create policy for active and completed existing jobs", () => {
  assert.equal(classifyExistingJobForCreate("queued"), "duplicate_active");
  assert.equal(classifyExistingJobForCreate("running"), "duplicate_active");
  assert.equal(classifyExistingJobForCreate("waiting_retry"), "duplicate_active");
  assert.equal(classifyExistingJobForCreate("completed"), "blocked_completed");
  assert.equal(classifyExistingJobForCreate("completed", true), "create");
  assert.equal(classifyExistingJobForCreate("failed"), "create");
});

test("preserves slideshow order in canonical idempotency input", () => {
  const input = canonicalRemasterPipelineInput(idempotencyInput({
    slideshowImages: ["b.png", "a.png"],
  }));

  assert.deepEqual(input.slideshowImages, ["b.png", "a.png"]);
});

test("allows valid lifecycle and step transitions", () => {
  assert.doesNotThrow(() => assertValidStatusTransition("queued", "running"));
  assert.doesNotThrow(() => assertValidStatusTransition("running", "waiting_retry"));
  assert.doesNotThrow(() => assertValidStatusTransition("running", "completed"));
  assert.doesNotThrow(() => assertValidPipelineStepTransition("render_video", "upload_youtube"));
});

test("rejects invalid lifecycle and step transitions", () => {
  assert.throws(() => assertValidStatusTransition("completed", "running"));
  assert.throws(() => assertValidStatusTransition("cancelled", "queued"));
  assert.throws(() => assertValidPipelineStepTransition("upload_youtube", "render_video"));
});

test("classifies retry limits and ambiguous uploads", () => {
  assert.equal(classifyRetry(job({ retry_count: 1, max_retries: 3 })), "retryable");
  assert.equal(classifyRetry(job({ retry_count: 3, max_retries: 3 })), "not_retryable");
  assert.equal(
    classifyRetry(job({ youtube_upload_started_at: "2026-06-07T10:00:00.000Z" })),
    "manual_review",
  );
});

test("blocks duplicate YouTube upload decisions after side effects", () => {
  assert.equal(canStartYoutubeUpload(job()), true);
  assert.equal(canStartYoutubeUpload(job({ youtube_video_id: "abc123" })), false);
  assert.equal(canStartYoutubeUpload(job({ youtube_upload_started_at: "2026-06-07T10:00:00.000Z" })), false);
  assert.equal(isYoutubeUploadAmbiguous(job({ youtube_upload_started_at: "2026-06-07T10:00:00.000Z" })), true);
});

test("allows cancellation before upload and requires manual review after upload starts", () => {
  assert.equal(classifyCancellation(job({ status: "queued" })), "allowed");
  assert.equal(
    classifyCancellation(job({ youtube_upload_started_at: "2026-06-07T10:00:00.000Z" })),
    "manual_review_required",
  );
  assert.equal(classifyCancellation(job({ status: "completed", youtube_video_id: "abc123" })), "already_terminal");
});
