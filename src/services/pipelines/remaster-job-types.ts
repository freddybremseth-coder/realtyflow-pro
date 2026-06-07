export const REMASTER_PIPELINE_STATUSES = [
  "queued",
  "running",
  "waiting_retry",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RemasterPipelineJobStatus = (typeof REMASTER_PIPELINE_STATUSES)[number];

export const REMASTER_PIPELINE_STEPS = [
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
] as const;

export type RemasterPipelineStep = (typeof REMASTER_PIPELINE_STEPS)[number];

export const REMASTER_RETRY_CLASSIFICATIONS = [
  "unknown",
  "retryable",
  "not_retryable",
  "manual_review",
] as const;

export type RemasterRetryClassification = (typeof REMASTER_RETRY_CLASSIFICATIONS)[number];

export interface RemasterPipelineJobRow {
  id: string;
  brand: string;
  song_id: string;
  status: RemasterPipelineJobStatus;
  pipeline_step: RemasterPipelineStep;
  progress: number;
  input_version: string;
  input_config: Record<string, unknown>;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  retry_classification: RemasterRetryClassification;
  next_retry_at: string | null;
  error_code: string | null;
  error_message: string | null;
  lease_token: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  youtube_upload_started_at: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  manual_review_required: boolean;
  manual_review_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemasterPipelineJobEventRow {
  id: string;
  job_id: string;
  event_sequence: number;
  event_type: string;
  level: "debug" | "info" | "warn" | "error";
  status: RemasterPipelineJobStatus | null;
  pipeline_step: RemasterPipelineStep | null;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface RemasterPipelinePublishingSettings {
  mode?: "immediate" | "auto" | "manual";
  publishAt?: string | null;
  timezone?: string | null;
  language?: string | null;
  multilingualDescription?: boolean;
}

export interface RemasterPipelineIdempotencyInput {
  brand: string;
  songId: string;
  audioReference: string;
  metadataVersion: string;
  slideshowImages: string[];
  logoUrl?: string | null;
  thumbnailUrl?: string | null;
  publishingSettings: RemasterPipelinePublishingSettings | Record<string, unknown>;
  inputVersion: string;
}

export interface RemasterPipelineCreateJobInput extends RemasterPipelineIdempotencyInput {
  maxRetries?: number;
  forceNew?: boolean;
  inputConfig?: Record<string, unknown>;
}

export interface RemasterPipelineCreateJobResult {
  job: RemasterPipelineJobRow;
  duplicate: boolean;
  idempotencyKey: string;
}
