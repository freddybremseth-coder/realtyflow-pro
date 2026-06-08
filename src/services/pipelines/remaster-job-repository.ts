import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRemasterPipelineIdempotencyKey } from "./remaster-job-idempotency";
import { assertValidStatusTransition, classifyExistingJobForCreate } from "./remaster-job-state";
import { RemasterJobError, toRemasterJobError } from "./remaster-job-errors";
import type {
  RemasterPipelineCreateJobInput,
  RemasterPipelineCreateJobResult,
  RemasterPipelineJobEventRow,
  RemasterPipelineJobRow,
  RemasterPipelineJobStatus,
  RemasterPipelineStep,
  RemasterPipelineTransitionInput,
} from "./remaster-job-types";

const JOB_COLUMNS = "*";
const ACTIVE_STATUSES = ["queued", "running", "waiting_retry"];

function clampRetries(maxRetries?: number) {
  if (typeof maxRetries !== "number" || !Number.isFinite(maxRetries)) return 3;
  return Math.max(0, Math.min(10, Math.trunc(maxRetries)));
}

function inputConfig(input: RemasterPipelineCreateJobInput, idempotencyKey: string) {
  return {
    ...(input.inputConfig || {}),
    idempotencyKey,
    metadataVersion: input.metadataVersion,
    inputVersion: input.inputVersion,
    selectedAssets: {
      slideshowImages: input.slideshowImages,
      logoUrl: input.logoUrl || null,
      thumbnailUrl: input.thumbnailUrl || null,
    },
    publishingSettings: input.publishingSettings,
  };
}

function isUniqueViolation(error: any) {
  return error?.code === "23505";
}

async function expectSingle<T>(operation: string, query: PromiseLike<{ data: T | null; error: any }>) {
  const { data, error } = await query;
  if (error) throw toRemasterJobError(error, "JOB_NOT_FOUND");
  if (!data) throw new RemasterJobError("JOB_NOT_FOUND", `${operation}: no row returned`);
  return data;
}

async function expectRpcRow<T>(operation: string, query: PromiseLike<{ data: T[] | null; error: any }>) {
  const { data, error } = await query;
  if (error) throw toRemasterJobError(error, "INVALID_JOB_TRANSITION");
  const row = data?.[0] || null;
  if (!row) throw new RemasterJobError("JOB_NOT_FOUND", `${operation}: no row returned`);
  return row;
}

export class RemasterPipelineJobRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async findLatestByIdempotencyKey(idempotencyKey: string) {
    const { data, error } = await this.supabase
      .from("remaster_pipeline_jobs")
      .select(JOB_COLUMNS)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw toRemasterJobError(error, "JOB_NOT_FOUND");
    return (data?.[0] || null) as RemasterPipelineJobRow | null;
  }

  private async findActiveByIdempotencyKey(idempotencyKey: string) {
    const { data, error } = await this.supabase
      .from("remaster_pipeline_jobs")
      .select(JOB_COLUMNS)
      .eq("idempotency_key", idempotencyKey)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw toRemasterJobError(error, "JOB_DUPLICATE_ACTIVE");
    return (data?.[0] || null) as RemasterPipelineJobRow | null;
  }

  async createJob(input: RemasterPipelineCreateJobInput): Promise<RemasterPipelineCreateJobResult> {
    const idempotencyKey = buildRemasterPipelineIdempotencyKey(input);
    const existing = await this.findLatestByIdempotencyKey(idempotencyKey);
    const createPolicy = classifyExistingJobForCreate(existing?.status, input.forceNew);

    if (existing && createPolicy === "duplicate_active") {
      return { job: existing, duplicate: true, idempotencyKey };
    }

    if (createPolicy === "blocked_completed") {
      throw new RemasterJobError(
        "JOB_DUPLICATE_ACTIVE",
        "Completed Re-Master job requires a new inputVersion or explicit forceNew.",
      );
    }

    const { data, error } = await this.supabase
      .from("remaster_pipeline_jobs")
      .insert({
        brand: input.brand,
        song_id: input.songId,
        input_version: input.inputVersion,
        input_config: inputConfig(input, idempotencyKey),
        idempotency_key: idempotencyKey,
        max_retries: clampRetries(input.maxRetries),
      })
      .select(JOB_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const duplicate = await this.findActiveByIdempotencyKey(idempotencyKey);
        if (duplicate) return { job: duplicate, duplicate: true, idempotencyKey };
        throw new RemasterJobError("JOB_DUPLICATE_ACTIVE", "Active duplicate job exists but could not be loaded.");
      }

      throw toRemasterJobError(error, "JOB_NOT_FOUND");
    }

    return { job: data as RemasterPipelineJobRow, duplicate: false, idempotencyKey };
  }

  async getJob(jobId: string) {
    return expectSingle<RemasterPipelineJobRow>(
      "Could not load Re-Master pipeline job",
      this.supabase.from("remaster_pipeline_jobs").select(JOB_COLUMNS).eq("id", jobId).single(),
    );
  }

  async listJobs(input: { brand?: string; songId?: string; status?: RemasterPipelineJobStatus; limit?: number } = {}) {
    let query = this.supabase
      .from("remaster_pipeline_jobs")
      .select(JOB_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(100, input.limit || 50)));

    if (input.brand) query = query.eq("brand", input.brand);
    if (input.songId) query = query.eq("song_id", input.songId);
    if (input.status) query = query.eq("status", input.status);

    const { data, error } = await query;
    if (error) throw toRemasterJobError(error, "JOB_NOT_FOUND");
    return (data || []) as RemasterPipelineJobRow[];
  }

  async listEvents(input: { jobId: string; limit?: number; afterSequence?: number }) {
    let query = this.supabase
      .from("remaster_pipeline_job_events")
      .select("*")
      .eq("job_id", input.jobId)
      .order("event_sequence", { ascending: true })
      .limit(Math.max(1, Math.min(200, input.limit || 100)));

    if (typeof input.afterSequence === "number" && Number.isFinite(input.afterSequence)) {
      query = query.gt("event_sequence", input.afterSequence);
    }

    const { data, error } = await query;
    if (error) throw toRemasterJobError(error, "JOB_NOT_FOUND");
    return (data || []) as RemasterPipelineJobEventRow[];
  }

  async claimNext(workerId: string, leaseSeconds = 300) {
    const { data, error } = await this.supabase.rpc("claim_remaster_pipeline_job", {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw toRemasterJobError(error, "INVALID_JOB_TRANSITION");
    return ((data as RemasterPipelineJobRow[] | null)?.[0] || null);
  }

  async heartbeat(jobId: string, leaseToken: string, leaseSeconds = 300) {
    return expectRpcRow<RemasterPipelineJobRow>(
      "Could not heartbeat Re-Master pipeline job",
      this.supabase.rpc("heartbeat_remaster_pipeline_job", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_lease_seconds: leaseSeconds,
      }),
    );
  }

  async transitionJob(input: RemasterPipelineTransitionInput) {
    assertValidStatusTransition(input.expectedStatus, input.nextStatus);
    const requireLease = input.requireLease ?? input.expectedStatus === "running";

    return expectRpcRow<RemasterPipelineJobRow>(
      "Could not transition Re-Master pipeline job",
      this.supabase.rpc("transition_remaster_pipeline_job", {
        p_job_id: input.jobId,
        p_expected_status: input.expectedStatus,
        p_next_status: input.nextStatus,
        p_pipeline_step: input.updates?.pipelineStep || null,
        p_progress: input.updates?.progress ?? null,
        p_retry_classification: input.updates?.retryClassification || null,
        p_next_retry_at: input.updates?.nextRetryAt ?? null,
        p_error_code: input.updates?.errorCode ?? null,
        p_error_message: input.updates?.errorMessage ?? null,
        p_lease_token: input.leaseToken || null,
        p_require_lease: requireLease,
        p_event_type: input.eventType || "job_transitioned",
        p_event_message: input.eventMessage || null,
        p_event_details: input.eventDetails || {},
        p_correlation_id: input.correlationId || null,
      }),
    );
  }

  async markFailed(input: {
    jobId: string;
    leaseToken: string;
    errorCode: string;
    errorMessage: string;
    correlationId?: string | null;
  }) {
    return this.transitionJob({
      jobId: input.jobId,
      expectedStatus: "running",
      nextStatus: "failed",
      leaseToken: input.leaseToken,
      requireLease: true,
      updates: {
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        retryClassification: "not_retryable",
      },
      eventType: "job_failed",
      eventMessage: input.errorMessage,
      correlationId: input.correlationId || null,
    });
  }

  async scheduleRetry(input: {
    jobId: string;
    leaseToken: string;
    nextRetryAt: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    correlationId?: string | null;
  }) {
    return this.transitionJob({
      jobId: input.jobId,
      expectedStatus: "running",
      nextStatus: "waiting_retry",
      leaseToken: input.leaseToken,
      requireLease: true,
      updates: {
        nextRetryAt: input.nextRetryAt,
        errorCode: input.errorCode || null,
        errorMessage: input.errorMessage || null,
        retryClassification: "retryable",
      },
      eventType: "job_retry_scheduled",
      eventMessage: input.errorMessage || null,
      correlationId: input.correlationId || null,
    });
  }

  async manualRetry(input: { jobId: string; correlationId?: string | null }) {
    return this.transitionJob({
      jobId: input.jobId,
      expectedStatus: "failed",
      nextStatus: "queued",
      requireLease: false,
      updates: {
        retryClassification: "unknown",
        errorCode: null,
        errorMessage: null,
      },
      eventType: "manual_retry_requested",
      eventMessage: "Manual retry requested",
      correlationId: input.correlationId || null,
    });
  }

  async releaseLease(jobId: string, leaseToken: string, correlationId?: string | null) {
    return expectRpcRow<RemasterPipelineJobRow>(
      "Could not release Re-Master pipeline job lease",
      this.supabase.rpc("release_remaster_pipeline_job_lease", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_correlation_id: correlationId || null,
      }),
    );
  }

  async requestCancel(jobId: string, reason: string, correlationId?: string | null) {
    return expectRpcRow<RemasterPipelineJobRow>(
      "Could not request Re-Master pipeline job cancellation",
      this.supabase.rpc("request_remaster_pipeline_job_cancel", {
        p_job_id: jobId,
        p_reason: reason,
        p_correlation_id: correlationId || null,
      }),
    );
  }

  async appendEvent(input: {
    jobId: string;
    eventType: string;
    level?: "debug" | "info" | "warn" | "error";
    status?: string | null;
    pipelineStep?: RemasterPipelineStep | null;
    message?: string | null;
    details?: Record<string, unknown>;
    correlationId?: string | null;
  }) {
    return expectSingle<RemasterPipelineJobEventRow>(
      "Could not append Re-Master pipeline job event",
      this.supabase.rpc("append_remaster_pipeline_job_event", {
        p_job_id: input.jobId,
        p_event_type: input.eventType,
        p_level: input.level || "info",
        p_status: input.status || null,
        p_pipeline_step: input.pipelineStep || null,
        p_message: input.message || null,
        p_details: input.details || {},
        p_correlation_id: input.correlationId || null,
      }),
    );
  }

  async recordEvent(input: Parameters<RemasterPipelineJobRepository["appendEvent"]>[0]) {
    return this.appendEvent(input);
  }

  async markYoutubeUploadStarted(jobId: string, leaseToken: string, correlationId?: string | null) {
    return expectRpcRow<RemasterPipelineJobRow>(
      "Could not mark YouTube upload start",
      this.supabase.rpc("mark_remaster_youtube_upload_started", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_correlation_id: correlationId || null,
      }),
    );
  }

  async recordYoutubeVideo(
    jobId: string,
    leaseToken: string,
    video: { id: string; url: string },
    correlationId?: string | null,
  ) {
    return expectRpcRow<RemasterPipelineJobRow>(
      "Could not record YouTube video",
      this.supabase.rpc("record_remaster_youtube_video", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_youtube_video_id: video.id,
        p_youtube_url: video.url,
        p_correlation_id: correlationId || null,
      }),
    );
  }
}
