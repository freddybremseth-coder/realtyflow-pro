import type { SupabaseClient } from "@supabase/supabase-js";
import { getProviderCapabilities, supportsCapability } from "./capabilities";
import { exportMediaAssetToContentHub } from "./content-hub-export";
import { persistMediaAsset } from "./asset-service";
import { promptPlanHash } from "./prompt-director";
import { routeMediaProvider } from "./provider-router";
import {
  createJobRequestSchema,
  mediaPromptPlanSchema,
  type CreateJobRequest,
  type MediaGenerationJob,
  type MediaPromptPlan,
  type MediaProvider,
  type ProviderJobStatus,
} from "./types";
import { GeminiMediaProvider } from "./providers/gemini-media-provider";
import { OpenArtMediaProvider } from "./providers/openart-media-provider";
import { OpenAIVoiceProvider } from "./providers/openai-voice-provider";

function providerFor(id: string): MediaProvider {
  if (id === "gemini") return new GeminiMediaProvider();
  if (id === "openart") return new OpenArtMediaProvider();
  if (id === "openai") return new OpenAIVoiceProvider();
  throw new Error(`Ukjent media-provider: ${id}`);
}

function normalizeJobStatus(status: ProviderJobStatus["status"]) {
  if (status === "queued") return "submitted";
  if (status === "processing" || status === "unknown") return "processing";
  return status;
}

async function createUsageEvent(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId?: string | null;
    eventType: string;
    provider?: string | null;
    mediaType?: string | null;
    jobId?: string | null;
    promptPlanId?: string | null;
    costTier?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("media_usage_events").insert({
      organization_id: params.organizationId,
      user_id: params.userId || null,
      event_type: params.eventType,
      provider: params.provider || null,
      media_type: params.mediaType || null,
      job_id: params.jobId || null,
      prompt_plan_id: params.promptPlanId || null,
      cost_tier: params.costTier || null,
      metadata_json: params.metadata || {},
    });
  } catch {
    // Usage logging should not block generation.
  }
}

async function ensureProject(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId?: string | null;
    projectId?: string;
    plan: MediaPromptPlan;
    actorEmail: string;
  },
) {
  if (params.projectId) return params.projectId;
  const name = `${params.plan.useCase || "Media"} · ${new Date().toLocaleDateString("nb-NO")}`;
  const { data, error } = await supabase
    .from("media_projects")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId || null,
      name,
      description: params.plan.originalRequest,
      project_type: params.plan.useCase || params.plan.mediaType,
      brand_id: params.plan.brandId || null,
      status: "active",
      target_platforms: params.plan.platform ? [params.plan.platform] : [],
      target_audience: params.plan.audience || null,
      metadata_json: { actorEmail: params.actorEmail, autoCreated: true },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Kunne ikke opprette media-prosjekt: ${error.message}`);
  return String(data.id);
}

async function persistPromptPlan(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId?: string | null;
    projectId?: string | null;
    plan: MediaPromptPlan;
  },
) {
  const hash = promptPlanHash(params.plan);
  const { data, error } = await supabase
    .from("media_prompt_plans")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId || null,
      project_id: params.projectId || null,
      brand_id: params.plan.brandId || null,
      original_request: params.plan.originalRequest,
      plan_json: params.plan,
      optimized_prompt: params.plan.optimizedPrompt,
      negative_prompt: params.plan.negativePrompt || null,
      media_type: params.plan.mediaType,
      operation: params.plan.operation,
      provider: params.plan.providerRecommendation.provider,
      model: params.plan.providerRecommendation.model || null,
      aspect_ratio: params.plan.aspectRatio || null,
      duration_seconds: params.plan.durationSeconds || null,
      resolution: params.plan.resolution || null,
      quality_tier: params.plan.qualityTier,
      estimated_cost_tier: params.plan.estimatedCostTier,
      prompt_hash: hash,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Kunne ikke lagre promptplan: ${error.message}`);
  return String(data.id);
}

async function completeJobWithAsset(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId?: string | null;
    actorEmail: string;
    job: Record<string, unknown>;
    plan: MediaPromptPlan;
    providerResult: MediaGenerationJob | ProviderJobStatus;
    autoExportToContentHub?: boolean;
  },
) {
  const jobId = String(params.job.id);
  const promptPlanId = params.job.prompt_plan_id ? String(params.job.prompt_plan_id) : null;
  const resultUrls = "resultUrls" in params.providerResult ? params.providerResult.resultUrls || [] : params.providerResult.resultUrls || [];
  const thumbnailUrls = "thumbnailUrls" in params.providerResult ? params.providerResult.thumbnailUrls || [] : [];
  const inlineBase64 = "inlineBase64" in params.providerResult ? params.providerResult.inlineBase64 : undefined;
  const mimeType = "mimeType" in params.providerResult ? params.providerResult.mimeType : undefined;

  const asset = await persistMediaAsset(supabase, {
    organizationId: params.organizationId,
    userId: params.userId || null,
    actorEmail: params.actorEmail,
    jobId,
    promptPlanId,
    projectId: params.job.project_id ? String(params.job.project_id) : null,
    brandId: params.job.brand_id ? String(params.job.brand_id) : params.plan.brandId,
    campaignId: params.job.campaign_id ? String(params.job.campaign_id) : null,
    propertyId: params.job.property_id ? String(params.job.property_id) : null,
    plan: params.plan,
    provider: String(params.job.provider),
    model: params.job.model ? String(params.job.model) : null,
    remoteUrl: resultUrls[0],
    inlineBase64,
    mimeType,
    thumbnailUrl: thumbnailUrls[0] || null,
    aiEdited: params.plan.operation.includes("image_to"),
  });

  const exported = params.autoExportToContentHub
    ? await exportMediaAssetToContentHub(supabase, {
        organizationId: params.organizationId,
        actorEmail: params.actorEmail,
        assetId: String(asset.id),
      }).catch((error) => ({ error: error instanceof Error ? error.message : "Content Hub export failed" }))
    : null;

  await supabase
    .from("media_generation_jobs")
    .update({
      status: "completed",
      progress: 100,
      result_assets_json: [asset],
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId);

  await createUsageEvent(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    eventType: "job_completed",
    provider: String(params.job.provider),
    mediaType: params.plan.mediaType,
    jobId,
    promptPlanId,
    costTier: params.plan.estimatedCostTier,
    metadata: { assetId: asset.id, exported },
  });

  return { asset, exported };
}

async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await supabase
    .from("media_generation_jobs")
    .update({
      status: "failed",
      progress: 0,
      error_code: "provider_error",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  return message;
}

export async function createMediaJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId?: string | null;
    actorEmail: string;
    body: CreateJobRequest;
  },
) {
  const body = createJobRequestSchema.parse(params.body);
  let plan = mediaPromptPlanSchema.parse(body.plan);

  if (body.idempotencyKey) {
    const { data: existing } = await supabase
      .from("media_generation_jobs")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();
    if (existing) return { job: existing, existing: true };
  }

  const capabilities = await getProviderCapabilities(supabase, params.organizationId);
  const decision = routeMediaProvider(plan, capabilities);
  const selectedCapabilities = capabilities.find((capability) => capability.provider === decision.provider);
  if (!selectedCapabilities || !supportsCapability(selectedCapabilities, plan.mediaType, plan.operation)) {
    throw new Error(decision.reason);
  }

  plan = mediaPromptPlanSchema.parse({
    ...plan,
    providerRecommendation: {
      ...plan.providerRecommendation,
      provider: decision.provider,
      displayName: decision.displayName,
      reason: decision.reason,
      estimatedCostTier: decision.estimatedCostTier,
      model: decision.model || plan.providerRecommendation.model,
    },
    estimatedCostTier: decision.estimatedCostTier,
  });

  const projectId = await ensureProject(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    projectId: body.projectId,
    plan,
    actorEmail: params.actorEmail,
  });
  const promptPlanId = await persistPromptPlan(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    projectId,
    plan,
  });

  const { data: job, error } = await supabase
    .from("media_generation_jobs")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId || null,
      project_id: projectId,
      prompt_plan_id: promptPlanId,
      brand_id: body.brandId || plan.brandId || null,
      campaign_id: body.campaignId || null,
      property_id: body.propertyId || null,
      provider: decision.provider,
      media_type: plan.mediaType,
      operation: plan.operation,
      status: "queued",
      original_request: plan.originalRequest,
      prompt_plan_json: plan,
      final_prompt: plan.optimizedPrompt,
      negative_prompt: plan.negativePrompt || null,
      model: decision.model || plan.providerRecommendation.model || null,
      aspect_ratio: plan.aspectRatio || null,
      resolution: plan.resolution || null,
      duration_seconds: plan.durationSeconds || null,
      quality_tier: plan.qualityTier,
      estimated_cost: decision.estimatedCostTier,
      input_assets_json: body.sourceImageUrls,
      idempotency_key: body.idempotencyKey || null,
      queued_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(`Kunne ikke opprette media-jobb: ${error.message}`);

  await createUsageEvent(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    eventType: "job_started",
    provider: decision.provider,
    mediaType: plan.mediaType,
    jobId: job.id,
    promptPlanId,
    costTier: decision.estimatedCostTier,
    metadata: { actorEmail: params.actorEmail, fallbackUsed: decision.fallbackUsed },
  });

  const provider = providerFor(decision.provider);
  try {
    const submitted = await submitToProvider(provider, plan, body.sourceImageUrls);
    const submittedStatus = submitted.status === "completed" ? "processing" : "submitted";
    await supabase
      .from("media_generation_jobs")
      .update({
        status: submittedStatus,
        provider_job_id: submitted.providerJobId || null,
        model: submitted.model || job.model || null,
        progress: submitted.status === "completed" ? 90 : 10,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (submitted.status === "completed") {
      await completeJobWithAsset(supabase, {
        organizationId: params.organizationId,
        userId: params.userId,
        actorEmail: params.actorEmail,
        job: { ...job, provider_job_id: submitted.providerJobId || null, model: submitted.model || job.model },
        plan,
        providerResult: submitted,
        autoExportToContentHub: body.autoExportToContentHub,
      });
    }
  } catch (error) {
    const message = await markJobFailed(supabase, String(job.id), error);
    await createUsageEvent(supabase, {
      organizationId: params.organizationId,
      userId: params.userId,
      eventType: "job_failed",
      provider: decision.provider,
      mediaType: plan.mediaType,
      jobId: job.id,
      promptPlanId,
      costTier: decision.estimatedCostTier,
      metadata: { actorEmail: params.actorEmail, error: message },
    });
  }

  const { data: latest } = await supabase
    .from("media_generation_jobs")
    .select("*")
    .eq("id", job.id)
    .single();
  return { job: latest || job, existing: false };
}

async function submitToProvider(provider: MediaProvider, plan: MediaPromptPlan, sourceImageUrls: string[]): Promise<MediaGenerationJob> {
  if (plan.mediaType === "image" && provider.generateImage) {
    return provider.generateImage({
      prompt: plan.optimizedPrompt,
      negativePrompt: plan.negativePrompt,
      aspectRatio: plan.aspectRatio,
      resolution: plan.resolution,
      qualityTier: plan.qualityTier,
      sourceImageUrls,
      model: plan.providerRecommendation.model,
    });
  }
  if (plan.mediaType === "video" && provider.generateVideo) {
    return provider.generateVideo({
      prompt: plan.optimizedPrompt,
      negativePrompt: plan.negativePrompt,
      aspectRatio: plan.aspectRatio,
      durationSeconds: plan.durationSeconds,
      resolution: plan.resolution,
      qualityTier: plan.qualityTier,
      sourceImageUrl: sourceImageUrls[0],
      model: plan.providerRecommendation.model,
    });
  }
  if ((plan.mediaType === "voice" || plan.mediaType === "audio") && provider.generateVoice) {
    return provider.generateVoice({
      text: plan.originalRequest,
      language: plan.voiceLanguage || "Norwegian",
      voiceId: plan.voiceId,
      tone: plan.voiceTone,
      speed: plan.voiceSpeed,
      outputFormat: plan.outputFormat,
      model: plan.providerRecommendation.model,
    });
  }
  throw new Error(`${provider.displayName} støtter ikke ${plan.mediaType}/${plan.operation} i Media Studio ennå.`);
}

export async function refreshMediaJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    actorEmail: string;
    jobId: string;
    autoExportToContentHub?: boolean;
  },
) {
  const { data: job, error } = await supabase
    .from("media_generation_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!job) throw new Error("Fant ikke media-jobben.");
  if (["completed", "failed", "cancelled", "expired"].includes(String(job.status))) return job;
  if (!job.provider_job_id) return job;

  const provider = providerFor(String(job.provider));
  const status = await provider.getJobStatus(String(job.provider_job_id));
  const nextStatus = normalizeJobStatus(status.status);
  const plan = mediaPromptPlanSchema.parse(job.prompt_plan_json);

  if (status.status === "completed" && status.resultUrls?.length) {
    await completeJobWithAsset(supabase, {
      organizationId: params.organizationId,
      actorEmail: params.actorEmail,
      job,
      plan,
      providerResult: status,
      autoExportToContentHub: params.autoExportToContentHub,
    });
  } else if (status.status === "failed" || status.status === "cancelled") {
    await supabase
      .from("media_generation_jobs")
      .update({
        status: status.status,
        progress: status.status === "cancelled" ? 0 : job.progress || 0,
        error_code: status.status,
        error_message: status.errorMessage || null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  } else {
    await supabase
      .from("media_generation_jobs")
      .update({
        status: nextStatus,
        progress: typeof status.progress === "number" ? status.progress : Math.max(Number(job.progress || 10), 30),
      })
      .eq("id", job.id);
  }

  const { data: latest } = await supabase
    .from("media_generation_jobs")
    .select("*")
    .eq("id", job.id)
    .single();
  return latest || job;
}

export async function retryMediaJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    actorEmail: string;
    jobId: string;
  },
) {
  const { data: job, error } = await supabase
    .from("media_generation_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("Fant ikke media-jobben.");
  if (!["failed", "expired", "cancelled"].includes(String(job.status))) {
    throw new Error("Bare feilede, utløpte eller kansellerte jobber kan prøves på nytt.");
  }

  const plan = mediaPromptPlanSchema.parse(job.prompt_plan_json);
  const sourceImageUrls = Array.isArray(job.input_assets_json) ? job.input_assets_json.map(String) : [];
  const provider = providerFor(String(job.provider));

  await supabase
    .from("media_generation_jobs")
    .update({
      status: "queued",
      retry_count: Number(job.retry_count || 0) + 1,
      provider_job_id: null,
      error_code: null,
      error_message: null,
      queued_at: new Date().toISOString(),
      completed_at: null,
      progress: 5,
    })
    .eq("id", job.id);

  try {
    const submitted = await submitToProvider(provider, plan, sourceImageUrls);
    await supabase
      .from("media_generation_jobs")
      .update({
        status: submitted.status === "completed" ? "processing" : "submitted",
        provider_job_id: submitted.providerJobId || null,
        progress: submitted.status === "completed" ? 90 : 10,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (submitted.status === "completed") {
      await completeJobWithAsset(supabase, {
        organizationId: params.organizationId,
        actorEmail: params.actorEmail,
        job,
        plan,
        providerResult: submitted,
      });
    }
  } catch (retryError) {
    await markJobFailed(supabase, String(job.id), retryError);
  }

  const { data: latest } = await supabase.from("media_generation_jobs").select("*").eq("id", job.id).single();
  return latest || job;
}

export async function cancelMediaJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    jobId: string;
  },
) {
  const { data: job, error } = await supabase
    .from("media_generation_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("Fant ikke media-jobben.");
  if (["completed", "failed", "cancelled"].includes(String(job.status))) return job;

  const provider = providerFor(String(job.provider));
  if (provider.cancelJob && job.provider_job_id) {
    await provider.cancelJob(String(job.provider_job_id)).catch(() => undefined);
  }

  const { data: updated, error: updateError } = await supabase
    .from("media_generation_jobs")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      progress: 0,
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return updated;
}
