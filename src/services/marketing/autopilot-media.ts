import crypto from "node:crypto";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createMediaJob, refreshMediaJob, retryMediaJob } from "@/services/media/job-service";
import { getDefaultMediaOrganizationId } from "@/services/media/organization";
import { createMediaPromptPlan } from "@/services/media/prompt-director";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";
import { ZENECO_LOGO_PNG_URL } from "@/lib/brand-assets";

const execFileAsync = promisify(execFile);

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

async function recoverExistingMediaJob(
  supabase: SupabaseClient,
  organizationId: string,
  job: Record<string, any>,
) {
  const status = String(job.status ?? "");
  if (["failed", "expired", "cancelled"].includes(status)) {
    return retryMediaJob(supabase, {
      organizationId,
      actorEmail: SYSTEM_ACTOR,
      jobId: String(job.id),
    }) as Promise<Record<string, any>>;
  }
  if (["submitted", "processing"].includes(status)) {
    return refreshMediaJob(supabase, {
      organizationId,
      actorEmail: SYSTEM_ACTOR,
      jobId: String(job.id),
      autoExportToContentHub: false,
    }) as Promise<Record<string, any>>;
  }
  return job;
}

async function applyZenEcoLogo(
  supabase: SupabaseClient,
  input: AutopilotInstagramMediaInput,
  imageUrl: string,
) {
  if (String(input.brandId).toLowerCase() !== "zeneco") return imageUrl;

  const digest = crypto
    .createHash("sha256")
    .update(`${input.contentKey}|${imageUrl}|zeneco-approved-logo-v2`)
    .digest("hex")
    .slice(0, 28);
  const storagePath = `growth/zeneco/branded-${digest}.png`;
  const bucket = "content-images";

  // Reuse an already branded public object when the same content slot retries.
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
  try {
    const existing = await supabase.storage.from(bucket).download(storagePath);
    if (!existing.error && existing.data) return publicUrl;
  } catch {
    // Continue and create the deterministic branded variant.
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "zeneco-social-"));
  const sourcePath = path.join(workDir, "source-image");
  const logoPath = path.join(workDir, "zeneco-logo.png");
  const outputPath = path.join(workDir, "branded.png");

  try {
    const [imageResponse, logoResponse] = await Promise.all([
      fetch(imageUrl, { redirect: "follow" }),
      fetch(ZENECO_LOGO_PNG_URL, { redirect: "follow" }),
    ]);
    if (!imageResponse.ok) throw new Error(`source image download failed (${imageResponse.status})`);
    if (!logoResponse.ok) throw new Error(`Zen Eco Homes logo download failed (${logoResponse.status})`);

    await Promise.all([
      fs.writeFile(sourcePath, Buffer.from(await imageResponse.arrayBuffer())),
      fs.writeFile(logoPath, Buffer.from(await logoResponse.arrayBuffer())),
    ]);

    const ffmpeg = await ensureFFmpeg();
    await execFileAsync(ffmpeg, [
      "-i", sourcePath,
      "-i", logoPath,
      "-filter_complex",
      "[1:v]scale=300:-1:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=W-w-32:H-h-28:format=auto",
      "-frames:v", "1",
      "-compression_level", "7",
      "-y", outputPath,
    ], { timeout: 45_000 });

    const bytes = await fs.readFile(outputPath);
    const upload = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    });
    if (upload.error) throw new Error(upload.error.message);
    return publicUrl;
  } catch (error) {
    console.warn("[Marketing Autopilot] Zen Eco Homes logo overlay failed; using unbranded source image:", error instanceof Error ? error.message : error);
    return imageUrl;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Generate one canonical Instagram image through the existing Media Studio
 * stack. The job is idempotent per content slot, so retries reuse the same
 * generated asset instead of spending again or creating duplicate visuals.
 * Failed/expired jobs are retried in place and asynchronous jobs get one
 * refresh pass before the autopilot fails closed for this run.
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

  let job = result.job as Record<string, any>;
  if (result.existing) {
    job = await recoverExistingMediaJob(supabase, organizationId, job);
  }

  const asset = completedPublicAsset(job);
  if (!asset) {
    const detail = job.error_message ? `: ${String(job.error_message).slice(0, 300)}` : "";
    throw new Error(`MEDIA_GENERATION_NOT_READY: ${String(job.status ?? "unknown")}${detail}`);
  }

  const brandedImageUrl = await applyZenEcoLogo(supabase, input, asset.imageUrl);

  return {
    imageUrl: brandedImageUrl,
    jobId: String(job.id),
    assetId: asset.assetId,
    provider: job.provider ? String(job.provider) : null,
    existing: result.existing,
  };
}
