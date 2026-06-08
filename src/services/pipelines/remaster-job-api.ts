import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CORRELATION_ID_HEADER,
  createErrorEnvelope,
  getOrCreateCorrelationId,
  redactSecrets,
  sanitizeErrorMessage,
} from "../../lib/observability";
import { verifyAdminSession } from "../../lib/admin-auth";
import { createServerClient } from "../../lib/supabase/server";
import { RemasterJobError } from "./remaster-job-errors";
import { RemasterPipelineJobRepository } from "./remaster-job-repository";
import {
  REMASTER_PIPELINE_STATUSES,
  type RemasterPipelineCreateJobInput,
  type RemasterPipelineJobEventRow,
  type RemasterPipelineJobRow,
  type RemasterPipelineJobStatus,
} from "./remaster-job-types";

export const REMASTER_JOB_BRAND = "remasterfreddy";
export const MAX_JOB_BODY_BYTES = 32 * 1024;
export const MAX_SLIDESHOW_IMAGES = 24;
export const MAX_EVENT_DETAILS_BYTES = 8 * 1024;

type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "ADMIN_FORBIDDEN"
  | "VALIDATION_FAILED"
  | "REQUEST_TOO_LARGE"
  | "RATE_LIMITED"
  | "SUPABASE_NOT_CONFIGURED"
  | "INTERNAL_ERROR"
  | RemasterJobError["code"];

export class RemasterJobApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RemasterJobApiError";
  }
}

export interface RemasterJobAuthRequest {
  headers: Headers;
  cookies?: {
    get(name: string): { value?: string } | undefined;
  };
}

export interface RemasterJobAuthContext {
  kind: "admin" | "server";
  identity: string;
}

export interface RemasterJobDto {
  id: string;
  songId: string;
  status: RemasterPipelineJobStatus;
  pipelineStep: string;
  progress: number;
  retryCount: number;
  maxRetries: number;
  retryClassification: string;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    heartbeatAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelRequestedAt: string | null;
    nextRetryAt: string | null;
    youtubeUploadStartedAt: string | null;
  };
  error: {
    code: string | null;
    message: string | null;
  };
  manualReview: {
    required: boolean;
    reason: string | null;
  };
  youtube: {
    videoId: string | null;
    url: string | null;
  };
}

export interface RemasterJobEventDto {
  sequence: number;
  eventType: string;
  level: RemasterPipelineJobEventRow["level"];
  status: string | null;
  pipelineStep: string | null;
  message: string | null;
  details: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
}

export interface RemasterJobApiRepository {
  createJob(input: RemasterPipelineCreateJobInput): Promise<{
    job: RemasterPipelineJobRow;
    duplicate: boolean;
    idempotencyKey: string;
  }>;
  listJobs(input?: {
    brand?: string;
    songId?: string;
    status?: RemasterPipelineJobStatus;
    limit?: number;
  }): Promise<RemasterPipelineJobRow[]>;
  getJob(jobId: string): Promise<RemasterPipelineJobRow>;
  listEvents(input: {
    jobId: string;
    limit?: number;
    afterSequence?: number;
  }): Promise<RemasterPipelineJobEventRow[]>;
  manualRetry(input: { jobId: string; correlationId?: string | null }): Promise<RemasterPipelineJobRow>;
  requestCancel(jobId: string, reason: string, correlationId?: string | null): Promise<RemasterPipelineJobRow>;
}

const urlSchema = z.string().trim().url().max(2048);
const optionalUrlSchema = z.union([urlSchema, z.null()]).optional();

const publishingSettingsSchema = z.object({
  mode: z.enum(["immediate", "auto", "manual"]).optional(),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().min(1).max(64).nullable().optional(),
  language: z.string().trim().min(2).max(16).nullable().optional(),
  multilingualDescription: z.boolean().optional(),
}).strict();

export const createJobBodySchema = z.object({
  brand: z.string().optional(),
  songId: z.string().trim().min(1).max(200),
  inputVersion: z.string().trim().min(1).max(120),
  audioReference: z.string().trim().min(1).max(2048),
  metadataVersion: z.string().trim().min(1).max(120),
  slideshowImages: z.array(urlSchema).max(MAX_SLIDESHOW_IMAGES),
  logoUrl: optionalUrlSchema,
  thumbnailUrl: optionalUrlSchema,
  publishingSettings: publishingSettingsSchema,
  maxRetries: z.number().int().min(0).max(10).optional(),
  forceNew: z.boolean().optional(),
}).strict();

const listQuerySchema = z.object({
  songId: z.string().trim().min(1).max(200).optional(),
  status: z.enum(REMASTER_PIPELINE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  afterSequence: z.coerce.number().int().min(0).optional(),
}).strict();

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function trimJsonDetails(value: Record<string, unknown>) {
  const redacted = redactSecrets(value) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);
  if (byteLength(serialized) <= MAX_EVENT_DETAILS_BYTES) return redacted;
  return {
    truncated: true,
    reason: "event_details_too_large",
  };
}

function responseHeaders(correlationId: string) {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    "cache-control": "no-store",
  };
}

export function jsonOk(body: Record<string, unknown>, status: number, correlationId: string) {
  return NextResponse.json(
    {
      ...body,
      correlationId,
    },
    {
      status,
      headers: responseHeaders(correlationId),
    },
  );
}

export function apiErrorStatus(error: unknown) {
  if (error instanceof RemasterJobApiError) return error.status;
  if (error instanceof RemasterJobError) {
    switch (error.code) {
      case "JOB_NOT_FOUND":
        return 404;
      case "LEASE_EXPIRED":
      case "LEASE_TOKEN_INVALID":
        return 423;
      case "INVALID_JOB_TRANSITION":
      case "INVALID_PIPELINE_STEP_TRANSITION":
      case "JOB_DUPLICATE_ACTIVE":
      case "RETRY_LIMIT_REACHED":
      case "YOUTUBE_UPLOAD_AMBIGUOUS":
      case "YOUTUBE_UPLOAD_NOT_STARTED":
      case "YOUTUBE_VIDEO_CONFLICT":
      case "CANCELLATION_REQUIRES_MANUAL_REVIEW":
        return 409;
      default:
        return 500;
    }
  }
  return 500;
}

export function apiErrorCode(error: unknown): ApiErrorCode {
  if (error instanceof RemasterJobApiError) return error.code;
  if (error instanceof RemasterJobError) return error.code;
  return "INTERNAL_ERROR";
}

export function jsonError(error: unknown, correlationId: string) {
  const status = apiErrorStatus(error);
  const code = apiErrorCode(error);
  const message = error instanceof Error ? error.message : "Internal server error";
  const details = error instanceof RemasterJobApiError ? error.details : undefined;

  return NextResponse.json(
    createErrorEnvelope({
      correlationId,
      code,
      message: status >= 500 ? "Internal server error" : message,
      status,
      details,
      retryable: status >= 500 ? "unknown" : "not_retryable",
    }),
    {
      status,
      headers: responseHeaders(correlationId),
    },
  );
}

export async function authorizeRemasterJobRequest(request: RemasterJobAuthRequest): Promise<RemasterJobAuthContext> {
  const expectedSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  const suppliedSecret = request.headers.get("x-remaster-migration-secret") || "";

  if (expectedSecret && suppliedSecret === expectedSecret) {
    return { kind: "server", identity: "remaster-server" };
  }

  if (suppliedSecret) {
    throw new RemasterJobApiError("ADMIN_FORBIDDEN", "Unauthorized Re-Master server client", 403);
  }

  const session = await verifyAdminSession(request.cookies?.get("realtyflow_admin")?.value);
  if (!session) {
    throw new RemasterJobApiError("AUTH_REQUIRED", "Authentication required", 401);
  }

  return { kind: "admin", identity: session.email || "admin" };
}

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function resetRemasterJobRateLimits() {
  rateLimits.clear();
}

export function assertRateLimit(identity: string, action: string, limit: number, now = Date.now()) {
  const key = `${identity}:${action}`;
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }

  if (current.count >= limit) {
    throw new RemasterJobApiError("RATE_LIMITED", "Rate limit exceeded", 429);
  }

  current.count += 1;
}

export async function readJsonBody(request: NextRequest, correlationId: string) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JOB_BODY_BYTES) {
    throw new RemasterJobApiError("REQUEST_TOO_LARGE", "Request body is too large", 413);
  }

  const text = await request.text();
  if (byteLength(text) > MAX_JOB_BODY_BYTES) {
    throw new RemasterJobApiError("REQUEST_TOO_LARGE", "Request body is too large", 413);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new RemasterJobApiError("VALIDATION_FAILED", "Invalid JSON body", 400, { correlationId });
  }
}

export function parseCreateJobBody(body: unknown): RemasterPipelineCreateJobInput {
  const parsed = createJobBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new RemasterJobApiError("VALIDATION_FAILED", "Invalid Re-Master job payload", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return {
    brand: REMASTER_JOB_BRAND,
    songId: parsed.data.songId,
    inputVersion: parsed.data.inputVersion,
    audioReference: parsed.data.audioReference,
    metadataVersion: parsed.data.metadataVersion,
    slideshowImages: parsed.data.slideshowImages,
    logoUrl: parsed.data.logoUrl || null,
    thumbnailUrl: parsed.data.thumbnailUrl || null,
    publishingSettings: parsed.data.publishingSettings,
    maxRetries: parsed.data.maxRetries,
    forceNew: parsed.data.forceNew,
  };
}

export function parseListQuery(searchParams: URLSearchParams) {
  const raw = {
    songId: searchParams.get("songId") || undefined,
    status: searchParams.get("status") || undefined,
    limit: searchParams.get("limit") || undefined,
  };
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new RemasterJobApiError("VALIDATION_FAILED", "Invalid job list query", 400);
  }
  return parsed.data;
}

export function parseEventsQuery(searchParams: URLSearchParams) {
  const raw = {
    limit: searchParams.get("limit") || undefined,
    afterSequence: searchParams.get("afterSequence") || undefined,
  };
  const parsed = eventsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new RemasterJobApiError("VALIDATION_FAILED", "Invalid event list query", 400);
  }
  return parsed.data;
}

export function toCorrelationUuid(correlationId: string) {
  const bytes = createHash("sha256").update(correlationId).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function toJobDto(job: RemasterPipelineJobRow): RemasterJobDto {
  return {
    id: job.id,
    songId: job.song_id,
    status: job.status,
    pipelineStep: job.pipeline_step,
    progress: job.progress,
    retryCount: job.retry_count,
    maxRetries: job.max_retries,
    retryClassification: job.retry_classification,
    timestamps: {
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      startedAt: job.started_at,
      heartbeatAt: job.heartbeat_at,
      completedAt: job.completed_at,
      cancelledAt: job.cancelled_at,
      cancelRequestedAt: job.cancel_requested_at,
      nextRetryAt: job.next_retry_at,
      youtubeUploadStartedAt: job.youtube_upload_started_at,
    },
    error: {
      code: job.error_code,
      message: job.error_message ? sanitizeErrorMessage(job.error_message) : null,
    },
    manualReview: {
      required: job.manual_review_required,
      reason: job.manual_review_reason ? sanitizeErrorMessage(job.manual_review_reason) : null,
    },
    youtube: {
      videoId: job.youtube_video_id,
      url: job.youtube_url,
    },
  };
}

export function toEventDto(event: RemasterPipelineJobEventRow): RemasterJobEventDto {
  return {
    sequence: Number(event.event_sequence),
    eventType: event.event_type,
    level: event.level,
    status: event.status,
    pipelineStep: event.pipeline_step,
    message: event.message ? sanitizeErrorMessage(event.message) : null,
    details: trimJsonDetails(event.details || {}),
    correlationId: event.correlation_id,
    createdAt: event.created_at,
  };
}

export function toEventDtos(events: RemasterPipelineJobEventRow[]) {
  return [...events]
    .sort((left, right) => Number(left.event_sequence) - Number(right.event_sequence))
    .map(toEventDto);
}

export function createJobResultResponse(
  result: { job: RemasterPipelineJobRow; duplicate: boolean },
  correlationId: string,
) {
  return jsonOk(
    {
      job: toJobDto(assertRemasterJob(result.job)),
      duplicate: result.duplicate,
    },
    result.duplicate ? 200 : 201,
    correlationId,
  );
}

export function assertRemasterJob(job: RemasterPipelineJobRow | null | undefined): RemasterPipelineJobRow {
  if (!job || job.brand !== REMASTER_JOB_BRAND) {
    throw new RemasterJobError("JOB_NOT_FOUND", "Re-Master job not found");
  }
  return job;
}

export function assertCanManualRetry(job: RemasterPipelineJobRow) {
  assertRemasterJob(job);
  if (job.status !== "failed") {
    throw new RemasterJobError("INVALID_JOB_TRANSITION", "Only failed jobs can be manually retried");
  }
  if (job.retry_count >= job.max_retries) {
    throw new RemasterJobError("RETRY_LIMIT_REACHED", "Retry limit reached");
  }
  if (job.manual_review_required || job.retry_classification === "manual_review") {
    throw new RemasterJobError("CANCELLATION_REQUIRES_MANUAL_REVIEW", "Job requires manual review before retry");
  }
  if (job.youtube_upload_started_at && !job.youtube_video_id) {
    throw new RemasterJobError("YOUTUBE_UPLOAD_AMBIGUOUS", "YouTube upload state is ambiguous");
  }
}

export function classifyCancelResponse(job: RemasterPipelineJobRow) {
  if (job.manual_review_required || job.retry_classification === "manual_review") {
    return "manual_review_required";
  }
  if (job.status === "cancelled") return "cancelled";
  if (job.cancel_requested_at) return "cancellation_requested";
  if (job.status === "completed" || job.status === "failed") return "already_terminal";
  return "cancellation_requested";
}

export function getRepository(): RemasterJobApiRepository {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new RemasterJobApiError("SUPABASE_NOT_CONFIGURED", "Supabase service role is not configured", 503);
  }
  return new RemasterPipelineJobRepository(createServerClient());
}

export async function getRouteContext(request: NextRequest, action: string, writeLimit = 30) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  const auth = await authorizeRemasterJobRequest(request);
  if (["create", "retry", "cancel"].includes(action)) {
    assertRateLimit(auth.identity, action, writeLimit);
  }
  return {
    correlationId,
    correlationUuid: toCorrelationUuid(correlationId),
    auth,
    repository: getRepository(),
  };
}

export function isSafeJobId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function assertSafeJobId(value: string) {
  if (!isSafeJobId(value)) {
    throw new RemasterJobApiError("VALIDATION_FAILED", "Invalid job id", 400);
  }
}
