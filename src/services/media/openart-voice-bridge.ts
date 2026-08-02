import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callOpenArtTool,
  listOpenArtTools,
  type OpenArtToolSummary,
} from "@/services/integrations/openart-client";
import { mediaPromptPlanSchema, type MediaPromptPlan } from "./types";

export const openArtVoiceBridgeRequestSchema = z.object({
  audioAssetId: z.string().uuid(),
  visualAssetId: z.string().uuid(),
  model: z.string().min(2).max(160),
  mode: z.string().min(2).max(120),
  prompt: z.string().min(3).max(4_096),
  durationSeconds: z.number().int().min(1).max(120).optional(),
  resolution: z.string().max(40).optional(),
  aspectRatio: z.string().max(20).optional(),
  projectId: z.string().uuid().optional(),
  autoExportToContentHub: z.boolean().default(false),
  consentConfirmed: z.literal(true),
  idempotencyKey: z.string().min(8).max(160).optional(),
});

export type OpenArtVoiceBridgeRequest = z.infer<typeof openArtVoiceBridgeRequestSchema>;

export interface OpenArtBridgeOption {
  model: string;
  label: string;
  description: string;
  mode: string;
  modeDescription: string;
  supportsAudioReference: boolean;
  supportsVisualReference: boolean;
  formSchema: unknown;
}

interface OpenArtBridgeDiscovery {
  expiresAt: number;
  options: OpenArtBridgeOption[];
  rawCount: number;
}

interface ModelCandidate {
  model: string;
  label: string;
  description: string;
  mode: string;
  modeDescription: string;
}

interface UploadedReference {
  type: "image" | "video" | "audio";
  id: string;
  url: string;
  label: string;
  [key: string]: unknown;
}

interface StoredAsset {
  id: string;
  project_id?: string | null;
  brand_id?: string | null;
  media_type: string;
  mime_type?: string | null;
  public_url?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  title?: string | null;
}

let optionCache: OpenArtBridgeDiscovery | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function collectModelCandidates(node: unknown, output: ModelCandidate[], inheritedDescription = "") {
  if (Array.isArray(node)) {
    for (const item of node) collectModelCandidates(item, output, inheritedDescription);
    return;
  }
  if (!isRecord(node)) return;

  const description = firstString(node, ["description", "summary", "details"]) || inheritedDescription;
  const model = firstString(node, ["model", "modelId", "id", "slug"]);
  const label = firstString(node, ["displayName", "label", "name", "title"]) || model;
  const rawModes = node.modes ?? node.supportedModes ?? node.availableModes;

  if (model && rawModes) {
    const modes = Array.isArray(rawModes) ? rawModes : [rawModes];
    for (const rawMode of modes) {
      if (typeof rawMode === "string") {
        output.push({ model, label, description, mode: rawMode, modeDescription: "" });
      } else if (isRecord(rawMode)) {
        const mode = firstString(rawMode, ["mode", "id", "value", "name", "slug"]);
        if (!mode) continue;
        output.push({
          model,
          label,
          description,
          mode,
          modeDescription: firstString(rawMode, ["description", "summary", "label"]),
        });
      }
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectModelCandidates(value, output, description);
  }
}

function schemaProperties(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) return {};
  if (isRecord(schema.properties)) return schema.properties;
  for (const value of Object.values(schema)) {
    if (!isRecord(value)) continue;
    const nested = schemaProperties(value);
    if (Object.keys(nested).length) return nested;
  }
  return {};
}

function schemaRequired(schema: unknown): string[] {
  if (!isRecord(schema)) return [];
  if (Array.isArray(schema.required)) return schema.required.map(String);
  for (const value of Object.values(schema)) {
    if (!isRecord(value)) continue;
    const nested = schemaRequired(value);
    if (nested.length) return nested;
  }
  return [];
}

function definitionText(value: unknown) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return "";
  }
}

function schemaHasExternalAudioInput(schema: unknown) {
  const properties = schemaProperties(schema);
  return Object.entries(properties).some(([propertyName, definition]) => {
    const key = normalizeKey(propertyName);
    const text = definitionText(definition);

    if (/generateaudio|withaudio|audioenabled|soundenabled|addaudio/.test(key)) return false;
    if (/visualreferences|references|elements|assets/.test(key)) {
      return /audio|voice|speech|soundtrack|narration/.test(text);
    }
    if (!/audio|voice|speech|soundtrack|narration/.test(key)) return false;
    if (/boolean/.test(text) && !/url|file|upload|reference|asset|object|string/.test(text)) return false;
    return /url|file|upload|reference|asset|object|string|visualreference/.test(text) || text === "{}";
  });
}

function schemaHasVisualInput(schema: unknown) {
  const properties = schemaProperties(schema);
  return Object.entries(properties).some(([propertyName, definition]) => {
    const key = normalizeKey(propertyName);
    const text = definitionText(definition);
    if (/videocount|imagecount|numoutputs|outputvideo|outputimage/.test(key)) return false;
    if (/visualreferences|references|elements|assets/.test(key)) {
      return /image|video|visual|character|portrait|startframe/.test(text);
    }
    if (!/startframe|image|portrait|character|visual|video|element/.test(key)) return false;
    return /url|file|upload|reference|asset|object|string|visualreference/.test(text) || text === "{}";
  });
}

function candidateScore(candidate: ModelCandidate) {
  const text = `${candidate.model} ${candidate.label} ${candidate.description} ${candidate.mode} ${candidate.modeDescription}`.toLowerCase();
  let score = 0;
  if (/lip.?sync/.test(text)) score += 100;
  if (/talking|avatar/.test(text)) score += 70;
  if (/audio|voice|speech|dub/.test(text)) score += 50;
  if (/element2video|reference2video/.test(candidate.mode.toLowerCase())) score += 25;
  if (/image2video|video2video/.test(candidate.mode.toLowerCase())) score += 10;
  return score;
}

function candidateLooksRelevant(candidate: ModelCandidate) {
  const text = `${candidate.model} ${candidate.label} ${candidate.description} ${candidate.mode} ${candidate.modeDescription}`.toLowerCase();
  const videoMode = /video|avatar|talk|lip|dub/.test(candidate.mode.toLowerCase());
  const directHint = /lip.?sync|talking|avatar|audio|voice|speech|dub|sound/.test(text);
  const referenceMode = /element2video|image2video|video2video|reference2video/.test(candidate.mode.toLowerCase());
  return videoMode && (directHint || referenceMode);
}

export async function discoverOpenArtVoiceBridgeOptions(
  options: { force?: boolean } = {},
): Promise<OpenArtBridgeDiscovery> {
  if (!options.force && optionCache && optionCache.expiresAt > Date.now()) return optionCache;

  const raw = await callOpenArtTool<unknown>("openart_model_list", {}, 60_000);
  const candidates: ModelCandidate[] = [];
  collectModelCandidates(raw, candidates);

  const unique = new Map<string, ModelCandidate>();
  for (const candidate of candidates.filter(candidateLooksRelevant)) {
    unique.set(`${candidate.model}:${candidate.mode}`, candidate);
  }

  const candidatesToInspect = [...unique.values()]
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .slice(0, 10);

  const inspected = await Promise.all(candidatesToInspect.map(async (candidate) => {
    try {
      const formSchema = await callOpenArtTool<unknown>(
        "openart_model_form_get",
        { model: candidate.model, mode: candidate.mode },
        45_000,
      );
      const supportsAudioReference = schemaHasExternalAudioInput(formSchema);
      const supportsVisualReference = schemaHasVisualInput(formSchema);
      return supportsAudioReference && supportsVisualReference
        ? { ...candidate, supportsAudioReference, supportsVisualReference, formSchema }
        : null;
    } catch {
      return null;
    }
  }));

  const bridgeOptions: OpenArtBridgeOption[] = inspected.flatMap((item) => item ? [item] : []);
  const result: OpenArtBridgeDiscovery = {
    expiresAt: Date.now() + 10 * 60_000,
    options: bridgeOptions,
    rawCount: candidates.length,
  };
  optionCache = result;
  return result;
}

function toolByName(tools: OpenArtToolSummary[], name: string) {
  return tools.find((tool) => tool.name === name);
}

function propertyValue(definition: unknown, requested: unknown) {
  if (!isRecord(definition)) return requested;
  const enumValues = Array.isArray(definition.enum) ? definition.enum : [];

  if (requested !== undefined && requested !== null && requested !== "") {
    if (enumValues.length) {
      const requestedString = String(requested).toLowerCase();
      const matching = enumValues.find((item) => String(item).toLowerCase() === requestedString);
      if (matching !== undefined) return matching;
      if (definition.default !== undefined && enumValues.includes(definition.default)) return definition.default;
      return enumValues[0];
    }
    if (typeof requested === "number") {
      const minimum = typeof definition.minimum === "number" ? definition.minimum : Number.NEGATIVE_INFINITY;
      const maximum = typeof definition.maximum === "number" ? definition.maximum : Number.POSITIVE_INFINITY;
      return Math.min(maximum, Math.max(minimum, requested));
    }
    return requested;
  }

  if (definition.default !== undefined) return definition.default;
  if (enumValues.length) return enumValues[0];
  return requested;
}

function mapToolArgs(schema: unknown, values: Record<string, unknown>) {
  const properties = schemaProperties(schema);
  if (!Object.keys(properties).length) return values;
  const result: Record<string, unknown> = {};

  for (const [propertyName, definition] of Object.entries(properties)) {
    const key = normalizeKey(propertyName);
    let value: unknown;
    if (/filename|objectname|name/.test(key)) value = values.fileName;
    else if (/mimetype|contenttype|mediatype|filetype/.test(key)) value = values.mimeType;
    else if (/filesize|contentlength|size|bytes/.test(key)) value = values.fileSize;
    else if (/extension|ext/.test(key)) value = values.extension;
    else if (/url|source|asset/.test(key)) value = values.url;
    else if (/kind|category/.test(key)) value = values.mediaKind;
    value = propertyValue(definition, value);
    if (value !== undefined && value !== null && value !== "") result[propertyName] = value;
  }
  return result;
}

function collectUrlEntries(node: unknown, path = "", output: Array<{ path: string; url: string }> = []) {
  if (Array.isArray(node)) {
    node.forEach((value, index) => collectUrlEntries(value, `${path}.${index}`, output));
    return output;
  }
  if (!isRecord(node)) return output;
  for (const [key, value] of Object.entries(node)) {
    const next = path ? `${path}.${key}` : key;
    if (typeof value === "string" && /^https?:\/\//.test(value)) output.push({ path: next, url: value });
    else if (value && typeof value === "object") collectUrlEntries(value, next, output);
  }
  return output;
}

function findReference(node: unknown): UploadedReference | null {
  if (Array.isArray(node)) {
    for (const value of node) {
      const found = findReference(value);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (typeof node.url === "string" && typeof node.type === "string" && /image|video|audio/.test(node.type)) {
    return node as UploadedReference;
  }
  for (const value of Object.values(node)) {
    const found = findReference(value);
    if (found) return found;
  }
  return null;
}

async function loadAssetBytes(supabase: SupabaseClient, asset: StoredAsset) {
  if (asset.storage_bucket && asset.storage_path) {
    const { data, error } = await supabase.storage.from(asset.storage_bucket).download(asset.storage_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  if (!asset.public_url) throw new Error("Asseten mangler en lesbar fil-URL.");
  const response = await fetch(asset.public_url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Kunne ikke lese asset (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

function extensionFromMime(mimeType: string) {
  const mapping: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return mapping[mimeType] || mimeType.split("/")[1]?.split("+")[0] || "bin";
}

async function uploadAssetToOpenArt(
  supabase: SupabaseClient,
  asset: StoredAsset,
  mediaKind: "image" | "video" | "audio",
): Promise<UploadedReference> {
  const tools = await listOpenArtTools();
  const signTool = toolByName(tools, "openart_upload_sign");
  const metadataTool = toolByName(tools, "openart_upload_metadata_get");
  if (!signTool) throw new Error("OpenArt-kontoen rapporterer ikke signert filopplasting.");

  const mimeType = asset.mime_type || `${mediaKind}/${mediaKind === "image" ? "png" : mediaKind === "video" ? "mp4" : "mpeg"}`;
  const bytes = await loadAssetBytes(supabase, asset);
  const maxBytes = 500 * 1024 * 1024;
  if (bytes.byteLength > maxBytes) throw new Error("Filen er større enn 500 MB og kan ikke sendes til OpenArt.");
  const extension = extensionFromMime(mimeType);
  const fileName = `${mediaKind}-${asset.id}.${extension}`;

  const signArgs = mapToolArgs(signTool.inputSchema, {
    fileName,
    mimeType,
    fileSize: bytes.byteLength,
    extension,
    mediaKind,
  });
  const signed = await callOpenArtTool<unknown>("openart_upload_sign", signArgs, 45_000);
  const urls = collectUrlEntries(signed);
  const signEntry = urls.find((entry) => /sign|upload|presign/i.test(entry.path));
  const assetEntry = urls.find((entry) => entry.url !== signEntry?.url && /url|asset|file|resource|public/i.test(entry.path));
  if (!signEntry) throw new Error("OpenArt returnerte ingen signert upload-URL.");

  const uploadResponse = await fetch(signEntry.url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(120_000),
  });
  if (!uploadResponse.ok) throw new Error(`Opplasting til OpenArt feilet (${uploadResponse.status}).`);

  const signedReference = findReference(signed);
  const uploadedUrl = signedReference?.url || assetEntry?.url;
  if (!uploadedUrl) throw new Error("OpenArt returnerte ingen referanse-URL etter opplasting.");

  if (metadataTool) {
    const metadataArgs = mapToolArgs(metadataTool.inputSchema, { url: uploadedUrl, mediaKind });
    const metadata = await callOpenArtTool<unknown>("openart_upload_metadata_get", metadataArgs, 45_000).catch(() => null);
    const metadataReference = findReference(metadata);
    if (metadataReference) return metadataReference;
  }

  return {
    type: mediaKind,
    id: `${mediaKind}-${asset.id}`,
    url: uploadedUrl,
    label: asset.title || `${mediaKind} reference`,
  };
}

function expectedType(definition: unknown) {
  if (!isRecord(definition)) return "";
  return typeof definition.type === "string" ? definition.type : "";
}

function adaptValueForDefinition(definition: unknown, reference: UploadedReference) {
  const type = expectedType(definition);
  if (type === "string") return reference.url;
  if (type === "array") return [reference];
  return reference;
}

function buildGenerationParams(
  formSchema: unknown,
  values: {
    prompt: string;
    audioReference: UploadedReference;
    visualReference: UploadedReference;
    durationSeconds?: number;
    resolution?: string;
    aspectRatio?: string;
  },
) {
  const properties = schemaProperties(formSchema);
  const params: Record<string, unknown> = {};

  for (const [propertyName, definition] of Object.entries(properties)) {
    const key = normalizeKey(propertyName);
    let value: unknown;

    if (/generateaudio|withaudio|audioenabled|soundenabled|addaudio/.test(key)) value = true;
    else if (/count|videocount|imagecount|numoutputs/.test(key)) value = 1;
    else if (/duration|seconds|length/.test(key)) value = values.durationSeconds;
    else if (/resolution|quality/.test(key)) value = values.resolution;
    else if (/aspectratio|ratio/.test(key)) value = values.aspectRatio;
    else if (/prompt|instruction|description/.test(key)) value = values.prompt;
    else if (/visualreferences|references|elements|assets/.test(key)) value = [values.visualReference, values.audioReference];
    else if (/audio|voice|speech|soundtrack|narration/.test(key)) value = adaptValueForDefinition(definition, values.audioReference);
    else if (/startframe|image|portrait|character|visual|video|element/.test(key)) value = adaptValueForDefinition(definition, values.visualReference);

    value = propertyValue(definition, value);
    if (value !== undefined && value !== null && value !== "") params[propertyName] = value;
  }

  const missing = schemaRequired(formSchema).filter((name) => params[name] === undefined);
  if (missing.length) {
    throw new Error(`OpenArt-modellen krever flere felt som ikke kan utledes automatisk: ${missing.join(", ")}.`);
  }
  return params;
}

function extractHistoryId(raw: unknown) {
  const text = JSON.stringify(raw ?? {});
  const match = text.match(/"historyId"\s*:\s*"([^"]+)"/i);
  if (!match) throw new Error(`OpenArt startet ikke jobben: ${text.slice(0, 280)}`);
  return match[1];
}

async function loadTenantAsset(supabase: SupabaseClient, organizationId: string, assetId: string) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, project_id, brand_id, media_type, mime_type, public_url, storage_bucket, storage_path, title")
    .eq("organization_id", organizationId)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Fant ikke valgt Media Library-asset.");
  return data as StoredAsset;
}

async function ensureBridgeProject(
  supabase: SupabaseClient,
  params: { organizationId: string; userId?: string | null; projectId?: string; fallbackProjectId?: string | null; prompt: string; actorEmail: string },
) {
  if (params.projectId) return params.projectId;
  if (params.fallbackProjectId) return params.fallbackProjectId;
  const { data, error } = await supabase
    .from("media_projects")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId || null,
      name: `OpenArt Voice Video · ${new Date().toLocaleDateString("nb-NO")}`,
      description: params.prompt,
      project_type: "openart_voice_video",
      status: "active",
      metadata_json: { actorEmail: params.actorEmail, autoCreated: true, source: "openart_voice_bridge" },
    })
    .select("id")
    .single();
  if (error) throw new Error(`Kunne ikke opprette prosjekt: ${error.message}`);
  return String(data.id);
}

export async function createOpenArtVoiceBridgeJob(
  supabase: SupabaseClient,
  context: { organizationId: string; userId?: string | null; actorEmail: string },
  rawRequest: OpenArtVoiceBridgeRequest,
) {
  const request = openArtVoiceBridgeRequestSchema.parse(rawRequest);

  if (request.idempotencyKey) {
    const { data: existing } = await supabase
      .from("media_generation_jobs")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("idempotency_key", request.idempotencyKey)
      .maybeSingle();
    if (existing) return { job: existing, existing: true };
  }

  const [audioAsset, visualAsset, discovered] = await Promise.all([
    loadTenantAsset(supabase, context.organizationId, request.audioAssetId),
    loadTenantAsset(supabase, context.organizationId, request.visualAssetId),
    discoverOpenArtVoiceBridgeOptions(),
  ]);

  if (!audioAsset.media_type.match(/voice|audio/)) throw new Error("Den valgte lydkilden er ikke et voice/audio-asset.");
  if (!visualAsset.media_type.match(/image|video|avatar/)) throw new Error("Velg et bilde, en video eller en avatar som visuelt motiv.");

  const selected = discovered.options.find((option) => option.model === request.model && option.mode === request.mode);
  if (!selected) throw new Error("Den valgte OpenArt-modellen rapporterer ikke kompatibel audio- og visual-reference-støtte.");

  const projectId = await ensureBridgeProject(supabase, {
    organizationId: context.organizationId,
    userId: context.userId,
    projectId: request.projectId,
    fallbackProjectId: visualAsset.project_id || audioAsset.project_id,
    prompt: request.prompt,
    actorEmail: context.actorEmail,
  });

  const visualKind: "image" | "video" = visualAsset.media_type === "video" ? "video" : "image";
  const [audioReference, visualReference] = await Promise.all([
    uploadAssetToOpenArt(supabase, audioAsset, "audio"),
    uploadAssetToOpenArt(supabase, visualAsset, visualKind),
  ]);

  const params = buildGenerationParams(selected.formSchema, {
    prompt: request.prompt,
    audioReference,
    visualReference,
    durationSeconds: request.durationSeconds,
    resolution: request.resolution,
    aspectRatio: request.aspectRatio,
  });

  const generated = await callOpenArtTool<unknown>(
    "openart_generate_video",
    { model: selected.model, mode: selected.mode, params },
    90_000,
  );
  const historyId = extractHistoryId(generated);

  const plan: MediaPromptPlan = mediaPromptPlanSchema.parse({
    mediaType: "video",
    operation: "openart_voice_bridge",
    useCase: "talking_video",
    originalRequest: request.prompt,
    optimizedPrompt: request.prompt,
    brandId: visualAsset.brand_id || audioAsset.brand_id || undefined,
    aspectRatio: request.aspectRatio,
    durationSeconds: request.durationSeconds,
    resolution: request.resolution,
    qualityTier: "premium",
    referenceRequirements: [
      { type: "person", required: true, reason: "Visual source for OpenArt video", consentRequired: true },
    ],
    providerRecommendation: {
      provider: "openart",
      displayName: "OpenArt",
      reason: "Selected dynamically from OpenArt models that report audio and visual reference support.",
      estimatedCostTier: "premium",
      model: selected.model,
    },
    safetyNotes: [
      "AI-generert video skal merkes tydelig.",
      "Brukeren har bekreftet rettigheter og samtykke for lyd og visuelt materiale.",
    ],
    promptBlocks: {
      sourceAudioAssetId: audioAsset.id,
      sourceVisualAssetId: visualAsset.id,
      openArtMode: selected.mode,
    },
    estimatedCostTier: "premium",
  });

  const promptHash = createHash("sha256")
    .update([audioAsset.id, visualAsset.id, selected.model, selected.mode, request.prompt].join("|"))
    .digest("hex");

  const { data: promptPlan, error: promptError } = await supabase
    .from("media_prompt_plans")
    .insert({
      organization_id: context.organizationId,
      user_id: context.userId || null,
      project_id: projectId,
      brand_id: plan.brandId || null,
      original_request: plan.originalRequest,
      plan_json: plan,
      optimized_prompt: plan.optimizedPrompt,
      media_type: "video",
      operation: plan.operation,
      provider: "openart",
      model: selected.model,
      aspect_ratio: request.aspectRatio || null,
      duration_seconds: request.durationSeconds || null,
      resolution: request.resolution || null,
      quality_tier: "premium",
      estimated_cost_tier: "premium",
      prompt_hash: promptHash,
    })
    .select("id")
    .single();
  if (promptError) throw new Error(`Kunne ikke lagre promptplan: ${promptError.message}`);

  const { data: job, error: jobError } = await supabase
    .from("media_generation_jobs")
    .insert({
      organization_id: context.organizationId,
      user_id: context.userId || null,
      project_id: projectId,
      prompt_plan_id: promptPlan.id,
      brand_id: plan.brandId || null,
      provider: "openart",
      provider_job_id: historyId,
      media_type: "video",
      operation: plan.operation,
      status: "submitted",
      original_request: request.prompt,
      prompt_plan_json: plan,
      final_prompt: request.prompt,
      model: selected.model,
      aspect_ratio: request.aspectRatio || null,
      resolution: request.resolution || null,
      duration_seconds: request.durationSeconds || null,
      quality_tier: "premium",
      estimated_cost: "premium",
      progress: 10,
      input_assets_json: {
        audioAssetId: audioAsset.id,
        visualAssetId: visualAsset.id,
        audioReference,
        visualReference,
        mode: selected.mode,
        autoExportToContentHub: request.autoExportToContentHub,
      },
      idempotency_key: request.idempotencyKey || null,
      queued_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (jobError) throw new Error(`Kunne ikke lagre OpenArt-jobben: ${jobError.message}`);

  return { job, existing: false, option: selected };
}
