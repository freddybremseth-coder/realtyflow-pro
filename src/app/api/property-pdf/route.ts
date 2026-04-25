/**
 * GET  /api/property-pdf?propertyId=xxx&brandId=zeneco&download=1
 * POST /api/property-pdf  { propertyId, brandId?, agent?, areaBlurb? }
 *
 * Renders a styled A4 prospect for a property and returns it as
 * application/pdf. The payload is fetched from Supabase:
 *   - properties row    → property facts, gallery, floorplans
 *   - brand_settings    → JSONB blob with brand display info + agent_*
 *
 * Brand logo: prefers an explicit URL; otherwise falls back to
 *   /public/brand-logos/<brandId>.{png,jpg} served from the same origin.
 *
 * Caller can override agent fields via POST body — useful when a
 * different agent (not the brand default) sends the prospect.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs/promises";
import {
  renderPropertyProspect,
  type PdfPropertyInput,
  type PdfBrandInput,
  type PdfAgentInput,
  type PdfAreaProfile,
} from "@/services/pdf/property-prospect";
import { findAreaProfileForLocation } from "@/services/pdf/area-lookup";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Resolve a brand logo URL: explicit override → /public/brand-logos/<id>.{png,jpg} → none. */
async function resolveBrandLogo(
  req: NextRequest,
  brandId: string | undefined,
  override: string | undefined,
): Promise<string | undefined> {
  if (override) return override;
  if (!brandId) return undefined;

  const candidates = [`${brandId}.png`, `${brandId}.jpg`];
  const dir = path.join(process.cwd(), "public", "brand-logos");
  for (const name of candidates) {
    try {
      await fs.access(path.join(dir, name));
      // Build absolute URL so @react-pdf can fetch it (fonts/images run via http)
      const origin = req.nextUrl.origin;
      return `${origin}/brand-logos/${name}`;
    } catch {
      // not present, try next
    }
  }
  return undefined;
}

/** Pull the brand_settings JSONB row for a brand. */
async function fetchBrandSettings(
  // Loose type — newer @supabase/supabase-js generics differ between the
  // unbound `createClient` signature and a runtime-narrowed return, so we
  // accept the runtime client and trust the schema-less JSONB column.
  supabase: ReturnType<typeof createClient> | unknown,
  brandId: string | undefined,
): Promise<{ brand: PdfBrandInput; agent: PdfAgentInput }> {
  if (!brandId) return { brand: {}, agent: {} };

  const sb = supabase as ReturnType<typeof createClient>;
  const { data } = await sb
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  const row = data as { settings?: Record<string, unknown> } | null;
  const s = (row?.settings as Record<string, unknown>) || {};
  const pickStr = (k: string): string | undefined => {
    const v = s[k];
    return typeof v === "string" && v.trim() ? v : undefined;
  };

  return {
    brand: {
      brand_id: brandId,
      custom_name: pickStr("custom_name"),
      display_name: pickStr("display_name"),
      logo_url: pickStr("logo_url"),
      primary_color: pickStr("primary_color"),
      website: pickStr("website"),
      contact_email: pickStr("contact_email"),
      contact_phone: pickStr("contact_phone"),
      area_blurb: pickStr("area_blurb"),
    },
    agent: {
      agent_name: pickStr("agent_name"),
      agent_title: pickStr("agent_title"),
      agent_photo_url: pickStr("agent_photo_url"),
      agent_email: pickStr("agent_email"),
      agent_phone: pickStr("agent_phone"),
      agent_bio: pickStr("agent_bio"),
    },
  };
}

async function buildPdfResponse(
  req: NextRequest,
  propertyId: string,
  brandId: string | undefined,
  agentOverride: PdfAgentInput | undefined,
  areaBlurbOverride: string | undefined,
  download: boolean,
) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // 1. Property row
  const { data: propertyRow, error: propErr } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();

  if (propErr) return NextResponse.json({ error: propErr.message }, { status: 500 });
  if (!propertyRow) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // 2. Brand settings (logo url, name, agent profile)
  const { brand, agent } = await fetchBrandSettings(supabase, brandId);
  if (areaBlurbOverride) brand.area_blurb = areaBlurbOverride;

  // POST body can override agent fields field-by-field
  const mergedAgent: PdfAgentInput = { ...agent, ...(agentOverride || {}) };

  // 3. Brand logo URL — explicit settings url, else /public file
  const brandLogoUrl = await resolveBrandLogo(req, brandId, brand.logo_url);

  // 4. Area profile — fuzzy match against any of the brand's saved profiles
  //    so "Calpe, Costa Blanca" still resolves to the "Calpe" profile.
  let areaProfile: PdfAreaProfile | undefined;
  if (brandId && (propertyRow as { location?: string }).location) {
    const sb = supabase as ReturnType<typeof createClient>;
    const match = await findAreaProfileForLocation(
      sb,
      brandId,
      (propertyRow as { location?: string }).location || "",
    );
    if (match) areaProfile = match;
  }

  // 5. Render
  const pdfBuffer = await renderPropertyProspect({
    property: propertyRow as PdfPropertyInput,
    brand,
    agent: mergedAgent,
    brandLogoUrl,
    areaProfile,
  });

  // 5. Filename: <ref or id>-prospekt.pdf
  const refOrId = (propertyRow as { ref?: string; id?: string }).ref || propertyRow.id || "prospekt";
  const safeName = String(refOrId).replace(/[^A-Za-z0-9_-]+/g, "_");
  const filename = `${safeName}-prospekt.pdf`;
  const disposition = download ? "attachment" : "inline";

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const propertyId = searchParams.get("propertyId") || searchParams.get("id");
  const brandId = searchParams.get("brandId") || undefined;
  const download = searchParams.get("download") === "1";

  if (!propertyId) {
    return NextResponse.json({ error: "propertyId required" }, { status: 400 });
  }

  try {
    return await buildPdfResponse(req, propertyId, brandId, undefined, undefined, download);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    propertyId?: string;
    id?: string;
    brandId?: string;
    agent?: PdfAgentInput;
    areaBlurb?: string;
    download?: boolean;
  };
  const propertyId = body.propertyId || body.id;
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId required" }, { status: 400 });
  }

  try {
    return await buildPdfResponse(
      req,
      propertyId,
      body.brandId,
      body.agent,
      body.areaBlurb,
      Boolean(body.download),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
