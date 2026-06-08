import type { RetryableClass } from "../../lib/observability";

export const REMASTER_JOB_ERROR_CODES = [
  "INVALID_JOB_TRANSITION",
  "INVALID_PIPELINE_STEP_TRANSITION",
  "LEASE_EXPIRED",
  "LEASE_TOKEN_INVALID",
  "JOB_DUPLICATE_ACTIVE",
  "JOB_SCHEMA_NOT_READY",
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

export function isSchemaNotReadyError(error: unknown) {
  const source = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  const code = String(source?.code || "");
  const text = [source?.message, source?.details, source?.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    code === "42P01" ||
    code === "42883" ||
    code === "3F000" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    /relation .*remaster_pipeline_jobs.* does not exist/.test(text) ||
    /relation .*remaster_pipeline_job_events.* does not exist/.test(text) ||
    /function .*remaster_.* does not exist/.test(text) ||
    /could not find .*remaster_.* function/.test(text) ||
    /schema .* does not exist/.test(text)
  );
}

export function toRemasterJobError(error: unknown, fallbackCode: RemasterJobErrorCode): RemasterJobError {
  if (error instanceof RemasterJobError) return error;

  if (isSchemaNotReadyError(error)) {
    return new RemasterJobError(
      "JOB_SCHEMA_NOT_READY",
      "Re-Master job schema is not ready",
      "not_retryable",
    );
  }

  const source = error as { message?: string; code?: string } | null;
  const message = source?.message || fallbackCode;
  const code: RemasterJobErrorCode = isRemasterJobErrorCode(message) ? message : fallbackCode;
  const retryable = code === "LEASE_EXPIRED" ? "retryable" : "unknown";

  return new RemasterJobError(code, message, retryable);
}
