import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { BRANDS } from "@/lib/constants";
import { resolveWebsiteCmsConfig } from "@/lib/website-cms";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type BrandTarget = {
  id: string;
  name: string;
  website: string;
  webhookConfigured: boolean;
  publishingMode: "direct" | "queue";
  defaultDestinationId: string;
  destinations: ReturnType<typeof resolveWebsiteCmsConfig>["destinations"];
};

function settingsMapFromRows(rows: Array<{ brand_id: string; settings: Record<string, unknown> | null }> | null) {
  const settings: Record<string, Record<string, unknown>> = {};
  for (const row of rows || []) {
    settings[row.brand_id] = row.settings || {};
  }
  return settings;
}

function buildTargets(settings: Record<string, Record<string, unknown>>) {
  const targets: BrandTarget[] = BRANDS.map((brand) => {
    const config = resolveWebsiteCmsConfig(brand.id, settings[brand.id], brand.website);
    return {
      id: brand.id,
      name: config.brandName,
      website: config.website,
      webhookConfigured: Boolean(config.webhookUrl),
      publishingMode: config.webhookUrl ? "direct" : "queue",
      defaultDestinationId: config.defaultDestinationId,
      destinations: config.destinations,
    };
  });

  const knownIds = new Set(targets.map((target) => target.id));
  for (const [brandId, value] of Object.entries(settings)) {
    if (knownIds.has(brandId) || value.deleted || !value.is_custom_brand) continue;
    const config = resolveWebsiteCmsConfig(brandId, value, String(value.website || ""));
    targets.push({
      id: brandId,
      name: config.brandName,
      website: config.website,
      webhookConfigured: Boolean(config.webhookUrl),
      publishingMode: config.webhookUrl ? "direct" : "queue",
      defaultDestinationId: config.defaultDestinationId,
      destinations: config.destinations,
    });
  }

  return targets;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { targets: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  const requestedBrandId = request.nextUrl.searchParams.get("brand_id");

  if (!supabase) {
    const settings: Record<string, Record<string, unknown>> = {};
    const targets = buildTargets(settings).filter((target) => !requestedBrandId || target.id === requestedBrandId);
    return NextResponse.json({
      targets,
      warning: "Supabase er ikke konfigurert, så kun standard CMS-mål vises.",
    });
  }

  const { data, error } = await supabase.from("brand_settings").select("brand_id, settings");
  if (error) return NextResponse.json({ error: error.message, targets: [] }, { status: 500 });

  const settings = settingsMapFromRows(data as Array<{ brand_id: string; settings: Record<string, unknown> | null }>);
  const targets = buildTargets(settings).filter((target) => !requestedBrandId || target.id === requestedBrandId);
  return NextResponse.json({ targets });
}
