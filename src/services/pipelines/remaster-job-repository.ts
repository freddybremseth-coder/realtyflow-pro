import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRemasterPipelineIdempotencyKey } from "./remaster-job-idempotency";
import { classifyCancellation, classifyExistingJobForCreate } from "./remaster-job-state";
import type {
  RemasterPipelineCreateJobInput,
  RemasterPipelineCreateJobResult,
  RemasterPipelineJobEventRow,
  RemasterPipelineJobRow,
  RemasterPipelineStep,
} from "./remaster-job-types";

const JOB_COLUMNS = "*";
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

async function expectSingle<T>(operation: string, query: PromiseLike<{ data: T | null; error: any }>) {
  const { data, error } = await query;
  if (error) throw new Error(`${operation}: ${error.message || "Supabase request failed"}`);
  if (!data) throw new Error(`${operation}: no row returned`);
  return data;
}

export class RemasterPipelineJobRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createJob(input: RemasterPipelineCreateJobInput): Promise<RemasterPipelineCreateJobResult> {
    const idempotencyKey = buildRemasterPipelineIdempotencyKey(input);

    const { data: existingRows, error: existingError } = await this.supabase
      .from("remaster_pipeline_jobs")
      .select(JOB_COLUMNS)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingError) throw new Error(`Could not check existing Re-Master job: ${existingError.message}`);

    const existing = (existingRows?.[0] || null) as RemasterPipelineJobRow | null;
    const createPolicy = classifyExistingJobForCreate(existing?.status, input.forceNew);
    if (existing && createPolicy === "duplicate_active") {
      return { job: existing, duplicate: true, idempotencyKey };
    }

    if (createPolicy === "blocked_completed") {
      throw new Error("Completed Re-Master job requires a new inputVersion or explicit forceNew.");
    }

    const job = await expectSingle<RemasterPipelineJobRow>(
      "Could not create Re-Master pipeline job",
      this.supabase
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
        .single(),
    );

    return { job, duplicate: false, idempotencyKey };
  }

  async getJob(jobId: string) {
    return expectSingle<RemasterPipelineJobRow>(
      "Could not load Re-Master pipeline job",
      this.supabase.from("remaster_pipeline_jobs").select(JOB_COLUMNS).eq("id", jobId).single(),
    );
  }

  async claimNext(workerId: string, leaseSeconds = 300) {
    const { data, error } = await this.supabase.rpc("claim_remaster_pipeline_job", {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(`Could not claim Re-Master pipeline job: ${error.message}`);
    return ((data as RemasterPipelineJobRow[] | null)?.[0] || null);
  }

  async heartbeat(jobId: string, leaseToken: string, leaseSeconds = 300) {
    const { data, error } = await this.supabase.rpc("heartbeat_remaster_pipeline_job", {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(`Could not heartbeat Re-Master pipeline job: ${error.message}`);
    return ((data as RemasterPipelineJobRow[] | null)?.[0] || null);
  }

  async recordEvent(input: {
    jobId: string;
    eventType: string;
    level?: "debug" | "info" | "warn" | "error";
    status?: string | null;
    pipelineStep?: RemasterPipelineStep | null;
    message?: string | null;
    details?: Record<string, unknown>;
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
      }),
    );
  }

  async markYoutubeUploadStarted(jobId: string, leaseToken: string) {
    return expectSingle<RemasterPipelineJobRow>(
      "Could not mark YouTube upload start",
      this.supabase
        .from("remaster_pipeline_jobs")
        .update({
          pipeline_step: "upload_youtube",
          youtube_upload_started_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("lease_token", leaseToken)
        .eq("status", "running")
        .select(JOB_COLUMNS)
        .single(),
    );
  }

  async recordYoutubeVideo(jobId: string, leaseToken: string, video: { id: string; url: string }) {
    return expectSingle<RemasterPipelineJobRow>(
      "Could not record YouTube video",
      this.supabase
        .from("remaster_pipeline_jobs")
        .update({
          youtube_video_id: video.id,
          youtube_url: video.url,
        })
        .eq("id", jobId)
        .eq("lease_token", leaseToken)
        .eq("status", "running")
        .select(JOB_COLUMNS)
        .single(),
    );
  }

  async cancelJob(job: RemasterPipelineJobRow, reason: string) {
    const classification = classifyCancellation(job);
    if (classification === "already_terminal") return job;

    if (classification === "manual_review_required") {
      return expectSingle<RemasterPipelineJobRow>(
        "Could not mark Re-Master job for manual cancellation review",
        this.supabase
          .from("remaster_pipeline_jobs")
          .update({
            manual_review_required: true,
            manual_review_reason: reason,
            retry_classification: "manual_review",
          })
          .eq("id", job.id)
          .select(JOB_COLUMNS)
          .single(),
      );
    }

    return expectSingle<RemasterPipelineJobRow>(
      "Could not cancel Re-Master job",
      this.supabase
        .from("remaster_pipeline_jobs")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          manual_review_reason: reason,
        })
        .eq("id", job.id)
        .select(JOB_COLUMNS)
        .single(),
    );
  }
}
