export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";
import { extractRedspEditorialSourceRows } from "@/lib/realty/redsp-source-parser";

export const maxDuration = 180;

const MAX_SOURCES_PER_RUN = 5;
const SOURCE_FACT_BATCH_SIZE = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface SourceDiagnostics {
  content_type: string | null;
  response_bytes: number;
  first_tags: string[];
  has_property_tag: boolean;
  has_ref_tag: boolean;
  has_desc_tag: boolean;
  has_root_tag: boolean;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inspectXmlStructure(xmlText: string, contentType: string | null): SourceDiagnostics {
  const tags: string[] = [];
  const tagRegex = /<\s*([A-Za-z_][\w:.-]*)(?:\s|>|\/)/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xmlText)) && tags.length < 12) {
    const name = match[1].toLowerCase();
    if (!tags.includes(name)) tags.push(name);
  }

  return {
    content_type: contentType?.slice(0, 160) || null,
    response_bytes: Buffer.byteLength(xmlText, "utf8"),
    first_tags: tags,
    has_property_tag: /<\s*property(?:\s|>)/i.test(xmlText),
    has_ref_tag: /<\s*ref(?:\s|>)/i.test(xmlText),
    has_desc_tag: /<\s*(?:desc|description)(?:\s|>)/i.test(xmlText),
    has_root_tag: /<\s*(?:root|properties|propertylist|property_list|listings|inmuebles|inmueble)(?:\s|>)/i.test(xmlText),
  };
}

async function cacheSourceRows(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  rows: ReturnType<typeof extractRedspEditorialSourceRows>,
  fetchedAt: Date,
) {
  const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_MS).toISOString();
  for (let index = 0; index < rows.length; index += SOURCE_FACT_BATCH_SIZE) {
    const batch = rows.slice(index, index + SOURCE_FACT_BATCH_SIZE).map((row) => ({
      ...row,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt,
    }));
    const { error } = await supabase
      .from("property_feed_source_cache")
      .upsert(batch, { onConflict: "ref" });
    if (error) throw error;
  }
}

async function applySourceRows(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  rows: ReturnType<typeof extractRedspEditorialSourceRows>,
) {
  let updated = 0;
  for (let index = 0; index < rows.length; index += SOURCE_FACT_BATCH_SIZE) {
    const batch = rows.slice(index, index + SOURCE_FACT_BATCH_SIZE);
    const { data, error } = await supabase.rpc("apply_property_feed_source_facts", {
      p_rows: batch,
    });
    if (error) throw error;
    updated += Number(data || 0);
  }
  return updated;
}

async function recordSourceResult(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  source: Record<string, unknown>,
  result: { parsed?: number; updated?: number; error?: string; diagnostics?: SourceDiagnostics },
) {
  const now = new Date().toISOString();
  const existingConfig = configObject(source.mapping_config);
  const mappingConfig = {
    ...existingConfig,
    source_format: existingConfig.source_format || "redsp",
    editorial_source_cache: true,
    source_facts_refreshed_at: now,
    source_facts_parsed: result.parsed ?? 0,
    source_facts_updated: result.updated ?? 0,
    source_facts_last_error: result.error ? result.error.slice(0, 1000) : null,
    source_facts_diagnostics: result.diagnostics || existingConfig.source_facts_diagnostics || null,
  };

  await supabase
    .from("import_sources")
    .update({ mapping_config: mappingConfig, updated_at: now })
    .eq("id", String(source.id));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: sources, error: sourcesError } = await supabase
    .from("import_sources")
    .select("id,brand_id,name,type,url,mapping_config,updated_at")
    .eq("active", true)
    .eq("type", "xml_url")
    .not("url", "is", null)
    .order("updated_at", { ascending: true })
    .limit(MAX_SOURCES_PER_RUN);

  if (sourcesError) {
    return NextResponse.json({ error: sourcesError.message }, { status: 500 });
  }

  const results: Array<{
    id: string;
    brand_id: string;
    parsed: number;
    updated: number;
    status: "success" | "failed";
    error?: string;
  }> = [];

  for (const source of sources || []) {
    const id = String(source.id);
    const brandId = String(source.brand_id || "");
    let diagnostics: SourceDiagnostics | undefined;
    try {
      const validatedUrl = String(await validatePublicWebsiteUrl(String(source.url)));
      const response = await fetch(validatedUrl, {
        headers: {
          Accept: "application/xml, text/xml, */*",
          "User-Agent": "RealtyFlow-Pro/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const xmlText = await response.text();
      diagnostics = inspectXmlStructure(xmlText, response.headers.get("content-type"));
      const rows = extractRedspEditorialSourceRows(xmlText);
      if (rows.length === 0) throw new Error("No property source rows found in XML feed");

      const fetchedAt = new Date();
      await cacheSourceRows(supabase, rows, fetchedAt);
      const updated = await applySourceRows(supabase, rows);
      await recordSourceResult(supabase, source, { parsed: rows.length, updated, diagnostics });
      results.push({ id, brand_id: brandId, parsed: rows.length, updated, status: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordSourceResult(supabase, source, { error: message, diagnostics });
      results.push({ id, brand_id: brandId, parsed: 0, updated: 0, status: "failed", error: message.slice(0, 1000) });
    }
  }

  return NextResponse.json({
    success: results.every((result) => result.status === "success"),
    sources: results.length,
    parsed: results.reduce((sum, result) => sum + result.parsed, 0),
    updated: results.reduce((sum, result) => sum + result.updated, 0),
    results,
  });
}
