import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { PUBLICATION_ASSET_BUCKET, sha256Buffer, verifiedManifestAsset } from "@/lib/publishing/publication-artifact-upload";
import { prepareSeriesBatch, seriesBatchStoragePath, validateSeriesBatchUploadInput } from "@/lib/publishing/publication-series-batch";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const validation = validateSeriesBatchUploadInput(body);
  if (!validation.ok) return NextResponse.json({ error: "Invalid series batch", details: validation.errors }, { status: 400 });
  const expectedPath = seriesBatchStoragePath(validation.value);
  const suppliedPath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
  if (!suppliedPath || suppliedPath !== expectedPath) return NextResponse.json({ error: "storagePath does not match immutable series batch path" }, { status: 409 });

  const storage = supabase.storage.from(PUBLICATION_ASSET_BUCKET);
  const { data: batchBlob, error: batchError } = await storage.download(expectedPath);
  if (batchError || !batchBlob) return NextResponse.json({ error: batchError?.message || "Series batch not found" }, { status: 404 });
  const batchBytes = new Uint8Array(await batchBlob.arrayBuffer());
  if (batchBytes.byteLength !== validation.value.size || sha256Buffer(batchBytes) !== validation.value.fingerprint) {
    return NextResponse.json({ error: "Stored series batch does not match the declared SHA-256" }, { status: 409 });
  }

  let prepared;
  try {
    prepared = await prepareSeriesBatch(batchBytes);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }

  const createdPaths: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const book of prepared.books) {
      const objects = [
        { path: book.packageStoragePath, bytes: book.packageBytes, contentType: "application/zip", input: book.packageInput },
        ...book.expandedAssets.map((item) => ({ path: item.storagePath, bytes: item.bytes, contentType: item.input.mimeType || "application/octet-stream", input: item.input })),
      ];
      for (const object of objects) {
        const { error: uploadError } = await storage.upload(object.path, object.bytes, { contentType: object.contentType, upsert: false });
        if (uploadError) {
          const { data: existing, error: existingError } = await storage.download(object.path);
          if (existingError || !existing) throw uploadError;
          const existingBytes = new Uint8Array(await existing.arrayBuffer());
          if (existingBytes.byteLength !== object.bytes.byteLength || sha256Buffer(existingBytes) !== object.input.fingerprint) {
            throw new Error(`Immutable path collision for ${object.input.role}`);
          }
        } else {
          createdPaths.push(object.path);
        }
      }
      results.push({
        title: book.manifest.title,
        manifest: book.manifest,
        packageAsset: verifiedManifestAsset(book.packageInput, book.packageStoragePath),
        gates: book.gates,
        ignoredEntries: book.ignoredEntries,
        ingested: false,
      });
    }
  } catch (error) {
    if (createdPaths.length) await storage.remove(createdPaths).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), prepared: false, ingested: false }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    prepared: true,
    ingested: false,
    batchKey: prepared.batchKey,
    seriesName: prepared.seriesName,
    books: results,
    next: "Review all book manifests and gate previews. Ingest remains a separate explicit action and Quality Center remains mandatory.",
  });
}
