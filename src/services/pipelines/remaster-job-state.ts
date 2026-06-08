import type {
  RemasterPipelineJobRow,
  RemasterPipelineJobStatus,
  RemasterPipelineStep,
  RemasterRetryClassification,
} from "./remaster-job-types";
import { RemasterJobError } from "./remaster-job-errors";

const STATUS_TRANSITIONS: Record<RemasterPipelineJobStatus, RemasterPipelineJobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["waiting_retry", "completed", "failed"],
  waiting_retry: ["queued", "cancelled"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
};

const STEP_ORDER: RemasterPipelineStep[] = [
  "pending",
  "download_audio",
  "analyze_song",
  "generate_metadata",
  "prepare_images",
  "render_video",
  "compose_thumbnail",
  "upload_youtube",
  "set_thumbnail",
  "add_playlist",
  "persist_results",
  "completed",
];

export function canTransitionStatus(
  from: RemasterPipelineJobStatus,
  to: RemasterPipelineJobStatus,
): boolean {
  return from === to || STATUS_TRANSITIONS[from]?.includes(to) || false;
}

export function assertValidStatusTransition(
  from: RemasterPipelineJobStatus,
  to: RemasterPipelineJobStatus,
): void {
  if (!canTransitionStatus(from, to)) {
    throw new RemasterJobError(
      "INVALID_JOB_TRANSITION",
      `Invalid Re-Master job status transition: ${from} -> ${to}`,
    );
  }
}

export function canAdvancePipelineStep(from: RemasterPipelineStep, to: RemasterPipelineStep): boolean {
  return STEP_ORDER.indexOf(to) >= STEP_ORDER.indexOf(from);
}

export function assertValidPipelineStepTransition(
  from: RemasterPipelineStep,
  to: RemasterPipelineStep,
): void {
  if (!canAdvancePipelineStep(from, to)) {
    throw new RemasterJobError(
      "INVALID_PIPELINE_STEP_TRANSITION",
      `Invalid Re-Master pipeline step transition: ${from} -> ${to}`,
    );
  }
}

export function isYoutubeUploadAmbiguous(job: Pick<RemasterPipelineJobRow, "youtube_upload_started_at" | "youtube_video_id">) {
  return Boolean(job.youtube_upload_started_at && !job.youtube_video_id);
}

export function canStartYoutubeUpload(job: Pick<RemasterPipelineJobRow, "youtube_upload_started_at" | "youtube_video_id">) {
  return !job.youtube_upload_started_at && !job.youtube_video_id;
}

export function classifyRetry(job: Pick<
  RemasterPipelineJobRow,
  "retry_count" | "max_retries" | "youtube_upload_started_at" | "youtube_video_id" | "retry_classification"
>): RemasterRetryClassification {
  if (isYoutubeUploadAmbiguous(job)) return "manual_review";
  if (job.retry_count >= job.max_retries) return "not_retryable";
  if (job.retry_classification === "manual_review") return "manual_review";
  return "retryable";
}

export function classifyCancellation(job: Pick<
  RemasterPipelineJobRow,
  "status" | "youtube_upload_started_at" | "youtube_video_id"
>): "cancel_now" | "request_stop" | "already_terminal" | "manual_review_required" {
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return "already_terminal";
  }

  if (job.youtube_upload_started_at || job.youtube_video_id) {
    return "manual_review_required";
  }

  if (job.status === "running") {
    return "request_stop";
  }

  return "cancel_now";
}

export function classifyExistingJobForCreate(
  existingStatus: RemasterPipelineJobStatus | null | undefined,
  forceNew = false,
): "create" | "duplicate_active" | "blocked_completed" {
  if (!existingStatus) return "create";
  if (existingStatus === "queued" || existingStatus === "running" || existingStatus === "waiting_retry") {
    return "duplicate_active";
  }
  if (existingStatus === "completed" && !forceNew) {
    return "blocked_completed";
  }
  return "create";
}
