import type { RetryableClass } from "../../lib/observability";

export const REMASTER_JOB_ERROR_CODES = [
  "INVALID_JOB_TRANSITION",
  "INVALID_PIPELINE_STEP_TRANSITION",
  "LEASE_EXPIRED",
  "LEASE_TOKEN_INVALID",
  "JOB_DUPLICATE_ACTIVE",
  "JOB_NOT_FOUND",
  "RETRY_LIMIT_REACHED",
  "YOUTUBE_UPLOAD_AMBIGUOUS",
  "YOUTUBE_UPLOAD_NOT_STARTED",
  "YOUTUBE_VIDEO_CONFLICT",
  "CANCELLATION_REQUIRES_MANUAL_REVIEW",
] as const;

export type RemasterJobErrorCode = (typeof REMASTER_JOB_ERROR_CODES)[number];

export class RemasterJobError extends Error {
  constructor(
    public readonly code: RemasterJobErrorCode,
    message: string = code,
    public readonly retryable: RetryableClass = "unknown",
  ) {
    super(message);
    this.name = "RemasterJobError";
  }
}

export function isRemasterJobErrorCode(value: unknown): value is RemasterJobErrorCode {
  return typeof value === "string" && (REMASTER_JOB_ERROR_CODES as readonly string[]).includes(value);
}

export function toRemasterJobError(error: unknown, fallbackCode: RemasterJobErrorCode): RemasterJobError {
  if (error instanceof RemasterJobError) return error;

  const source = error as { message?: string; code?: string } | null;
  const message = source?.message || fallbackCode;
  const code: RemasterJobErrorCode = isRemasterJobErrorCode(message) ? message : fallbackCode;
  const retryable = code === "LEASE_EXPIRED" ? "retryable" : "unknown";

  return new RemasterJobError(code, message, retryable);
}
