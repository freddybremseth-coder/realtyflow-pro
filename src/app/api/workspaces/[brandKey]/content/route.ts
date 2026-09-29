import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { resolveWebsiteCmsConfig, slugifyCmsTitle } from "@/lib/website-cms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };

function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: { code, ...(message ? { message } : {}) } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map(item => String(item).trim())
    .filter(Boolean)
    .map(item => item.slice(0, maxLength))))
    .slice(0, maxItems);
}

function firstParagraph(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map(part => part.replace(/^#+\s*/gm, "").trim())
    .find(Boolean)
    ?.slice(0, 500) || "";
}

function contentType(value: unknown) {
  const clean = String(value || "").replace(/^website_/, "");
  return ["article", "guide", "magazine"].includes(clean) ? clean : "article";
}

function extractTag(tags: unknown, prefix: string) {
  if (!Array.isArray(tags)) return "";
  const found = tags.find(tag => typeof tag === "string" && tag.startsWith(prefix));
  return typeof found === "string" ? found.slice(prefix.length) : "";
}

async function loadCmsConfig(supabase: any, brandKey: string) {
  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandKey)
    .maybeSingle();
  if (error) return { config: null, error };
  return {
    config: resolveWebsiteCmsConfig(brandKey, (data?.settings || {}) as Record<string, unknown>),
    error: null,
  };
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
        ...(webhookSecret
          ? { "X-RealtyFlow-Secret": webhookSecret, Authorization: `Bearer ${webhookSecret}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    return {
      ok: response.ok,
      error: response.ok ? "" : typeof data.error === "string" ? data.error : `Nettsiden svarte ${response.status}`,
      data,
    };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Publisering feilet", data: {} };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "content.read");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const [{ data: snapshot, error: snapshotError }, cms] = await Promise.all([
    access.value.supabase.rpc("workspace_brand_content_snapshot", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
    }),
    loadCmsConfig(access.value.supabase, params.brandKey),
  ]);

  if (snapshotError || !snapshot || cms.error || !cms.config) {
    return fail(503, "CONTENT_STUDIO_UNAVAILABLE");
  }

  let opportunities: Array<Record<string, unknown>> = [];
  if (params.brandKey === "zeneco") {
    const { data: opportunityRows, error: opportunityError } = await access.value.supabase
      .from("property_content_opportunities")
      .select("id,opportunity_type,score,title,summary,editorial_angle,property_refs,image_url,detected_at,expires_at")
      .eq("brand_id", params.brandKey)
      .eq("status", "suggested")
      .gt("expires_at", new Date().toISOString())
      .order("score", { ascending: false })
      .order("detected_at", { ascending: false })
      .limit(8);
    if (!opportunityError && Array.isArray(opportunityRows)) {
      opportunities = opportunityRows.map((row: any) => ({
        id: String(row.id || ""),
        opportunityType: String(row.opportunity_type || ""),
        score: Number(row.score || 0),
        title: String(row.title || ""),
        summary: String(row.summary || ""),
        editorialAngle: String(row.editorial_angle || ""),
        propertyRefs: Array.isArray(row.property_refs) ? row.property_refs.map(String).slice(0, 6) : [],
        imageUrl: typeof row.image_url === "string" ? row.image_url : null,
        detectedAt: row.detected_at ? String(row.detected_at) : null,
        expiresAt: row.expires_at ? String(row.expires_at) : null,
      })).filter((row) => row.id && row.title);
    }
  }

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    website: cms.config.website,
    publishingMode: cms.config.webhookUrl ? "direct" : "feed",
    destinations: cms.config.destinations.map(destination => ({
      id: destination.id,
      label: destination.label,
      path: destination.path,
      contentType: destination.contentType,
      description: destination.description || null,
    })),
    defaultDestinationId: cms.config.defaultDestinationId,
    drafts: Array.isArray(snapshot.drafts) ? snapshot.drafts : [],
    published: Array.isArray(snapshot.published) ? snapshot.published : [],
    opportunities,
  }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "INVALID_REQUEST");
  const action = text(body.action, 40);

  if (action === "opportunity_draft" || action === "opportunity_dismiss") {
    const access = await requireBrandWorkspace(request, params.brandKey, "content.edit");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
    if (params.brandKey !== "zeneco") return fail(404, "OPPORTUNITY_NOT_FOUND");

    const opportunityId = text(body.opportunityId, 80);
    if (!opportunityId) return fail(400, "INVALID_OPPORTUNITY");

    const { data: opportunity, error: opportunityError } = await access.value.supabase
      .from("property_content_opportunities")
      .select("id,brand_id,status,opportunity_type,title,summary,draft_markdown,image_url,primary_keyword,supporting_keywords,audience,property_refs,draft_id")
      .eq("id", opportunityId)
      .eq("brand_id", params.brandKey)
      .maybeSingle();
    if (opportunityError || !opportunity) return fail(404, "OPPORTUNITY_NOT_FOUND");

    if (action === "opportunity_dismiss") {
      if (String(opportunity.status) !== "suggested") return fail(409, "OPPORTUNITY_NOT_ACTIVE");
      const { error } = await access.value.supabase
        .from("property_content_opportunities")
        .update({
          status: "dismissed",
          dismissed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunityId)
        .eq("brand_id", params.brandKey)
        .eq("status", "suggested");
      if (error) return fail(503, "OPPORTUNITY_UPDATE_FAILED");
      return NextResponse.json({ ok: true, dismissed: true }, { headers: noStore });
    }

    if (String(opportunity.status) === "drafted" && opportunity.draft_id) {
      return fail(409, "OPPORTUNITY_ALREADY_USED");
    }
    if (String(opportunity.status) !== "suggested") return fail(409, "OPPORTUNITY_NOT_ACTIVE");

    const cms = await loadCmsConfig(access.value.supabase, params.brandKey);
    if (cms.error || !cms.config) return fail(503, "CONTENT_STUDIO_UNAVAILABLE");
    const destination =
      cms.config.destinations.find(item => item.id === "magasin") ||
      cms.config.destinations.find(item => item.path === "/magasin") ||
      cms.config.destinations[0];
    if (!destination) return fail(409, "CONTENT_DESTINATION_MISSING");

    const title = text(opportunity.title, 200);
    const dateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const slugBase = slugifyCmsTitle(title).slice(0, 150);
    const slug = `${slugBase}-${dateSuffix}`.slice(0, 160).replace(/-+$/,"");
    const refs = stringArray(opportunity.property_refs, 8, 40);

    const { data: draft, error: draftError } = await access.value.supabase.rpc("workspace_brand_content_draft_save", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_draft_id: null,
      p_destination_id: destination.id,
      p_destination_label: destination.label,
      p_destination_path: destination.path,
      p_content_type: contentType(destination.contentType),
      p_title: title,
      p_slug: slug,
      p_summary: text(opportunity.summary, 700),
      p_markdown: typeof opportunity.draft_markdown === "string" ? opportunity.draft_markdown.slice(0, 60000) : "",
      p_image_url: text(opportunity.image_url, 2000),
      p_tags: [
        "marked-akkurat-na",
        "nexus-editorial-signal",
        `nexus-opportunity:${opportunityId}`,
        `nexus-angle:${String(opportunity.opportunity_type || "unknown").slice(0, 60)}`,
        ...refs.map(ref => `property:${ref}`),
      ].slice(0, 30),
      p_primary_keyword: text(opportunity.primary_keyword, 160),
      p_supporting_keywords: stringArray(opportunity.supporting_keywords, 20, 160),
      p_audience: text(opportunity.audience, 500),
      p_source_publication_id: null,
    });
    if (draftError || !draft) return fail(409, "CONTENT_DRAFT_CREATE_FAILED");
    if (draft.error === "SLUG_ALREADY_EXISTS") return fail(409, "SLUG_ALREADY_EXISTS");

    const { error: updateError } = await access.value.supabase
      .from("property_content_opportunities")
      .update({
        status: "drafted",
        draft_id: draft.id,
        drafted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId)
      .eq("brand_id", params.brandKey)
      .eq("status", "suggested");
    if (updateError) return fail(503, "OPPORTUNITY_UPDATE_FAILED");

    return NextResponse.json({ ok: true, draft, opportunityId }, { status: 201, headers: noStore });
  }

  if (action === "versions") {
    const access = await requireBrandWorkspace(request, params.brandKey, "content.read");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
    const draftId = text(body.draftId, 80);
    const { data, error } = await access.value.supabase.rpc("workspace_brand_content_versions", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_draft_id: draftId || null,
    });
    if (error || !Array.isArray(data)) return fail(404, "CONTENT_VERSIONS_NOT_FOUND");
    return NextResponse.json({ ok: true, versions: data }, { headers: noStore });
  }

  if (action === "restore") {
    const access = await requireBrandWorkspace(request, params.brandKey, "content.edit");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
    const draftId = text(body.draftId, 80);
    const version = Number(body.version);
    if (!draftId || !Number.isInteger(version) || version < 1) return fail(400, "INVALID_VERSION");
    const { data, error } = await access.value.supabase.rpc("workspace_brand_content_restore_version", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_draft_id: draftId,
      p_version: version,
    });
    if (error || !data) return fail(404, "CONTENT_VERSION_NOT_FOUND");
    return NextResponse.json({ ok: true, draft: data, published: false }, { headers: noStore });
  }

  if (action === "clone_published") {
    const access = await requireBrandWorkspace(request, params.brandKey, "content.edit");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

    const publicationId = text(body.publicationId, 80);
    if (!publicationId) return fail(400, "INVALID_PUBLICATION");

    const { data: publication, error: publicationError } = await access.value.supabase
      .from("content_publications")
      .select("id,brand_id,content_type,title,description,ai_description,tags,media_urls,ai_image_url,content_features")
      .eq("id", publicationId)
      .eq("brand_id", params.brandKey)
      .maybeSingle();
    if (publicationError || !publication) return fail(404, "PUBLICATION_NOT_FOUND");
    if (!String(publication.content_type || "").startsWith("website_") &&
        !(Array.isArray(publication.tags) && publication.tags.includes("website"))) {
      return fail(404, "PUBLICATION_NOT_FOUND");
    }

    const cms = await loadCmsConfig(access.value.supabase, params.brandKey);
    if (cms.error || !cms.config) return fail(503, "CONTENT_STUDIO_UNAVAILABLE");
    const destinationId = extractTag(publication.tags, "cms:") || cms.config.defaultDestinationId;
    const destination = cms.config.destinations.find(item => item.id === destinationId) || cms.config.destinations[0];
    if (!destination) return fail(409, "CONTENT_DESTINATION_MISSING");
    const title = text(publication.title, 200) || "Uten tittel";
    const slug = extractTag(publication.tags, "slug:") || slugifyCmsTitle(title);
    const features = publication.content_features && typeof publication.content_features === "object"
      ? publication.content_features as Record<string, unknown> : {};

    const { data, error } = await access.value.supabase.rpc("workspace_brand_content_draft_save", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_draft_id: null,
      p_destination_id: destination.id,
      p_destination_label: destination.label,
      p_destination_path: destination.path,
      p_content_type: contentType(publication.content_type),
      p_title: title,
      p_slug: slug,
      p_summary: text(publication.ai_description, 700),
      p_markdown: typeof publication.description === "string" ? publication.description.slice(0, 60000) : "",
      p_image_url: Array.isArray(publication.media_urls) && typeof publication.media_urls[0] === "string"
        ? publication.media_urls[0] : text(publication.ai_image_url, 2000),
      p_tags: stringArray(publication.tags, 30, 80)
        .filter(tag => !tag.startsWith("cms:") && !tag.startsWith("slug:") && tag !== "website"),
      p_primary_keyword: text(features.primary_keyword, 160),
      p_supporting_keywords: stringArray(features.supporting_keywords, 20, 160),
      p_audience: text(features.audience, 500),
      p_source_publication_id: publication.id,
    });
    if (error || !data) return fail(409, "CONTENT_DRAFT_CREATE_FAILED");
    if (data.error === "SLUG_ALREADY_EXISTS") return fail(409, "SLUG_ALREADY_EXISTS");
    return NextResponse.json({ ok: true, draft: data }, { status: 201, headers: noStore });
  }

  if (action === "save") {
    const access = await requireBrandWorkspace(request, params.brandKey, "content.edit");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
    const cms = await loadCmsConfig(access.value.supabase, params.brandKey);
    if (cms.error || !cms.config) return fail(503, "CONTENT_STUDIO_UNAVAILABLE");

    const destinationId = text(body.destinationId, 80) || cms.config.defaultDestinationId;
    const destination = cms.config.destinations.find(item => item.id === destinationId);
    if (!destination) return fail(400, "INVALID_DESTINATION");
    const title = text(body.title, 200);
    const markdown = typeof body.markdown === "string" ? body.markdown.slice(0, 60000) : "";
    const requestedSlug = text(body.slug, 160).toLowerCase();
    const slug = requestedSlug ? slugifyCmsTitle(requestedSlug) : slugifyCmsTitle(title);
    if (!title || !slug) return fail(400, "INVALID_CONTENT");

    const { data, error } = await access.value.supabase.rpc("workspace_brand_content_draft_save", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_draft_id: text(body.draftId, 80) || null,
      p_destination_id: destination.id,
      p_destination_label: destination.label,
      p_destination_path: destination.path,
      p_content_type: contentType(destination.contentType),
      p_title: title,
      p_slug: slug,
      p_summary: text(body.summary, 700) || firstParagraph(markdown),
      p_markdown: markdown,
      p_image_url: text(body.imageUrl, 2000),
      p_tags: stringArray(body.tags, 30, 80),
      p_primary_keyword: text(body.primaryKeyword, 160),
      p_supporting_keywords: stringArray(body.supportingKeywords, 20, 160),
      p_audience: text(body.audience, 500),
      p_source_publication_id: text(body.sourcePublicationId, 80) || null,
    });
    if (error || !data) return fail(409, "CONTENT_DRAFT_SAVE_FAILED");
    if (data.error === "SLUG_ALREADY_EXISTS") return fail(409, "SLUG_ALREADY_EXISTS");
    return NextResponse.json({ ok: true, draft: data, published: false }, { headers: noStore });
  }

  if (action === "publish") {
    const access = await requireBrandWorkspace(request, params.brandKey, "content.publish");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
    const draftId = text(body.draftId, 80);
    if (!draftId) return fail(400, "INVALID_DRAFT");

    const [{ data: draft, error: draftError }, cms] = await Promise.all([
      access.value.supabase.rpc("workspace_brand_content_publish_payload", {
        p_brand_key: params.brandKey,
        p_user_id: access.value.verifiedUserId,
        p_email: access.value.verifiedEmail,
        p_draft_id: draftId,
      }),
      loadCmsConfig(access.value.supabase, params.brandKey),
    ]);
    if (draftError || !draft) return fail(404, "CONTENT_DRAFT_NOT_FOUND");
    if (cms.error || !cms.config) return fail(503, "CONTENT_STUDIO_UNAVAILABLE");
    const destination = cms.config.destinations.find(item => item.id === draft.destinationId);
    if (!destination) return fail(409, "CONTENT_DESTINATION_MISSING");

    // Re-check the exact live grant immediately before the external action.
    const recheck = await requireBrandWorkspace(request, params.brandKey, "content.publish");
    if (!recheck.value || !recheck.value.verifiedUserId ||
        recheck.value.verifiedUserId !== access.value.verifiedUserId) {
      return recheck.response || fail(403, "ACCESS_DENIED");
    }

    const canonicalTags = Array.from(new Set([
      "website", `cms:${destination.id}`, `slug:${draft.slug}`,
      ...stringArray(draft.tags, 30, 80),
      ...stringArray(draft.supportingKeywords, 20, 160),
      ...(draft.primaryKeyword ? [String(draft.primaryKeyword)] : []),
    ]));
    const websitePayload = {
      source: { system: "realtyflow", type: "workspace_content", id: draft.id },
      brand: { id: params.brandKey, name: cms.config.brandName, website: cms.config.website },
      destination,
      status: "published",
      content: {
        title: draft.title,
        slug: draft.slug,
        summary: draft.summary || firstParagraph(draft.markdown || ""),
        audience: draft.audience || null,
        markdown: draft.markdown || "",
        imageUrl: draft.imageUrl || null,
        tags: canonicalTags,
      },
      publishedAt: new Date().toISOString(),
    };

    const remote = cms.config.webhookUrl
      ? await postToWebsite(cms.config.webhookUrl, cms.config.webhookSecret, websitePayload)
      : { ok: true, error: "", data: {} as Record<string, unknown> };

    const { data: finalized, error: finalizeError } = await access.value.supabase.rpc(
      "workspace_brand_content_publish_finalize",
      {
        p_brand_key: params.brandKey,
        p_user_id: access.value.verifiedUserId,
        p_email: access.value.verifiedEmail,
        p_draft_id: draftId,
        p_success: remote.ok,
        p_error: remote.error || null,
      },
    );
    if (finalizeError || !finalized) return fail(503, "CONTENT_PUBLISH_FINALIZE_FAILED");
    if (!remote.ok || finalized.ok === false) {
      return fail(502, "CONTENT_PUBLISH_FAILED", remote.error || "Nettsiden avviste publiseringen.");
    }

    const externalUrl =
      (typeof remote.data.url === "string" && remote.data.url) ||
      (typeof remote.data.external_url === "string" && remote.data.external_url) ||
      (typeof remote.data.permalink === "string" && remote.data.permalink) ||
      (cms.config.website
        ? `${cms.config.website.replace(/\/$/, "")}${destination.path}/${draft.slug}`
        : "");

    return NextResponse.json({
      ok: true,
      published: true,
      mode: cms.config.webhookUrl ? "direct" : "feed",
      externalUrl,
      publicationId: finalized.publicationId,
      version: finalized.version,
    }, { headers: noStore });
  }

  return fail(400, "INVALID_ACTION");
}
