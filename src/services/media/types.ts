import { z } from "zod";

export const mediaTypes = ["image", "video", "avatar", "voice", "audio"] as const;
export const qualityTiers = ["fast", "balanced", "premium"] as const;
export const costTiers = ["low", "medium", "high", "premium"] as const;
export const providerIds = ["gemini", "openart", "openai"] as const;
export const jobStatuses = ["draft", "queued", "submitted", "processing", "completed", "failed", "cancelled", "expired"] as const;

export type MediaType = (typeof mediaTypes)[number];
export type QualityTier = (typeof qualityTiers)[number];
export type CostTier = (typeof costTiers)[number];
export type ProviderId = (typeof providerIds)[number];
export type MediaJobStatus = (typeof jobStatuses)[number];

export const referenceRequirementSchema = z.object({
  type: z.enum(["image", "product", "person", "property", "style", "logo"]),
  required: z.boolean(),
  reason: z.string(),
  consentRequired: z.boolean().default(false),
});

export const providerRecommendationSchema = z.object({
  provider: z.enum(providerIds),
  displayName: z.string(),
  reason: z.string(),
  estimatedCostTier: z.enum(costTiers),
  model: z.string().optional(),
});

export const mediaPromptPlanSchema = z.object({
  mediaType: z.enum(mediaTypes),
  operation: z.string().min(2),
  useCase: z.string().optional(),
  originalRequest: z.string().min(2),
  optimizedPrompt: z.string().min(20),
  negativePrompt: z.string().optional(),
  platform: z.string().optional(),
  audience: z.string().optional(),
  brandId: z.string().optional(),
  aspectRatio: z.string().optional(),
  durationSeconds: z.number().int().positive().max(120).optional(),
  resolution: z.string().optional(),
  qualityTier: z.enum(qualityTiers),
  voiceLanguage: z.string().max(80).optional(),
  voiceId: z.string().max(80).optional(),
  voiceTone: z.string().max(500).optional(),
  voiceSpeed: z.number().min(0.25).max(4).optional(),
  outputFormat: z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]).optional(),
  referenceRequirements: z.array(referenceRequirementSchema).default([]),
  providerRecommendation: providerRecommendationSchema,
  safetyNotes: z.array(z.string()).default([]),
  promptBlocks: z.record(z.string(), z.string()).default({}),
  estimatedCostTier: z.enum(costTiers),
});

export type ReferenceRequirement = z.infer<typeof referenceRequirementSchema>;
export type ProviderRecommendation = z.infer<typeof providerRecommendationSchema>;
export type MediaPromptPlan = z.infer<typeof mediaPromptPlanSchema>;

export const imageCapabilitySchema = z.object({
  textToImage: z.boolean().default(false),
  imageToImage: z.boolean().default(false),
  inpainting: z.boolean().default(false),
  outpainting: z.boolean().default(false),
  upscaling: z.boolean().default(false),
  backgroundRemoval: z.boolean().default(false),
});

export const videoCapabilitySchema = z.object({
  textToVideo: z.boolean().default(false),
  imageToVideo: z.boolean().default(false),
  audioGeneration: z.boolean().default(false),
});

export const avatarCapabilitySchema = z.object({
  avatarCreation: z.boolean().default(false),
  talkingAvatar: z.boolean().default(false),
});

export const voiceCapabilitySchema = z.object({
  textToSpeech: z.boolean().default(false),
  voiceClone: z.boolean().default(false),
});

export const emptyImageCapabilities = {
  textToImage: false,
  imageToImage: false,
  inpainting: false,
  outpainting: false,
  upscaling: false,
  backgroundRemoval: false,
};

export const emptyVideoCapabilities = {
  textToVideo: false,
  imageToVideo: false,
  audioGeneration: false,
};

export const emptyAvatarCapabilities = {
  avatarCreation: false,
  talkingAvatar: false,
};

export const emptyVoiceCapabilities = {
  textToSpeech: false,
  voiceClone: false,
};

export const providerCapabilitiesSchema = z.object({
  provider: z.string(),
  displayName: z.string(),
  updatedAt: z.string(),
  status: z.enum(["available", "not_connected", "degraded", "unavailable", "unknown"]).default("unknown"),
  image: imageCapabilitySchema.default(emptyImageCapabilities),
  video: videoCapabilitySchema.default(emptyVideoCapabilities),
  avatar: avatarCapabilitySchema.default(emptyAvatarCapabilities),
  voice: voiceCapabilitySchema.default(emptyVoiceCapabilities),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
  })).default([]),
  account: z.record(z.string(), z.unknown()).default({}),
  errorMessage: z.string().optional(),
});

export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export interface ImageGenerationInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  resolution?: string;
  qualityTier: QualityTier;
  sourceImageUrls?: string[];
  model?: string;
  allowText?: boolean;
}

export interface VideoGenerationInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  qualityTier: QualityTier;
  sourceImageUrl?: string;
  generateAudio?: boolean;
  model?: string;
}

export interface VoiceGenerationInput {
  text: string;
  language: string;
  voiceId?: string;
  tone?: string;
  speed?: number;
  outputFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  model?: string;
}

export interface ProviderJobStatus {
  providerJobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled" | "unknown";
  progress?: number;
  resultUrls?: string[];
  thumbnailUrls?: string[];
  errorMessage?: string;
}

export interface MediaGenerationJob {
  provider: string;
  providerJobId?: string;
  status: ProviderJobStatus["status"];
  resultUrls?: string[];
  thumbnailUrls?: string[];
  mimeType?: string;
  inlineBase64?: string;
  textResponse?: string;
  model?: string;
}

export interface MediaProvider {
  id: ProviderId;
  displayName: string;
  getCapabilities(): Promise<ProviderCapabilities>;
  generateImage?(input: ImageGenerationInput): Promise<MediaGenerationJob>;
  generateVideo?(input: VideoGenerationInput): Promise<MediaGenerationJob>;
  generateVoice?(input: VoiceGenerationInput): Promise<MediaGenerationJob>;
  getJobStatus(providerJobId: string): Promise<ProviderJobStatus>;
  cancelJob?(providerJobId: string): Promise<void>;
}

export const createPlanRequestSchema = z.object({
  request: z.string().min(3).max(4096),
  mode: z.enum(["simple", "guided", "professional"]).default("simple"),
  mediaType: z.enum(mediaTypes).optional(),
  useCase: z.string().optional(),
  platform: z.string().optional(),
  brandId: z.string().optional(),
  audience: z.string().optional(),
  style: z.string().optional(),
  aspectRatio: z.string().optional(),
  qualityTier: z.enum(qualityTiers).optional(),
  sourceImageUrls: z.array(z.string().url()).default([]),
  durationSeconds: z.number().int().positive().max(60).optional(),
  allowText: z.boolean().default(false),
  voiceLanguage: z.string().max(80).optional(),
  voiceId: z.string().max(80).optional(),
  voiceTone: z.string().max(500).optional(),
  voiceSpeed: z.number().min(0.25).max(4).optional(),
  outputFormat: z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]).optional(),
});

export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const createJobRequestSchema = z.object({
  plan: mediaPromptPlanSchema,
  projectId: z.string().uuid().optional(),
  brandId: z.string().optional(),
  campaignId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  sourceImageUrls: z.array(z.string().url()).default([]),
  idempotencyKey: z.string().min(8).max(160).optional(),
  autoExportToContentHub: z.boolean().default(false),
});

export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export function emptyCapabilities(provider: string, displayName: string, status: ProviderCapabilities["status"] = "unknown"): ProviderCapabilities {
  return providerCapabilitiesSchema.parse({
    provider,
    displayName,
    updatedAt: new Date().toISOString(),
    status,
    image: emptyImageCapabilities,
    video: emptyVideoCapabilities,
    avatar: emptyAvatarCapabilities,
    voice: emptyVoiceCapabilities,
    tools: [],
    account: {},
  });
}
