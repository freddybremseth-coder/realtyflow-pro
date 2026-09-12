import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createMediaJob } from "@/services/media/job-service";
import { getDefaultMediaOrganizationId } from "@/services/media/organization";
import { createMediaPromptPlan } from "@/services/media/prompt-director";

const SYSTEM_ACTOR = "nexus-marketing-autopilot@system.local";

export interface AutopilotInstagramMediaInput {
  brandId: string;
  contentKey: string;
  theme: string;
  audience?: string;
  visualDirection?: string;
}

export interface AutopilotInstagramMediaResult {
  imageUrl: string;
  jobId: string;
  assetId: string | null;
  provider: string | null;
  existing: boolean;
}

function safeText(value: string | undefined, max = 1200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function idempotencyKey(input: AutopilotInstagramMediaInput) {
  const digest = crypto
    .createHash("sha256")
    .update(`${input.brandId}|${input.contentKey}|${input.theme}|${input.visualDirection ?? ""}`)
    .digest("hex")
    .slice(0, 32);
  return `growth-instagram-media:${input.brandId}:${digest}`;
}

function completedPublicAsset(job: Record<string, any>) {
  if (String(job.status) !== "completed") return null;
  const assets = Array.isArray(job.result_assets_json) ? job.result_assets_json : [];
  const asset = assets.find((item: any) => typeof item?.public_url === "string" && /^https:\/\//i.test(item.public_url));
  if (!asset) return null;
  return {
    imageUrl: String(asset.public_url),
    assetId: asset.id ? String(asset.id) : null,
  };
}

/**
 * Generate one canonical Instagram image through the existing Media Studio
 * stack. The job is idempotent per content slot, so retries reuse the same
 * generated asset instead of spending again or creating duplicate visuals.
 *
 * This helper intentionally does not invent product screenshots or visible
 * UI/text. The image is a brand-compatible conceptual visual; factual product
 * claims remain in the separately guarded marketing copy.
 */
export async function generateAutopilotInstagramImage(
  supabase: SupabaseClient,
  input: AutopilotInstagramMediaInput,
): Promise<AutopilotInstagramMediaResult> {
  const organizationId = await getDefaultMediaOrganizationId(supabase);
  const theme = safeText(input.theme, 1200) || "practical business use of AI and digital workflows";
  const visualDirection = safeText(input.visualDirection, 600);
  const audience = safeText(input.audience, 400);

  const request = [
    `Create a professional Instagram visual for ${input.brandId}.`,
    `Marketing theme: ${theme}.`,
    visualDirection ? `Visual direction: ${visualDirection}.` : "",
    "Use a credible conceptual business scene or abstract workflow composition that supports the theme.",
    "Do not invent a product interface, dashboard, customer logo, testimonial, price, metric or outcome.",
    "Do not include readable text, captions, watermarks or extra logos in the image.",
  ].filter(Boolean).join(" ");

  const plan = createMediaPromptPlan({
    request,
    mode: "professional",
    mediaType: "image",
    useCase: "social_post",
    platform: "instagram",
    brandId: input.brandId,
    audience: audience || undefined,
    style: visualDirection || "professional, modern, credible, clean commercial technology visual",
    aspectRatio: "4:5",
    qualityTier: "balanced",
    sourceImageUrls: [],
    allowText: false,
  });

  const result = await createMediaJob(supabase, {
    organizationId,
    userId: null,
    actorEmail: SYSTEM_ACTOR,
    body: {
      plan,
      brandId: input.brandId,
      sourceImageUrls: [],
      idempotencyKey: idempotencyKey(input),
      autoExportToContentHub: false,
    },
  });

  const job = result.job as Record<string, any>;
  const asset = completedPublicAsset(job);
  if (!asset) {
    const detail = job.error_message ? `: ${String(job.error_message).slice(0, 300)}` : "";
    throw new Error(`MEDIA_GENERATION_NOT_READY: ${String(job.status ?? "unknown")}${detail}`);
  }

  return {
    imageUrl: asset.imageUrl,
    jobId: String(job.id),
    assetId: asset.assetId,
    provider: job.provider ? String(job.provider) : null,
    existing: result.existing,
  };
}
