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


function reelPropertyText(property: Record<string, unknown>) {
  return [property.title,property.title_no,property.location,property.town,property.description,property.description_no,property.property_type,property.type]
    .filter(Boolean).join(" ").toLowerCase();
}
function reelPropertyImages(property: Record<string, unknown>, visualType: RemasterMixVisualType) {
  const gallery = Array.isArray(property.gallery)
    ? property.gallery.filter((value): value is string => typeof value==="string" && /^https:\/\//i.test(value))
    : [];
  const primary = typeof property.primary_image==="string" && /^https:\/\//i.test(property.primary_image)
    ? [property.primary_image] : [];
  return visualType==="interiors"
    ? [...gallery.slice(2),...gallery.slice(0,2),...primary]
    : [...primary,...gallery];
}

/** Manual Reels Studio visual source. Unlike the broad Mix source this can
 * narrow to a concrete town/area typed by the owner (Benidorm, Finestrat,
 * Villajoyosa, etc.). No fallback to another town is allowed.
 */
export async function loadZenEcoHomesReelVisuals(input:{
  region: RemasterMixRegion;
  town?: string | null;
  visualType: RemasterMixVisualType;
  limit: number;
}) {
  const client=getSupabase();
  const rows:Record<string,unknown>[]=[];
  const pageSize=500;
  for(let from=0;from<3000;from+=pageSize){
    const {data,error}=await client.from("properties").select("*")
      .order("created_at",{ascending:false}).range(from,from+pageSize-1);
    if(error)throw new Error("Could not load ZenEcoHomes properties: "+error.message);
    if(!data?.length)break;
    rows.push(...data);
    if(data.length<pageSize)break;
  }
  const town=String(input.town||"").trim().toLowerCase();
  const brandRows=rows.filter(property=>isWebsiteVisible(property)&&propertyMatchesBrand(property,"zeneco"));
  const regionRows=input.region==="any" ? brandRows : brandRows.filter(property=>
    selectZenEcoHomesVisuals([property as MixPropertyLike],{region:input.region,visualType:"mixed",limit:1}).length>0
  );
  const areaRows=town ? regionRows.filter(property=>reelPropertyText(property).includes(town)) : regionRows;
  const typed=areaRows.filter(property=>
    selectZenEcoHomesVisuals([property as MixPropertyLike],{region:"any",visualType:input.visualType,limit:1}).length>0
  );
  if(!typed.length){
    const where=[town||null,input.region!=="any"?input.region:null,input.visualType!=="mixed"?input.visualType:null].filter(Boolean).join(" / ");
    throw new Error("No Zen Eco Homes properties match the selected Reel area/type"+(where?": "+where:"")+".");
  }
  const urls:string[]=[];
  const visualSummaries:Array<{url:string;propertyId:string;title:string;location:string;ref:string;externalUrl:string}>=[];
  const seen=new Set<string>();
  let imageIndex=0;
  const buckets=typed.map(property=>({property,urls:reelPropertyImages(property,input.visualType)})).filter(x=>x.urls.length);
  const cap=Math.max(1,Math.min(12,Math.floor(input.limit||6)));
  while(urls.length<cap&&buckets.length){
    let added=false;
    for(const bucket of buckets){
      const url=bucket.urls[imageIndex];
      if(!url||seen.has(url))continue;
      seen.add(url);urls.push(url);added=true;
      visualSummaries.push({
        url,
        propertyId:String(bucket.property.id||""),
        title:String(bucket.property.title_no||bucket.property.title||bucket.property.ref||"Property"),
        location:String(bucket.property.town||bucket.property.location||""),
        ref:String(bucket.property.ref||""),
        externalUrl:typeof bucket.property.external_url==="string"&&/^https:\/\//i.test(bucket.property.external_url)?bucket.property.external_url:"",
      });
      if(urls.length>=cap)break;
    }
    imageIndex++;
    if(!added&&buckets.every(bucket=>imageIndex>=bucket.urls.length))break;
  }
  if(!urls.length)throw new Error("Selected Zen Eco Homes properties have no usable public images.");
  return {
    urls,
    visualSummaries,
    propertyCount:typed.length,
    propertySummaries:typed.slice(0,6).map(property=>({
      id:String(property.id||""),
      title:String(property.title_no||property.title||property.ref||"Property"),
      location:String(property.town||property.location||""),
      ref:String(property.ref||""),
      externalUrl:typeof property.external_url==="string"&&/^https:\/\//i.test(property.external_url)?property.external_url:"",
    })),
  };
}
