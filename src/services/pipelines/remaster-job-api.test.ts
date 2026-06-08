import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "../../lib/admin-auth";
import { createErrorEnvelope } from "../../lib/observability";
import { GET as getJobs, POST as createJob } from "../../app/api/neural-beat/jobs/route";
import { GET as getJob } from "../../app/api/neural-beat/jobs/[id]/route";
import { POST as retryJob } from "../../app/api/neural-beat/jobs/[id]/retry/route";
import {
  assertCanManualRetry,
  authorizeRemasterJobRequest,
  classifyCancelResponse,
  createJobResultResponse,
  jsonError,
  parseCreateJobBody,
  parseEventsQuery,
  parseListQuery,
  resetRemasterJobRateLimits,
  assertRateLimit,
  setRemasterJobRepositoryFactoryForTests,
  toCorrelationUuid,
  toEventDtos,
  toJobDto,
  type RemasterJobApiRepository,
} from "./remaster-job-api";
import { RemasterJobError } from "./remaster-job-errors";
import type { RemasterPipelineJobEventRow, RemasterPipelineJobRow } from "./remaster-job-types";

const VALID_CORRELATION_ID = "rf_mi7v4zk0_0123456789abcdef01234567";

function headers(values: Record<string, string> = {}) {
  return new Headers(values);
}

function cookies(value?: string) {
  return {
    get(name: string) {
      if (name !== "realtyflow_admin" || !value) return undefined;
      return { value };
    },
  };
}

function job(overrides: Partial<RemasterPipelineJobRow> = {}): RemasterPipelineJobRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    brand: "remasterfreddy",
    song_id: "song-1",
    status: "queued",
    pipeline_step: "pending",
    progress: 0,
    input_version: "input-v1",
    input_config: { secret: "hidden" },
    idempotency_key: "remaster_pipeline:test",
    retry_count: 0,
    max_retries: 3,
    retry_classification: "unknown",
    next_retry_at: null,
    error_code: null,
    error_message: null,
    lease_token: "do-not-return",
    lease_owner: "worker",
    lease_expires_at: "2999-01-01T00:00:00.000Z",
    heartbeat_at: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    cancel_requested_at: null,
    youtube_upload_started_at: null,
    youtube_video_id: null,
    youtube_url: null,
    manual_review_required: false,
    manual_review_reason: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<RemasterPipelineJobEventRow> = {}): RemasterPipelineJobEventRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    job_id: "11111111-1111-4111-8111-111111111111",
    event_sequence: 1,
    event_type: "step_started",
    level: "info",
    status: "running",
    pipeline_step: "download_audio",
    message: "Started with Bearer secret-token",
    details: {
      access_token: "hidden",
      safe: "visible",
    },
    correlation_id: "33333333-3333-4333-8333-333333333333",
    created_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    songId: "song-1",
    inputVersion: "input-v1",
    audioReference: "sha256:audio",
    metadataVersion: "metadata-v1",
    slideshowImages: ["https://cdn.example.com/slide-1.jpg"],
    logoUrl: "https://cdn.example.com/logo.png",
    thumbnailUrl: null,
    publishingSettings: {
      mode: "manual",
      publishAt: "2026-06-08T12:00:00.000Z",
      timezone: "Europe/Madrid",
      language: "no",
      multilingualDescription: true,
    },
    maxRetries: 3,
    ...overrides,
  };
}

function request(
  url: string,
  {
    method = "GET",
    body,
    headers: headerValues = {},
  }: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headerValues,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mockRepository(overrides: Partial<RemasterJobApiRepository> = {}): RemasterJobApiRepository {
  return {
    async createJob() {
      return { job: job(), duplicate: false, idempotencyKey: "key" };
    },
    async listJobs() {
      return [job()];
    },
    async getJob() {
      return job();
    },
    async listEvents() {
      return [event()];
    },
    async manualRetry() {
      return job({ status: "queued", retry_classification: "unknown" });
    },
    async requestCancel() {
      return job({ status: "running", cancel_requested_at: "2026-06-08T00:00:00.000Z" });
    },
    ...overrides,
  };
}

test.afterEach(() => {
  setRemasterJobRepositoryFactoryForTests(null);
  resetRemasterJobRateLimits();
});

test("rejects unauthenticated and wrong-admin requests", async () => {
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.REALTYFLOW_MIGRATION_SECRET;

  await assert.rejects(
    () => authorizeRemasterJobRequest({ headers: headers() }),
    (error: unknown) => error instanceof Error && error.message === "Authentication required",
  );

  const wrongAdmin = await createAdminSession("intruder@example.com");
  await assert.rejects(
    () => authorizeRemasterJobRequest({ headers: headers(), cookies: cookies(wrongAdmin) }),
    (error: unknown) => error instanceof Error && error.message === "Authentication required",
  );
});

test("route rejects unauthenticated request with safe envelope", async () => {
  delete process.env.REALTYFLOW_MIGRATION_SECRET;
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  const response = await getJobs(request("https://realtyflow.test/api/neural-beat/jobs", {
    headers: { "x-correlation-id": VALID_CORRELATION_ID },
  }) as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("route rejects invalid Re-Master migration secret with 403", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";
  const response = await getJobs(request("https://realtyflow.test/api/neural-beat/jobs", {
    headers: {
      "x-remaster-migration-secret": "wrong",
      "x-correlation-id": VALID_CORRELATION_ID,
    },
  }) as any);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "ADMIN_FORBIDDEN");
});

test("route allows valid server auth with repository mock", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";
  setRemasterJobRepositoryFactoryForTests(() => mockRepository());

  const response = await getJobs(request("https://realtyflow.test/api/neural-beat/jobs?limit=5", {
    headers: {
      "x-remaster-migration-secret": "server-secret",
      "x-correlation-id": VALID_CORRELATION_ID,
    },
  }) as any);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.correlationId, VALID_CORRELATION_ID);
  assert.equal(response.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal(body.jobs[0].songId, "song-1");
});

test("route creates jobs with fixed Re-Master brand and consistent correlation ID", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";
  let capturedBrand: string | null = null;
  setRemasterJobRepositoryFactoryForTests(() => mockRepository({
    async createJob(input) {
      capturedBrand = input.brand;
      return { job: job(), duplicate: false, idempotencyKey: "key" };
    },
  }));

  const response = await createJob(request("https://realtyflow.test/api/neural-beat/jobs", {
    method: "POST",
    body: validCreateBody({ brand: "client-controlled-brand" }),
    headers: {
      "x-remaster-migration-secret": "server-secret",
      "x-correlation-id": VALID_CORRELATION_ID,
    },
  }) as any);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal(body.correlationId, VALID_CORRELATION_ID);
  assert.equal(capturedBrand, "remasterfreddy");
  assert.equal(body.duplicate, false);
});

test("route response and event UUID derive from the same incoming correlation ID", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";
  let capturedCorrelationUuid: string | null = null;
  setRemasterJobRepositoryFactoryForTests(() => mockRepository({
    async getJob() {
      return job({ status: "failed" });
    },
    async manualRetry(input) {
      capturedCorrelationUuid = input.correlationId || null;
      return job({ status: "queued" });
    },
  }));

  const response = await retryJob(
    request("https://realtyflow.test/api/neural-beat/jobs/11111111-1111-4111-8111-111111111111/retry", {
      method: "POST",
      headers: {
        "x-remaster-migration-secret": "server-secret",
        "x-correlation-id": VALID_CORRELATION_ID,
      },
    }) as any,
    { params: { id: "11111111-1111-4111-8111-111111111111" } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal(body.correlationId, VALID_CORRELATION_ID);
  assert.equal(capturedCorrelationUuid, toCorrelationUuid(VALID_CORRELATION_ID));
});

test("route maps missing job schema to 503 without raw database details", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";
  setRemasterJobRepositoryFactoryForTests(() => mockRepository({
    async getJob() {
      throw {
        code: "42P01",
        message: 'relation "public.remaster_pipeline_jobs" does not exist',
      };
    },
  }));

  const response = await getJob(
    request("https://realtyflow.test/api/neural-beat/jobs/11111111-1111-4111-8111-111111111111", {
      headers: {
        "x-remaster-migration-secret": "server-secret",
        "x-correlation-id": VALID_CORRELATION_ID,
      },
    }) as any,
    { params: { id: "11111111-1111-4111-8111-111111111111" } },
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "JOB_SCHEMA_NOT_READY");
  assert.equal(body.error.message, "Re-Master job schema is not ready");
  assert.equal(serialized.includes("remaster_pipeline_jobs"), false);
  assert.equal(serialized.includes("42P01"), false);
});

test("route hides raw repository errors and secrets", async () => {
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";
  setRemasterJobRepositoryFactoryForTests(() => mockRepository({
    async getJob() {
      throw new Error("database failed with postgres://user:password@example.supabase.co/db");
    },
  }));

  const response = await getJob(
    request("https://realtyflow.test/api/neural-beat/jobs/11111111-1111-4111-8111-111111111111", {
      headers: {
        "x-remaster-migration-secret": "server-secret",
        "x-correlation-id": VALID_CORRELATION_ID,
      },
    }) as any,
    { params: { id: "11111111-1111-4111-8111-111111111111" } },
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.message, "Internal server error");
  assert.equal(serialized.includes("password@example"), false);
  assert.equal(serialized.includes("postgres://"), false);
});

test("allows valid Re-Master server auth and admin session auth", async () => {
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  process.env.REALTYFLOW_MIGRATION_SECRET = "server-secret";

  const serverAuth = await authorizeRemasterJobRequest({
    headers: headers({ "x-remaster-migration-secret": "server-secret" }),
  });
  assert.equal(serverAuth.kind, "server");

  const admin = await createAdminSession("freddy.bremseth@gmail.com");
  const adminAuth = await authorizeRemasterJobRequest({ headers: headers(), cookies: cookies(admin) });
  assert.equal(adminAuth.kind, "admin");
});

test("validates create input and ignores client-supplied brand", () => {
  const input = parseCreateJobBody(validCreateBody({ brand: "other-brand" }));

  assert.equal(input.brand, "remasterfreddy");
  assert.equal(input.songId, "song-1");
  assert.equal(input.slideshowImages.length, 1);

  assert.throws(() => parseCreateJobBody(validCreateBody({ slideshowImages: ["not-a-url"] })));
  assert.throws(() => parseCreateJobBody(validCreateBody({ slideshowImages: Array(25).fill("https://cdn.example.com/x.jpg") })));
});

test("list and event queries enforce safe filters and limits", () => {
  const list = parseListQuery(new URLSearchParams("songId=song-1&status=queued&limit=25"));
  assert.deepEqual(list, { songId: "song-1", status: "queued", limit: 25 });
  assert.throws(() => parseListQuery(new URLSearchParams("status=drop-table")));
  assert.throws(() => parseListQuery(new URLSearchParams("limit=500")));

  const events = parseEventsQuery(new URLSearchParams("limit=50&afterSequence=10"));
  assert.deepEqual(events, { limit: 50, afterSequence: 10 });
  assert.throws(() => parseEventsQuery(new URLSearchParams("afterSequence=-1")));
});

test("create responses use 201 for new jobs and 200 for active duplicates", async () => {
  const created = createJobResultResponse({ job: job(), duplicate: false }, VALID_CORRELATION_ID);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal((await created.json()).duplicate, false);

  const duplicate = createJobResultResponse({ job: job(), duplicate: true }, VALID_CORRELATION_ID);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
});

test("safe job DTO does not expose lease token or raw input config", () => {
  const dto = toJobDto(job({
    error_message: "Failed with Bearer secret-token",
    manual_review_reason: "postgres://user:password@example.supabase.co/db",
  }));
  const serialized = JSON.stringify(dto);

  assert.equal(serialized.includes("do-not-return"), false);
  assert.equal(serialized.includes("input_config"), false);
  assert.equal(serialized.includes("Bearer secret-token"), false);
  assert.equal(serialized.includes("password@example"), false);
  assert.equal(dto.songId, "song-1");
});

test("events are sorted and details are sanitized", () => {
  const events = toEventDtos([
    event({ event_sequence: 2, event_type: "second" }),
    event({ event_sequence: 1, event_type: "first" }),
  ]);

  assert.deepEqual(events.map((item) => item.eventType), ["first", "second"]);
  assert.equal(events[0].details.access_token, "[REDACTED]");
  assert.equal(events[0].details.safe, "visible");
  assert.equal(events[0].message, "Started with [REDACTED]");
});

test("retry policy follows state machine and blocks ambiguous YouTube uploads", () => {
  assert.doesNotThrow(() => assertCanManualRetry(job({ status: "failed", retry_classification: "not_retryable" })));
  assert.throws(() => assertCanManualRetry(job({ status: "running" })));
  assert.throws(() => assertCanManualRetry(job({ status: "failed", retry_count: 3, max_retries: 3 })));
  assert.throws(() => assertCanManualRetry(job({
    status: "failed",
    youtube_upload_started_at: "2026-06-08T00:00:00.000Z",
  })));
  assert.throws(() => assertCanManualRetry(job({ status: "failed", manual_review_required: true })));
});

test("cancel result distinguishes cancelled, requested, manual review, and terminal states", () => {
  assert.equal(classifyCancelResponse(job({ status: "cancelled" })), "cancelled");
  assert.equal(classifyCancelResponse(job({ status: "running", cancel_requested_at: "2026-06-08T00:00:00.000Z" })), "cancellation_requested");
  assert.equal(classifyCancelResponse(job({ manual_review_required: true })), "manual_review_required");
  assert.equal(classifyCancelResponse(job({ status: "completed" })), "already_terminal");
});

test("correlation IDs convert to stable UUIDs for database events", () => {
  const left = toCorrelationUuid(VALID_CORRELATION_ID);
  const right = toCorrelationUuid(VALID_CORRELATION_ID);

  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("safe error envelope does not leak database errors or secrets", async () => {
  const response = jsonError(
    new RemasterJobError("YOUTUBE_UPLOAD_AMBIGUOUS", "postgres://user:password@example.supabase.co/db"),
    VALID_CORRELATION_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "YOUTUBE_UPLOAD_AMBIGUOUS");
  assert.equal(JSON.stringify(body).includes("password@example"), false);

  const envelope = createErrorEnvelope({
    correlationId: VALID_CORRELATION_ID,
    code: "INTERNAL_ERROR",
    message: "Bearer secret-token",
  });
  assert.equal(envelope.error.message, "[REDACTED]");
});

test("minimal rate limiting blocks excessive writes per identity", () => {
  resetRemasterJobRateLimits();
  assert.doesNotThrow(() => assertRateLimit("admin", "create", 2, 1));
  assert.doesNotThrow(() => assertRateLimit("admin", "create", 2, 2));
  assert.throws(() => assertRateLimit("admin", "create", 2, 3));
});
