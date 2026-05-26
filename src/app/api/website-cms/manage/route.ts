import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BRANDS } from "@/lib/constants";
import { resolveWebsiteCmsConfig, type WebsiteCmsDestination } from "@/lib/website-cms";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag).trim()).filter(Boolean);
}

function extractTagValue(tags: string[], prefix: string) {
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) || "";
}

async function postToWebsite(
  webhookUrl: string,
  webhookSecret: string,
  payload: Record<string, unknown>,
  method: "POST" | "DELETE" = "POST",
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(webhookUrl, {
      method,
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

function buildWebsitePayload(params: {
  brandId: string;
  brandName: string;
  website: string;
  destination: WebsiteCmsDestination;
  sourceType: string;
  sourceId: string;
  title: string;
  content: string;
  summary: string;
  imageUrl: string;
  slug: string;
  tags: string[];
  status: "draft" | "published";
}) {
  return {
    source: {
      system: "realtyflow",
      type: params.sourceType,
      id: params.sourceId,
    },
    brand: {
      id: params.brandId,
      name: params.brandName,
      website: params.website,
    },
    destination: params.destination,
    status: params.status,
    content: {
      title: params.title,
      slug: params.slug,
      summary: params.summary,
      markdown: params.content,
      imageUrl: params.imageUrl || null,
      tags: params.tags,
    },
    publishedAt: new Date().toISOString(),
  };
}

async function updateLocalPublication(
  supabase: SupabaseClient,
  publicationId: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("content_publications")
    .update(payload)
    .eq("id", publicationId)
    .select("id, status, title, updated_at")
    .single();
  return { data, error };
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const action = asCleanString(body?.action);
  const publicationId = asCleanString(body?.publication_id || body?.publicationId);
  if (!publicationId) {
    return NextResponse.json({ error: "publication_id er påkrevd" }, { status: 400 });
  }
  if (!["update", "unpublish", "delete"].includes(action)) {
    return NextResponse.json({ error: "action må være update, unpublish eller delete" }, { status: 400 });
  }

  const { data: publication, error: publicationError } = await supabase
    .from("content_publications")
    .select("id, brand_id, content_type, title, description, ai_description, tags, media_urls, ai_image_url, status")
    .eq("id", publicationId)
    .single();

  if (publicationError || !publication) {
    return NextResponse.json({ error: publicationError?.message || "Fant ikke publiseringen" }, { status: 404 });
  }

  const brandId = asCleanString(publication.brand_id);
  const tags = asTags(publication.tags);
  const destinationId = extractTagValue(tags, "cms:");
  const slug = extractTagValue(tags, "slug:");
  const sourceType = "content_publication";
  const sourceId = publicationId;

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

  if (action === "delete") {
    if (config.webhookUrl) {
      const deletePayload = buildWebsitePayload({
        brandId,
        brandName: config.brandName,
        website: config.website,
        destination,
        sourceType,
        sourceId,
        title: asCleanString(publication.title),
        content: asCleanString(publication.description),
        summary: asCleanString(publication.ai_description),
        imageUrl: asCleanString((publication.media_urls as string[] | null)?.[0] || publication.ai_image_url || ""),
        slug,
        tags,
        status: "draft",
      });
      const remote = await postToWebsite(config.webhookUrl, config.webhookSecret, deletePayload, "DELETE");
      if (!remote.ok) {
        return NextResponse.json({ error: remote.error || "Kunne ikke slette fra nettsiden" }, { status: 502 });
      }
    }

    const { error } = await supabase.from("content_publications").delete().eq("id", publicationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action, mode: config.webhookUrl ? "direct" : "feed" });
  }

  const nextTitle = action === "update" ? asCleanString(body?.title || publication.title) : asCleanString(publication.title);
  const nextContent = action === "update" ? asCleanString(body?.content || body?.description || publication.description) : asCleanString(publication.description);
  const nextSummary = action === "update"
    ? asCleanString(body?.summary || body?.ai_description || publication.ai_description)
    : asCleanString(publication.ai_description);
  const nextImageUrl = action === "update"
    ? asCleanString(body?.image_url || body?.imageUrl || (publication.media_urls as string[] | null)?.[0] || publication.ai_image_url || "")
    : asCleanString((publication.media_urls as string[] | null)?.[0] || publication.ai_image_url || "");

  if (config.webhookUrl) {
    const remotePayload = buildWebsitePayload({
      brandId,
      brandName: config.brandName,
      website: config.website,
      destination,
      sourceType,
      sourceId,
      title: nextTitle,
      content: nextContent,
      summary: nextSummary,
      imageUrl: nextImageUrl,
      slug,
      tags,
      status: action === "unpublish" ? "draft" : "published",
    });

    const remote = await postToWebsite(config.webhookUrl, config.webhookSecret, remotePayload, "POST");
    if (!remote.ok) {
      return NextResponse.json({ error: remote.error || "Kunne ikke oppdatere nettsiden" }, { status: 502 });
    }
  }

  const nextStatus = action === "unpublish" ? "draft" : "published";
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (action === "update") {
    updatePayload.title = nextTitle;
    updatePayload.description = nextContent;
    updatePayload.ai_title = nextTitle;
    updatePayload.ai_description = nextSummary;
    updatePayload.media_urls = nextImageUrl ? [nextImageUrl] : [];
    updatePayload.ai_image_url = nextImageUrl || null;
  }

  const { data, error } = await updateLocalPublication(supabase, publicationId, updatePayload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    action,
    mode: config.webhookUrl ? "direct" : "feed",
    publication: data,
  });
}
