/**
 * POST /api/property-pdf/multi
 *
 * Render a curated multi-property prospect as a single PDF. Used by the
 * Content Hub flow where the agent picks several properties matching a
 * customer's criteria and emails or downloads them as one document.
 *
 * Body:
 *   propertyIds : string[]                          required
 *   brandId     : string                            required (logo + agent profile)
 *   headline?   : string                            cover headline ("For familien Hansen")
 *   intro?      : string                            cover intro paragraph
 *   download?   : boolean                           inline (false, default) or attachment
 *
 * Returns: PDF stream (Content-Type application/pdf) on success;
 *          { error } on failure.
 *
 * For the email-with-attachment variant, see /api/property-pdf/multi/send.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs/promises";
import { requireAdminApi } from "@/lib/api-admin";
import {
  renderMultiPropertyProspect,
  type PdfPropertyInput,
  type PdfBrandInput,
  type PdfAgentInput,
} from "@/services/pdf/property-prospect";
import { findAreaProfilesForLocations } from "@/services/pdf/area-lookup";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function pickStr(s: Record<string, unknown>, k: string): string | undefined {
  const v = s[k];
  return typeof v === "string" && v.trim() ? v : undefined;
}

async function resolveBrandLogoUrl(
  origin: string,
  brandId: string,
  override: string | undefined,
): Promise<string | undefined> {
  if (override) return override;
  const dir = path.join(process.cwd(), "public", "brand-logos");
  for (const ext of ["png", "jpg"] as const) {
    try {
      await fs.access(path.join(dir, `${brandId}.${ext}`));
      return `${origin}/brand-logos/${brandId}.${ext}`;
    } catch {
      // try next
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as {
      propertyIds?: string[];
      brandId?: string;
      headline?: string;
      intro?: string;
      download?: boolean;
    };

    const propertyIds = (body.propertyIds || []).filter(Boolean);
    const brandId = body.brandId;
    if (propertyIds.length === 0 || !brandId) {
      return NextResponse.json(
        { error: "propertyIds (non-empty) and brandId are required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    // 1. Properties — pull all in one query, preserve client-given order
    const { data: rows, error: propErr } = await supabase
      .from("properties")
      .select("*")
      .in("id", propertyIds);
    if (propErr) return NextResponse.json({ error: propErr.message }, { status: 500 });

    const byId = new Map<string, PdfPropertyInput>();
    for (const r of (rows || []) as PdfPropertyInput[]) {
      if (r.id) byId.set(r.id, r);
    }
    const properties = propertyIds
      .map((id) => byId.get(id))
      .filter((p): p is PdfPropertyInput => Boolean(p));

    if (properties.length === 0) {
      return NextResponse.json({ error: "No matching properties found" }, { status: 404 });
    }

    // 2. Brand settings (logo, agent, area_blurb)
    const { data: brandRow } = await supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", brandId)
      .maybeSingle();
    const settings = (brandRow as { settings?: Record<string, unknown> } | null)?.settings || {};

    const brand: PdfBrandInput = {
      brand_id: brandId,
      custom_name: pickStr(settings, "custom_name"),
      display_name: pickStr(settings, "display_name"),
      logo_url: pickStr(settings, "logo_url"),
      website: pickStr(settings, "website"),
      area_blurb: pickStr(settings, "area_blurb"),
    };

    const agent: PdfAgentInput = {
      agent_name: pickStr(settings, "agent_name"),
      agent_title: pickStr(settings, "agent_title"),
      agent_photo_url: pickStr(settings, "agent_photo_url"),
      agent_email: pickStr(settings, "agent_email"),
      agent_phone: pickStr(settings, "agent_phone"),
      agent_bio: pickStr(settings, "agent_bio"),
    };

    const brandLogoUrl = await resolveBrandLogoUrl(req.nextUrl.origin, brandId, brand.logo_url);

    // 3. Area profiles — fuzzy match each property's location string against
    //    the brand's saved profiles. Returns map keyed by slug-of-location
    //    so the renderer can look up per property.
    const areaProfilesBySlug = await findAreaProfilesForLocations(
      supabase,
      brandId,
      properties.map((p) => p.location || null),
    );

    // 4. Render
    const pdfBuffer = await renderMultiPropertyProspect({
      properties,
      brand,
      agent,
      brandLogoUrl,
      headline: body.headline,
      intro: body.intro,
      areaProfilesBySlug,
    });

    const filename = `eiendomsutvalg-${properties.length}-${Date.now()}.pdf`;
    const disposition = body.download ? "attachment" : "inline";

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Multi-PDF render failed";
    console.error("[property-pdf/multi]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
