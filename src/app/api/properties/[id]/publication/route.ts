import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { resolveWebsiteCmsConfig } from "@/lib/website-cms";

const REALTY_BRANDS = ["zeneco", "pinosoecolife"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("property_brand_visibility")
    .select("brand_id, visible, manual_override, reason, score")
    .eq("property_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visibleBrandIds = (data || [])
    .filter((row) => row.visible === true)
    .map((row) => row.brand_id as string);

  return NextResponse.json({
    propertyId: id,
    visibleBrandIds,
    rows: data || [],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { id } = await params;
  const body = await request.json();

  const { data: previousPinosoVisibility } = await supabase
    .from("property_brand_visibility")
    .select("visible")
    .eq("property_id", id)
    .eq("brand_id", "pinosoecolife")
    .maybeSingle();

  const visibleBrandIds = new Set(
    (Array.isArray(body.visibleBrandIds) ? (body.visibleBrandIds as unknown[]) : [])
      .filter((value): value is string => typeof value === "string" && REALTY_BRANDS.includes(value)),
  );

  const rows = REALTY_BRANDS.map((brandId) => ({
    property_id: id,
    brand_id: brandId,
    visible: visibleBrandIds.has(brandId),
    reason: visibleBrandIds.has(brandId) ? "manual publish target" : "manual hidden from brand",
    score: visibleBrandIds.has(brandId) ? 100 : 0,
    manual_override: true,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("property_brand_visibility")
    .upsert(rows, { onConflict: "property_id,brand_id" })
    .select("brand_id, visible, manual_override, reason, score");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const wasVisibleOnPinoso = previousPinosoVisibility?.visible === true;
  const isVisibleOnPinoso = visibleBrandIds.has("pinosoecolife");
  let indexNow: Record<string, unknown> | null = null;

  if (wasVisibleOnPinoso !== isVisibleOnPinoso) {
    const [{ data: property }, { data: settingsRow }] = await Promise.all([
      supabase
        .from("properties")
        .select("id, ref, external_id")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("brand_settings")
        .select("settings")
        .eq("brand_id", "pinosoecolife")
        .maybeSingle(),
    ]);

    const settings = (settingsRow?.settings || {}) as Record<string, unknown>;
    const config = resolveWebsiteCmsConfig(
      "pinosoecolife",
      settings,
      "https://www.pinosoecolife.com",
    );
    const reference = String(property?.ref || property?.external_id || property?.id || id);
    const propertyUrl = `https://www.pinosoecolife.com/eiendommer/${encodeURIComponent(reference)}`;

    if (config.webhookSecret) {
      try {
        const response = await fetch("https://www.pinosoecolife.com/api/indexnow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RealtyFlow-Secret": config.webhookSecret,
            Authorization: `Bearer ${config.webhookSecret}`,
          },
          body: JSON.stringify({ url: propertyUrl }),
        });
        const result = await response.json().catch(() => ({}));
        indexNow = {
          ok: response.ok,
          status: response.status,
          propertyUrl,
          result,
        };
      } catch (notifyError) {
        indexNow = {
          ok: false,
          status: 0,
          propertyUrl,
          error: notifyError instanceof Error ? notifyError.message : "IndexNow notification failed",
        };
      }
    } else {
      indexNow = {
        ok: false,
        skipped: true,
        reason: "Pinoso website CMS secret is not configured",
        propertyUrl,
      };
    }
  }

  return NextResponse.json({
    propertyId: id,
    visibleBrandIds: (data || []).filter((row) => row.visible).map((row) => row.brand_id),
    rows: data || [],
    indexNow,
  });
}
