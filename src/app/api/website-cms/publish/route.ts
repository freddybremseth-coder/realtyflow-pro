import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BRANDS } from "@/lib/constants";
import { resolveWebsiteCmsConfig, slugifyCmsTitle, type WebsiteCmsDestination } from "@/lib/website-cms";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function asCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag).trim()).filter(Boolean);
}

function firstParagraph(markdown: string) {
  return (
    markdown
      .split(/\n{2,}/)
      .map((part) => part.replace(/^#+\s*/gm, "").trim())
      .find(Boolean)
      ?.slice(0, 260) || ""
  );
}

function isMissingColumn(message: string) {
  return /column[^\n]*(does not exist|schema cache)|Could not find the '[^']+' column/i.test(message);
}

function stripOptionalPublicationColumns(payload: Record<string, unknown>) {
  const minimalPayload = { ...payload };
  delete minimalPayload.scheduled_platforms;
  delete minimalPayload.last_publish_error;
  delete minimalPayload.publish_attempts;
  return minimalPayload;
}

async function insertPublication(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null; usedFallback: boolean }> {
  const first = await supabase
    .from("content_publications")
    .insert(payload)
    .select("id, title, status, created_at")
    .single();

  if (!first.error) {
    return { data: first.data as Record<string, unknown>, error: null, usedFallback: false };
  }

  if (!isMissingColumn(first.error.message)) {
    return { data: null, error: { message: first.error.message }, usedFallback: false };
  }

  const minimalPayload = stripOptionalPublicationColumns(payload);
  const fallback = await supabase
    .from("content_publications")
    .insert(minimalPayload)
    .select("id, title, status, created_at")
    .single();

  if (fallback.error) return { data: null, error: { message: fallback.error.message }, usedFallback: true };
  return { data: fallback.data as Record<string, unknown>, error: null, usedFallback: true };
}

async function updatePublication(
  supabase: SupabaseClient,
  publicationId: string,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null; usedFallback: boolean }> {
  const first = await supabase
    .from("content_publications")
    .update(payload)
    .eq("id", publicationId)
    .select("id, title, status, created_at")
    .maybeSingle();

  if (!first.error) {
    return first.data
      ? { data: first.data as Record<string, unknown>, error: null, usedFallback: false }
      : { data: null, error: { message: "Fant ikke Content Hub-utkastet som skulle oppdateres." }, usedFallback: false };
  }

  if (!isMissingColumn(first.error.message)) {
    return { data: null, error: { message: first.error.message }, usedFallback: false };
  }

  const minimalPayload = stripOptionalPublicationColumns(payload);
  const fallback = await supabase
    .from("content_publications")
    .update(minimalPayload)
    .eq("id", publicationId)
    .select("id, title, status, created_at")
    .maybeSingle();

  if (fallback.error) return { data: null, error: { message: fallback.error.message }, usedFallback: true };
  return fallback.data
    ? { data: fallback.data as Record<string, unknown>, error: null, usedFallback: true }
    : { data: null, error: { message: "Fant ikke Content Hub-utkastet som skulle oppdateres." }, usedFallback: true };
}

async function savePublicationState(
  supabase: SupabaseClient,
  sourceType: string,
  sourceId: string,
  payload: Record<string, unknown>,
) {
  if (sourceType === "content_publication" && sourceId) {
    return updatePublication(supabase, sourceId, payload);
  }
  return insertPublication(supabase, payload);
}

async function postToWebsite(
  webhookUrl: string,
  webhookSecret: string,
  payload: Record<string, unknown>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "X-RealtyFlow-Secret": webhookSecret, Authorization: `Bearer ${webhookSecret}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : `Webhook svarte ${response.status}`;
      return { ok: false, status: response.status, data, error: message };
    }
    return { ok: true, status: response.status, data, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook feilet";
    return { ok: false, status: 0, data: {}, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });

  const body = await request.json();
  const brandId = asCleanString(body.brand_id || body.brandId);
  const title = asCleanString(body.title);
  const content = asCleanString(body.content || body.markdown);
  const destinationId = asCleanString(body.destination_id || body.destinationId);
  const requestedSlug = asCleanString(body.slug);
  const imageUrl = asCleanString(body.image_url || body.imageUrl);
  const status = asCleanString(body.status) === "draft" ? "draft" : "published";
  const audience = asCleanString(body.audience);
  const summary = asCleanString(body.summary) || firstParagraph(content);
  const sourceType = asCleanString(body.source_type || body.sourceType || "document");
  const sourceId = asCleanString(body.source_id || body.sourceId);

  if (!brandId || !title || !content) {
    return NextResponse.json({ error: "brand_id, title og content er påkrevd" }, { status: 400 });
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  const brand = BRANDS.find((item) => item.id === brandId);
  const settings = (settingsRow?.settings || {}) as Record<string, unknown>;
  const config = resolveWebsiteCmsConfig(brandId, settings, brand?.website);
  const destination =
    config.destinations.find((item) => item.id === destinationId) ||
    config.destinations.find((item) => item.id === config.defaultDestinationId) ||
    config.destinations[0];

  if (!destination) {
    return NextResponse.json({ error: "Brandet mangler publiseringsmål" }, { status: 400 });
  }

  const slug = requestedSlug || slugifyCmsTitle(title);
  const tags = Array.from(new Set(["website", `cms:${destination.id}`, `slug:${slug}`, ...asTags(body.tags)]));
  const websitePayload = {
    source: {
      system: "realtyflow",
      type: sourceType,
      id: sourceId || null,
    },
    brand: {
      id: brandId,
      name: config.brandName,
      website: config.website,
    },
    destination,
    status,
    content: {
      title,
      slug,
      summary,
      audience: audience || null,
      markdown: content,
      imageUrl: imageUrl || null,
      tags,
    },
    publishedAt: new Date().toISOString(),
  };

  let websitePublished = false;
  let websiteError = "";
  let websiteResponse: Record<string, unknown> = {};

  if (config.webhookUrl) {
    const outcome = await postToWebsite(config.webhookUrl, config.webhookSecret, websitePayload);
    websitePublished = outcome.ok;
    websiteError = outcome.error;
    websiteResponse = outcome.data;
  }

  const publicationStatus = config.webhookUrl
    ? websitePublished
      ? "published"
      : "failed"
    : "published";

  const now = new Date().toISOString();
  const publicationPayload: Record<string, unknown> = {
    brand_id: brandId,
    content_type: `website_${destination.contentType}`,
    title,
    description: content,
    tags,
    media_urls: imageUrl ? [imageUrl] : [],
    ai_generated: Boolean(body.ai_generated ?? body.aiGenerated),
    ai_title: title,
    ai_description: summary,
    ai_tags: tags,
    ai_image_url: imageUrl || null,
    status: publicationStatus,
    scheduled_platforms: ["website"],
    published_at: publicationStatus === "published" ? now : null,
    updated_at: now,
    publish_attempts: config.webhookUrl ? 1 : 0,
    last_publish_error: websiteError || null,
  };

  const insertResult = await savePublicationState(supabase, sourceType, sourceId, publicationPayload);
  if (insertResult.error) {
    return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
  }

  const externalUrl =
    asCleanString(websiteResponse.url) ||
    asCleanString(websiteResponse.external_url) ||
    asCleanString(websiteResponse.permalink);

  const warning = config.webhookUrl
    ? websitePublished
      ? ""
      : `Publisering til nettsiden feilet: ${websiteError || "ukjent feil"}`
    : "Brandet bruker RealtyFlow sin innebygde website-feed. Saken er publisert og klar for nettsiden.";

  return NextResponse.json({
    success: true,
    mode: config.webhookUrl ? "direct" : "queue",
    websitePublished,
    externalUrl,
    warning,
    destination: destination as WebsiteCmsDestination,
    publication: insertResult.data,
    usedFallback: insertResult.usedFallback,
  });
}
