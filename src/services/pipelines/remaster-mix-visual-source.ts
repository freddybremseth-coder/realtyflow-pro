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
  visualTypes?: RemasterMixVisualType[];
  randomSeed?: string;
  strictSelection?: boolean;
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

  let urls: string[];
  if (input.strictSelection) {
    const types = input.visualTypes?.length ? input.visualTypes : [input.visualType];
    const chosen = [...new Set(types)];
    urls = [...new Set(chosen.flatMap(visualType => selectZenEcoHomesVisuals(zenEcoProperties,{
      region:input.region,visualType,limit:180,
    })))];
    if (!urls.length) {
      throw new Error('No ZenEcoHomes images match the selected region and image types. Widen the selection explicitly.');
    }
    // Deterministic shuffle/repetition within the approved property-image pool,
    // never silently fall back to other regions/types.
    let seed=2166136261;
    for(const ch of input.randomSeed||'zeneco'){seed^=ch.charCodeAt(0);seed=Math.imul(seed,16777619);}
    const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
    const ordered: string[]=[];
    while(ordered.length<desiredCount) {
      const batch=[...urls];
      for(let i=batch.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[batch[i],batch[j]]=[batch[j],batch[i]];}
      if(ordered.length&&batch.length>1&&ordered[ordered.length-1]===batch[0]) batch.push(batch.shift()!);
      ordered.push(...batch.slice(0,desiredCount-ordered.length));
    }
    urls=ordered;
  } else {
    urls = selectZenEcoHomesVisuals(zenEcoProperties, {
      region: input.region, visualType: input.visualType, limit: desiredCount,
    });
    // Preserve legacy behavior ONLY for old saved ZenEcoHomes mix plans.
    if (urls.length < desiredCount && input.visualType !== "mixed") {
      const fallback = selectZenEcoHomesVisuals(zenEcoProperties, {
        region: input.region, visualType: "mixed", limit: desiredCount,
      });
      urls = [...new Set([...urls, ...fallback])].slice(0, desiredCount);
    }
    if (urls.length < desiredCount && input.region !== "any") {
      const fallback = selectZenEcoHomesVisuals(zenEcoProperties, {
        region: "any", visualType: "mixed", limit: desiredCount,
      });
      urls = [...new Set([...urls, ...fallback])].slice(0, desiredCount);
    }
    if (urls.length < 12) {
      throw new Error(`ZenEcoHomes visual source returned only ${urls.length} usable images; at least 12 are required.`);
    }
  }

  return {
    urls,
    propertyCount: zenEcoProperties.length,
    requestedVisualCount: desiredCount,
  };
}
