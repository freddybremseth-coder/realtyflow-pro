import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOpenArtAccount,
  isOpenArtConnected,
  listOpenArtTools,
  OpenArtError,
  type OpenArtToolSummary,
} from "@/services/integrations/openart-client";
import { OpenAIVoiceProvider } from "./providers/openai-voice-provider";
import {
  emptyCapabilities,
  providerCapabilitiesSchema,
  type ProviderCapabilities,
  type ProviderId,
} from "./types";

function toolNames(tools: OpenArtToolSummary[]) {
  return tools.map((tool) => tool.name.toLowerCase());
}

export function mapOpenArtToolsToCapabilities(tools: OpenArtToolSummary[], account: Record<string, unknown> = {}): ProviderCapabilities {
  const names = toolNames(tools);
  const has = (...patterns: RegExp[]) => names.some((name) => patterns.some((pattern) => pattern.test(name)));

  return providerCapabilitiesSchema.parse({
    provider: "openart",
    displayName: "OpenArt",
    updatedAt: new Date().toISOString(),
    status: "available",
    image: {
      textToImage: has(/generate.*image/, /text.*image/, /image$/),
      imageToImage: has(/image.*image/, /generate.*image/),
      inpainting: has(/inpaint/),
      outpainting: has(/outpaint/),
      upscaling: has(/upscal/),
      backgroundRemoval: has(/background.*remov/, /remove.*background/),
    },
    video: {
      textToVideo: has(/generate.*video/, /text.*video/, /video$/),
      imageToVideo: has(/image.*video/, /generate.*video/),
      audioGeneration: has(/audio/, /sound/),
    },
    avatar: {
      avatarCreation: has(/avatar/),
      talkingAvatar: has(/talking.*avatar/, /avatar.*talk/),
    },
    voice: {
      textToSpeech: has(/text.*speech/, /tts/),
      voiceClone: has(/voice.*clone/, /clone.*voice/),
    },
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
    account,
  });
}

export function geminiCapabilities(): ProviderCapabilities {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  return providerCapabilitiesSchema.parse({
    provider: "gemini",
    displayName: "Gemini",
    updatedAt: new Date().toISOString(),
    status: configured ? "available" : "unavailable",
    image: {
      textToImage: configured,
      imageToImage: configured,
      inpainting: false,
      outpainting: false,
      upscaling: false,
      backgroundRemoval: false,
    },
    video: {},
    avatar: {},
    voice: {},
    tools: [],
    account: configured ? { configured: true } : { configured: false },
    errorMessage: configured ? undefined : "GEMINI_API_KEY er ikke konfigurert.",
  });
}

export async function refreshOpenArtCapabilities(): Promise<ProviderCapabilities> {
  try {
    const connected = await isOpenArtConnected();
    if (!connected) {
      return {
        ...emptyCapabilities("openart", "OpenArt", "not_connected"),
        errorMessage: "OpenArt er ikke tilkoblet.",
      };
    }

    const [tools, account] = await Promise.all([
      listOpenArtTools(),
      getOpenArtAccount().catch((error) => ({ error: error instanceof Error ? error.message : "Account status unavailable" })),
    ]);
    return mapOpenArtToolsToCapabilities(tools, account as Record<string, unknown>);
  } catch (error) {
    const connectRequired = error instanceof OpenArtError && error.connectRequired;
    return {
      ...emptyCapabilities("openart", "OpenArt", connectRequired ? "not_connected" : "degraded"),
      errorMessage: error instanceof Error ? error.message : "Kunne ikke lese OpenArt capabilities.",
    };
  }
}

export async function getCachedProviderCapabilities(
  supabase: SupabaseClient,
  organizationId: string,
  provider: ProviderId,
): Promise<ProviderCapabilities | null> {
  const { data, error } = await supabase
    .from("media_provider_capabilities")
    .select("provider, display_name, status, capabilities_json, tools_json, account_json, error_message, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;
  const capabilities = (data.capabilities_json || {}) as Record<string, unknown>;
  return providerCapabilitiesSchema.parse({
    provider: data.provider,
    displayName: data.display_name || provider,
    updatedAt: data.updated_at,
    status: data.status || "unknown",
    image: capabilities.image || {},
    video: capabilities.video || {},
    avatar: capabilities.avatar || {},
    voice: capabilities.voice || {},
    tools: Array.isArray(data.tools_json) ? data.tools_json : [],
    account: data.account_json || {},
    errorMessage: data.error_message || undefined,
  });
}

export async function saveProviderCapabilities(
  supabase: SupabaseClient,
  organizationId: string,
  capabilities: ProviderCapabilities,
) {
  await supabase.from("media_provider_capabilities").upsert({
    organization_id: organizationId,
    provider: capabilities.provider,
    display_name: capabilities.displayName,
    status: capabilities.status,
    capabilities_json: {
      image: capabilities.image,
      video: capabilities.video,
      avatar: capabilities.avatar,
      voice: capabilities.voice,
    },
    tools_json: capabilities.tools,
    account_json: capabilities.account,
    error_message: capabilities.errorMessage || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,provider" });
}

export async function getProviderCapabilities(
  supabase: SupabaseClient,
  organizationId: string,
  options: { refreshOpenArt?: boolean } = {},
): Promise<ProviderCapabilities[]> {
  const gemini = geminiCapabilities();
  const openai = await new OpenAIVoiceProvider().getCapabilities();
  await Promise.all([
    saveProviderCapabilities(supabase, organizationId, gemini).catch(() => undefined),
    saveProviderCapabilities(supabase, organizationId, openai).catch(() => undefined),
  ]);

  let openart: ProviderCapabilities | null = options.refreshOpenArt
    ? null
    : await getCachedProviderCapabilities(supabase, organizationId, "openart");

  const stale = !openart || Date.now() - Date.parse(openart.updatedAt) > 60 * 60 * 1000;
  if (options.refreshOpenArt || stale) {
    openart = await refreshOpenArtCapabilities();
    await saveProviderCapabilities(supabase, organizationId, openart).catch(() => undefined);
  }
  if (!openart) openart = emptyCapabilities("openart", "OpenArt", "unknown");

  return [gemini, openart, openai];
}

export function supportsCapability(capabilities: ProviderCapabilities, mediaType: string, operation: string) {
  if (capabilities.status !== "available") return false;
  if (mediaType === "image") {
    if (operation === "image_to_image") return capabilities.image.imageToImage;
    return capabilities.image.textToImage;
  }
  if (mediaType === "video") {
    if (operation === "image_to_video") return capabilities.video.imageToVideo;
    return capabilities.video.textToVideo;
  }
  if (mediaType === "avatar") {
    if (operation === "talking_avatar") return capabilities.avatar.talkingAvatar;
    return capabilities.avatar.avatarCreation;
  }
  if (mediaType === "voice" || mediaType === "audio") {
    if (operation === "voice_clone") return capabilities.voice.voiceClone;
    return capabilities.voice.textToSpeech;
  }
  return false;
}
