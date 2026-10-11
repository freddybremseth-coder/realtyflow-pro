import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readBoundedPhoto } from "./advisor-photo-analysis";

const BUCKET = "media-studio";
const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * OpenArt may not be able to retrieve third-party property-gallery URLs.
 * Before starting a billable job, verify the source image and stage one
 * exact-byte copy in the existing public Media Studio bucket.
 *
 * The gallery URL must already have been authenticated and matched to the
 * selected marketable property by the caller. This never accepts an arbitrary
 * URL directly from the client.
 *
 * Reuse the cache path for the same source instead of uploading another copy
 * on every attempt. A new source URL results in a new cache path.
 */
export async function stageAdvisorPropertyReference(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    propertyId: string;
    sourceImageUrl: string;
  },
) {
  const digest = crypto.createHash("sha256")
    .update([input.propertyId, input.sourceImageUrl].join("|"))
    .digest("hex");
  const directory = `${input.organizationId}/advisor-property-references`;

  const { data: listed, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(directory, { search: digest, limit: 5 });
  if (listError) throw new Error("ADVISOR_PROPERTY_STORAGE_UNAVAILABLE");
  const existing = (listed || []).find((file) =>
    file.name === digest + ".jpg" ||
    file.name === digest + ".png" ||
    file.name === digest + ".webp");
  if (existing) {
    return supabase.storage.from(BUCKET)
      .getPublicUrl(`${directory}/${existing.name}`).data.publicUrl;
  }

  let image: Awaited<ReturnType<typeof readBoundedPhoto>>;
  try {
    image = await readBoundedPhoto(input.sourceImageUrl);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "ADVISOR_PROPERTY_FETCH_FAILED";
    throw new Error("ADVISOR_PROPERTY_SOURCE_UNAVAILABLE:" + reason);
  }

  const extension = MIME_EXTENSION[image.mimeType];
  if (!extension) throw new Error("ADVISOR_PROPERTY_IMAGE_FORMAT_UNSUPPORTED");
  const filePath = `${directory}/${digest}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(
    filePath,
    Buffer.from(image.base64, "base64"),
    {
      contentType: image.mimeType,
      cacheControl: "604800",
      upsert: false,
    },
  );
  // Simultaneous preparations may race. A duplicate path is safe: both refer
  // to the same authenticated listing image. All other errors fail closed.
  if (uploadError && !/duplicate|already.exists|resource.already.exists/i.test(
    uploadError.message,
  )) {
    throw new Error("ADVISOR_PROPERTY_STORAGE_UNAVAILABLE");
  }
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}
