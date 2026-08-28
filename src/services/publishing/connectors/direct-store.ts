import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOK_EPUB_PRICE_EUR, safeBookPrice } from "@/lib/books-sales";
import { toEpubBuffer } from "@/lib/publishing/epub-export";

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asList(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function slug(value: unknown) {
  return String(value || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "book";
}

function plainText(value: unknown) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildDirectStoreListing(project: Record<string, any>) {
  const metadata = asObject(project.metadata_plan);
  const retailer = Object.keys(asObject(metadata.kdp)).length > 0 ? asObject(metadata.kdp) : metadata;
  const directStore = asObject(metadata.direct_store);
  const imagePlan = asObject(metadata.image_plan);
  const cover = asObject(imagePlan.cover);
  const keywords = asList(retailer.keywords ?? metadata.keywords).slice(0, 20);
  const categories = asList(retailer.categories ?? metadata.categories);
  const priceEur = safeBookPrice(directStore.price_eur ?? metadata.price_eur, BOOK_EPUB_PRICE_EUR);

  return {
    brand_id: String(project.brand_id || "freddypublishing"),
    source_project_id: String(project.id),
    title: String(project.title || "").trim(),
    subtitle: String(project.subtitle || retailer.subtitle || "").trim(),
    format: "epub",
    marketplace: "books.freddybremseth.com",
    niche: String(project.niche || project.genre || "books"),
    series_name: String(project.series_name || "").trim(),
    role: "front_product",
    status: "active",
    price: priceEur,
    currency: "EUR",
    main_category: categories[0] || String(project.genre || "Books"),
    keywords,
    description: plainText(retailer.description_html || retailer.description || metadata.description_html),
    language: String(project.language || "en").trim(),
    cover_url: String(cover.image_url || metadata.cover_image_url || "").trim() || null,
    next_action: "Mål visninger, checkout og salg før pris eller metadata endres.",
  };
}

export async function publishProjectToDirectStore(
  supabase: SupabaseClient,
  project: Record<string, any>,
) {
  const listing = buildDirectStoreListing(project);
  if (!listing.title) throw new Error("Direct-store listing is missing a title");

  const epub = await toEpubBuffer(project);
  const artifactHash = createHash("sha256").update(epub).digest("hex");
  const storagePath = `${listing.brand_id}/${project.id}/${artifactHash.slice(0, 16)}-${slug(listing.title)}.epub`;
  const { error: uploadError } = await supabase.storage.from("book-epubs").upload(storagePath, epub, {
    contentType: "application/epub+zip",
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) throw new Error(`EPUB upload failed: ${uploadError.message}`);

  const now = new Date().toISOString();
  const payload = { ...listing, epub_path: storagePath, published_at: now, updated_at: now };
  let bookResult;
  if (project.source_book_id) {
    bookResult = await supabase.from("publishing_books")
      .update(payload)
      .eq("id", project.source_book_id)
      .select("id,title,epub_path,price,currency")
      .single();
  } else {
    bookResult = await supabase.from("publishing_books")
      .upsert(payload, { onConflict: "source_project_id" })
      .select("id,title,epub_path,price,currency")
      .single();
  }
  if (bookResult.error) throw new Error(`Direct-store catalog update failed: ${bookResult.error.message}`);
  const book = bookResult.data as { id: string; title: string; epub_path: string; price: number; currency: string };

  const { error: projectError } = await supabase.from("publishing_book_projects")
    .update({ source_book_id: book.id, updated_at: now })
    .eq("id", project.id);
  if (projectError) throw new Error(`Project linkage failed: ${projectError.message}`);

  const storeUrl = (process.env.BOOKS_SITE_BASE_URL || "https://books.freddybremseth.com").replace(/\/$/, "");
  return {
    book,
    externalId: book.id,
    externalUrl: storeUrl,
    artifactManifest: {
      direct_store_epub: {
        bucket: "book-epubs",
        path: storagePath,
        sha256: artifactHash,
        bytes: epub.byteLength,
        generated_at: now,
      },
    },
  };
}

export async function runApprovedDirectStoreJobs(
  supabase: SupabaseClient,
  options: { limit?: number; jobId?: string; actor?: string } = {},
) {
  const limit = Math.min(Math.max(Number(options.limit || 5), 1), 20);
  const now = new Date().toISOString();
  let query = supabase.from("publishing_distribution_jobs")
    .select("id,publication_id,status,attempt_count,run_after")
    .eq("status", "approved")
    .or(`run_after.is.null,run_after.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (options.jobId) query = query.eq("id", options.jobId);
  const { data: jobs, error: jobsError } = await query;
  if (jobsError) throw jobsError;

  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs || []) {
    const { data: publication, error: publicationError } = await supabase
      .from("publishing_distribution_publications")
      .select("id,project_id,channel,status")
      .eq("id", job.publication_id)
      .maybeSingle();
    if (publicationError) throw publicationError;
    if (!publication || publication.channel !== "direct_store") continue;

    const { data: claimed, error: claimError } = await supabase.rpc("publishing_distribution_claim_job", {
      p_job_id: job.id,
      p_actor: options.actor || "book_distribution_worker",
    });
    if (claimError) throw claimError;
    if (!claimed) {
      results.push({ jobId: job.id, status: "not_claimed" });
      continue;
    }

    try {
      const { data: project, error: projectError } = await supabase.from("publishing_book_projects")
        .select("*")
        .eq("id", publication.project_id)
        .single();
      if (projectError) throw projectError;
      const published = await publishProjectToDirectStore(supabase, project as Record<string, any>);
      const output = { connector: "direct_store_v1", artifact_manifest: published.artifactManifest };
      const { data: finished, error: finishError } = await supabase.rpc("publishing_distribution_finish_job", {
        p_job_id: job.id,
        p_succeeded: true,
        p_book_id: published.book.id,
        p_external_id: published.externalId,
        p_external_url: published.externalUrl,
        p_output: output,
        p_error: null,
      });
      if (finishError) throw finishError;
      await supabase.from("publishing_channel_connections").update({
        status: "connected", last_health_check_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }).eq("channel", "direct_store").eq("external_account_id", "default");
      results.push({ jobId: job.id, status: "succeeded", bookId: published.book.id, transition: finished });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const { data: failed, error: finishError } = await supabase.rpc("publishing_distribution_finish_job", {
        p_job_id: job.id,
        p_succeeded: false,
        p_book_id: null,
        p_external_id: null,
        p_external_url: null,
        p_output: { connector: "direct_store_v1" },
        p_error: { code: "DIRECT_STORE_PUBLISH_FAILED", message: message.slice(0, 1000) },
      });
      if (finishError) throw finishError;
      await supabase.from("publishing_channel_connections").update({
        status: "degraded", last_health_check_at: new Date().toISOString(), last_error: message.slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq("channel", "direct_store").eq("external_account_id", "default");
      results.push({ jobId: job.id, status: "retry_or_failed", error: message, transition: failed });
    }
  }

  return {
    scanned: (jobs || []).length,
    succeeded: results.filter((row) => row.status === "succeeded").length,
    results,
  };
}
