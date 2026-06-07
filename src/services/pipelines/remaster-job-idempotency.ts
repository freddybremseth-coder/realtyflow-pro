import { createHash } from "crypto";
import type { RemasterPipelineIdempotencyInput } from "./remaster-job-types";

export const REMASTER_PIPELINE_IDEMPOTENCY_PREFIX = "remaster_pipeline";

function normalizeString(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalRemasterPipelineInput(input: RemasterPipelineIdempotencyInput) {
  return {
    audioReference: normalizeString(input.audioReference),
    brand: normalizeString(input.brand).toLowerCase(),
    inputVersion: normalizeString(input.inputVersion),
    logoUrl: normalizeString(input.logoUrl),
    metadataVersion: normalizeString(input.metadataVersion),
    publishingSettings: canonicalize(input.publishingSettings || {}),
    slideshowImages: input.slideshowImages.map((url) => normalizeString(url)),
    songId: normalizeString(input.songId),
    thumbnailUrl: normalizeString(input.thumbnailUrl),
  };
}

export function buildRemasterPipelineIdempotencyKey(
  input: RemasterPipelineIdempotencyInput,
): string {
  const canonicalInput = canonicalRemasterPipelineInput(input);
  const digest = createHash("sha256").update(stableStringify(canonicalInput)).digest("hex");
  return `${REMASTER_PIPELINE_IDEMPOTENCY_PREFIX}:${digest}`;
}
