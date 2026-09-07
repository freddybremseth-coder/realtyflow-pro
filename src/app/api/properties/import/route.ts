import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";
import { extractRedspEditorialSourceRows } from "@/lib/realty/redsp-source-parser";

export const maxDuration = 60;

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
