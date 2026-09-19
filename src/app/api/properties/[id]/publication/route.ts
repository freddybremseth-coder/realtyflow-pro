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

  const { data: previousVisibilityRows } = await supabase
    .from("property_brand_visibility")
    .select("brand_id, visible")
    .eq("property_id", id)
    .in("brand_id", REALTY_BRANDS);

  const previousVisibility = new Map(
    (previousVisibilityRows || []).map((row) => [String(row.brand_id), row.visible === true]),
  );

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

  const changedBrands = REALTY_BRANDS.filter(
    (brandId) => (previousVisibility.get(brandId) === true) !== visibleBrandIds.has(brandId),
  );
  const indexNow: Array<Record<string, unknown>> = [];

  if (changedBrands.length > 0) {
    const { data: property } = await supabase
      .from("properties")
      .select("id, ref, external_id")
      .eq("id", id)
      .maybeSingle();

    const reference = String(property?.ref || property?.external_id || property?.id || id);

    for (const brandId of changedBrands) {
      const { data: settingsRow } = await supabase
        .from("brand_settings")
        .select("settings")
        .eq("brand_id", brandId)
        .maybeSingle();

      const settings = (settingsRow?.settings || {}) as Record<string, unknown>;
      const fallbackWebsite =
        brandId === "zeneco"
          ? "https://www.zenecohomes.com"
          : "https://www.pinosoecolife.com";
      const config = resolveWebsiteCmsConfig(brandId, settings, fallbackWebsite);
      const websiteBase = fallbackWebsite;
      const propertyUrl = `${websiteBase}/eiendommer/${encodeURIComponent(reference)}`;
      const endpoint = `${websiteBase}/api/indexnow`;

      if (!config.webhookSecret) {
        indexNow.push({
          brandId,
          ok: false,
          skipped: true,
          reason: "Website CMS secret is not configured",
          propertyUrl,
        });
        continue;
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RealtyFlow-Secret": config.webhookSecret,
            Authorization: `Bearer ${config.webhookSecret}`,
          },
          body: JSON.stringify({ url: propertyUrl }),
        });
        const result = await response.json().catch(() => ({}));
        indexNow.push({
          brandId,
          ok: response.ok,
          status: response.status,
          propertyUrl,
          result,
        });
      } catch (notifyError) {
        indexNow.push({
          brandId,
          ok: false,
          status: 0,
          propertyUrl,
          error: notifyError instanceof Error ? notifyError.message : "IndexNow notification failed",
        });
      }
    }
  }

  return NextResponse.json({
    propertyId: id,
    visibleBrandIds: (data || []).filter((row) => row.visible).map((row) => row.brand_id),
    rows: data || [],
    indexNow,
  });
}
