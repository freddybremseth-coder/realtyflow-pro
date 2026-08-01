import {
  getOpenArtCreation,
  openArtGenerateImage,
  openArtGenerateVideo,
} from "@/services/integrations/openart-client";
import {
  refreshOpenArtCapabilities,
} from "../capabilities";
import type {
  ImageGenerationInput,
  MediaGenerationJob,
  MediaProvider,
  ProviderJobStatus,
  VideoGenerationInput,
} from "../types";

function normalizeOpenArtStatus(status: string): ProviderJobStatus["status"] {
  if (status === "COMPLETED") return "completed";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "PENDING") return "queued";
  if (status === "RUNNING" || status === "UNKNOWN") return "processing";
  return "unknown";
}

export class OpenArtMediaProvider implements MediaProvider {
  id = "openart" as const;
  displayName = "OpenArt";

  async getCapabilities() {
    return refreshOpenArtCapabilities();
  }

  async generateImage(input: ImageGenerationInput): Promise<MediaGenerationJob> {
    const historyId = await openArtGenerateImage({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution === "2K" || input.resolution === "4K" ? input.resolution : "1K",
      model: input.model,
      sourceImageUrls: input.sourceImageUrls,
      imageCount: 1,
    });

    return {
      provider: this.id,
      providerJobId: historyId,
      status: "processing",
      model: input.model,
    };
  }

  async generateVideo(input: VideoGenerationInput): Promise<MediaGenerationJob> {
    const historyId = await openArtGenerateVideo({
      prompt: input.prompt,
      sourceImageUrl: input.sourceImageUrl,
      aspectRatio: input.aspectRatio,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      model: input.model,
    });

    return {
      provider: this.id,
      providerJobId: historyId,
      status: "processing",
      model: input.model,
    };
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    const creation = await getOpenArtCreation(providerJobId);
    const status = normalizeOpenArtStatus(creation.status);
    return {
      providerJobId,
      status,
      progress: status === "completed" ? 100 : status === "processing" ? 60 : status === "queued" ? 10 : undefined,
      resultUrls: creation.urls,
      thumbnailUrls: creation.thumbnailUrls,
      errorMessage: creation.failedReason,
    };
  }
}
