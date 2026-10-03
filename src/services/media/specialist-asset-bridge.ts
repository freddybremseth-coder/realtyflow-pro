import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultMediaOrganizationId } from "@/services/media/organization";

export type SpecialistMediaBridgeInput = {
  sourceSystem: string;
  sourceJobId: string;
  provider: string;
  brandId?: string | null;
  title: string;
  description?: string | null;
  publicUrl: string;
  storageBucket?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  mediaType?: "image" | "video" | "audio" | "avatar" | "voice";
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  model?: string | null;
  operation?: string | null;
  actorEmail?: string | null;
  completedAt?: string | null;
  sourceState?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  tags?: string[];
  organizationId?: string | null;
};

export type SpecialistMediaBridgeRows = {
  job: Record<string, unknown>;
  asset: Record<string, unknown>;
  resultAsset: Record<string, unknown>;
};

function uniqueTags(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function buildSpecialistMediaBridgeRows(
  input: SpecialistMediaBridgeInput,
  organizationId: string,
  now = new Date().toISOString(),
): SpecialistMediaBridgeRows {
  const mediaType = input.mediaType || "video";
  const provider = input.provider.trim();
  const sourceSystem = input.sourceSystem.trim();
  const sourceJobId = input.sourceJobId.trim();
  const title = input.title.trim() || `${provider} asset`;
  const completedAt = input.completedAt || now;
  const operation = input.operation || "specialist_render";
  const tags = uniqueTags([
    "specialist-render",
    sourceSystem,
    input.brandId,
    mediaType,
    ...(input.tags || []),
  ]);

  const sourceMetadata = {
    sourceSystem,
    sourceJobId,
    sourceState: input.sourceState || null,
    specialistRenderer: true,
    actorEmail: input.actorEmail || null,
    ...(input.sourceMetadata || {}),
  };

  const resultAsset = {
    id: sourceJobId,
    media_type: mediaType,
    asset_type: "specialist_render",
    brand_id: input.brandId || null,
    title,
    public_url: input.publicUrl,
    storage_bucket: input.storageBucket || null,
    storage_path: input.storagePath || null,
    provider,
    model: input.model || null,
    duration_seconds: input.durationSeconds || null,
    aspect_ratio: input.aspectRatio || null,
  };

  return {
    job: {
      id: sourceJobId,
      organization_id: organizationId,
      user_id: null,
      project_id: null,
      prompt_plan_id: null,
      brand_id: input.brandId || null,
      campaign_id: null,
      property_id: null,
      provider,
      provider_job_id: sourceJobId,
      media_type: mediaType,
      operation,
      status: "completed",
      original_request: title,
      prompt_plan_json: sourceMetadata,
      final_prompt: title,
      negative_prompt: null,
      model: input.model || null,
      aspect_ratio: input.aspectRatio || null,
      resolution: null,
      duration_seconds: input.durationSeconds || null,
      quality_tier: "balanced",
      estimated_cost: "specialist-renderer",
      actual_cost: null,
      currency: null,
      progress: 100,
      input_assets_json: [],
      result_assets_json: [],
      error_code: null,
      error_message: null,
      retry_count: 0,
      idempotency_key: `specialist:${sourceSystem}:${sourceJobId}`,
      queued_at: null,
      started_at: null,
      completed_at: completedAt,
      cancelled_at: null,
      updated_at: now,
    },
    asset: {
      id: sourceJobId,
      organization_id: organizationId,
      user_id: null,
      project_id: null,
      brand_id: input.brandId || null,
      campaign_id: null,
      property_id: null,
      job_id: sourceJobId,
      prompt_plan_id: null,
      media_type: mediaType,
      asset_type: "specialist_render",
      title,
      description: input.description || `Specialist-rendered asset from ${sourceSystem}.`,
      storage_bucket: input.storageBucket || null,
      storage_path: input.storagePath || null,
      public_url: input.publicUrl,
      signed_url_required: false,
      thumbnail_url: null,
      mime_type: input.mimeType || null,
      width: null,
      height: null,
      duration_seconds: input.durationSeconds || null,
      file_size: null,
      provider,
      model: input.model || null,
      prompt: null,
      negative_prompt: null,
      aspect_ratio: input.aspectRatio || null,
      resolution: null,
      ai_generated: false,
      ai_edited: false,
      source_asset_ids: [],
      metadata_json: {
        ...sourceMetadata,
        bridgeMode: "reference-only",
        copiedFile: false,
      },
      tags,
      is_favorite: false,
      status: "active",
      updated_at: now,
    },
    resultAsset,
  };
}

async function assertBridgeIdAvailable(
  supabase: SupabaseClient,
  table: "media_generation_jobs" | "media_assets",
  id: string,
  provider: string,
  sourceJobId: string,
) {
  const select = table === "media_generation_jobs" ? "id,provider,provider_job_id" : "id,provider,metadata_json";
  const { data, error } = await supabase.from(table).select(select).eq("id", id).maybeSingle();
  if (error) throw new Error(`Shared media bridge could not inspect ${table}: ${error.message}`);
  if (!data) return;

  const row = data as Record<string, unknown>;
  const sameProvider = String(row.provider || "") === provider;
  const sameSource = table === "media_generation_jobs"
    ? String(row.provider_job_id || "") === sourceJobId
    : String((row.metadata_json as Record<string, unknown> | null)?.sourceJobId || "") === sourceJobId;

  if (!sameProvider || !sameSource) {
    throw new Error(`Shared media bridge ID collision in ${table} for ${id}.`);
  }
}

export async function mirrorSpecialistRenderedAsset(
  supabase: SupabaseClient,
  input: SpecialistMediaBridgeInput,
) {
  const organizationId = input.organizationId || await getDefaultMediaOrganizationId(supabase);
  const provider = input.provider.trim();
  const sourceJobId = input.sourceJobId.trim();
  if (!provider || !sourceJobId) throw new Error("Specialist media bridge requires provider and source job ID.");
  if (!/^https:\/\//i.test(input.publicUrl)) throw new Error("Specialist media bridge requires a public HTTPS URL.");

  await assertBridgeIdAvailable(supabase, "media_generation_jobs", sourceJobId, provider, sourceJobId);
  await assertBridgeIdAvailable(supabase, "media_assets", sourceJobId, provider, sourceJobId);

  const rows = buildSpecialistMediaBridgeRows(input, organizationId);

  const { error: jobError } = await supabase
    .from("media_generation_jobs")
    .upsert(rows.job, { onConflict: "id" });
  if (jobError) throw new Error(`Could not mirror specialist media job: ${jobError.message}`);

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .upsert(rows.asset, { onConflict: "id" })
    .select("id,organization_id,brand_id,media_type,asset_type,title,public_url,storage_bucket,storage_path,provider,model,duration_seconds,aspect_ratio,status,created_at,updated_at")
    .single();
  if (assetError || !asset) {
    throw new Error(`Could not mirror specialist media asset: ${assetError?.message || "missing asset"}`);
  }

  const { error: resultError } = await supabase
    .from("media_generation_jobs")
    .update({
      result_assets_json: [{ ...rows.resultAsset, id: asset.id }],
      completed_at: input.completedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceJobId);
  if (resultError) throw new Error(`Could not finalize specialist media job: ${resultError.message}`);

  return {
    organizationId,
    jobId: sourceJobId,
    assetId: String(asset.id),
    asset,
    copiedFile: false,
  };
}
