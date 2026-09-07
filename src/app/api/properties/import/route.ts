import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";
import { extractRedspEditorialSourceRows } from "@/lib/realty/redsp-source-parser";

export const maxDuration = 60;

const DEFAULT_PROPERTY_IMPORT_BRAND = "zeneco";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function cacheEditorialSourceFacts(xmlText: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  const rows = extractRedspEditorialSourceRows(xmlText);
  if (rows.length === 0) return;

  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const batchSize = 500;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize).map((row) => ({
      ...row,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt,
    }));
    const { error } = await supabase
      .from("property_feed_source_cache")
      .upsert(batch, { onConflict: "ref" });
    if (error) {
      // The XML proxy must keep working even if the additive cache migration has
      // not reached production yet. Property POST falls back safely without it.
      console.warn("[property-import] source cache skipped:", error.message);
      return;
    }
  }
}

async function registerImportSource(url: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await supabase
    .from("import_sources")
    .select("id,mapping_config")
    .eq("brand_id", DEFAULT_PROPERTY_IMPORT_BRAND)
    .eq("type", "xml_url")
    .eq("url", url)
    .maybeSingle();

  if (lookupError) {
    console.warn("[property-import] source registration lookup skipped:", lookupError.message);
    return;
  }

  const existingConfig = existing?.mapping_config && typeof existing.mapping_config === "object"
    ? existing.mapping_config as Record<string, unknown>
    : {};
  const payload = {
    brand_id: DEFAULT_PROPERTY_IMPORT_BRAND,
    name: "RedSP property XML feed",
    type: "xml_url",
    url,
    active: true,
    last_imported_at: now,
    updated_at: now,
    mapping_config: {
      ...existingConfig,
      source_format: "redsp",
      editorial_source_cache: true,
      registered_by: "property_import",
    },
  };

  const query = existing?.id
    ? supabase.from("import_sources").update(payload).eq("id", existing.id)
    : supabase.from("import_sources").insert(payload);
  const { error } = await query;
  if (error) {
    // Source registration is additive bookkeeping. It must never block the
    // property import itself if an older deployment/schema cannot persist it.
    console.warn("[property-import] source registration skipped:", error.message);
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const rawUrl = new URL(req.url).searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    const url = String(await validatePublicWebsiteUrl(rawUrl));
    const response = await fetch(url, {
      headers: {
        Accept: "application/xml, text/xml, */*",
        "User-Agent": "RealtyFlow-Pro/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    await cacheEditorialSourceFacts(text);
    await registerImportSource(url);

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Feil ved henting av URL" },
      { status: 500 },
    );
  }
}
