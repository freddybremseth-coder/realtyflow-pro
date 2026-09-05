import { createClient } from "@supabase/supabase-js";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import {
  recommendedVisualCount,
  selectZenEcoHomesVisuals,
  type MixPropertyLike,
  type RemasterMixRegion,
  type RemasterMixVisualType,
} from "./remaster-mix-planner";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured for ZenEcoHomes mix visuals.");
  return createClient(url, key);
}

function isWebsiteVisible(property: Record<string, unknown>) {
  return property.show_on_website !== false && property.website_visible !== false;
}

export async function loadZenEcoHomesVisualUrls(input: {
  targetMinutes: number;
  region: RemasterMixRegion;
  visualType: RemasterMixVisualType;
}) {
  const supabase = getSupabase();
  const desiredCount = recommendedVisualCount(input.targetMinutes);

  // Use select("*") intentionally. The property feed has evolved over time and
  // different production snapshots can contain additional multilingual and
  // visibility fields. Selecting a non-existent optional column would make the
  // entire PostgREST request fail, while the planner only reads fields present.
  const allProperties: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let from = 0; from < 3000; from += pageSize) {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load ZenEcoHomes properties: ${error.message}`);
    if (!data || data.length === 0) break;
    allProperties.push(...data);
    if (data.length < pageSize) break;
  }

  const zenEcoProperties = allProperties.filter((property) =>
    isWebsiteVisible(property) && propertyMatchesBrand(property, "zeneco"),
  ) as MixPropertyLike[];

  let urls = selectZenEcoHomesVisuals(zenEcoProperties, {
    region: input.region,
    visualType: input.visualType,
    limit: desiredCount,
  });

  // A narrow visual filter can legitimately have fewer images than the target.
  // Fill the remainder from the same region before widening to all ZenEcoHomes.
  if (urls.length < desiredCount && input.visualType !== "mixed") {
    const fallback = selectZenEcoHomesVisuals(zenEcoProperties, {
      region: input.region,
      visualType: "mixed",
      limit: desiredCount,
    });
    urls = [...new Set([...urls, ...fallback])].slice(0, desiredCount);
  }

  if (urls.length < desiredCount && input.region !== "any") {
    const fallback = selectZenEcoHomesVisuals(zenEcoProperties, {
      region: "any",
      visualType: "mixed",
      limit: desiredCount,
    });
    urls = [...new Set([...urls, ...fallback])].slice(0, desiredCount);
  }

  if (urls.length < 12) {
    throw new Error(`ZenEcoHomes visual source returned only ${urls.length} usable images; at least 12 are required.`);
  }

  return {
    urls,
    propertyCount: zenEcoProperties.length,
    requestedVisualCount: desiredCount,
  };
}
