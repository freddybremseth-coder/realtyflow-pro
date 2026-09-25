import { REMASTER_SONG_READ_BRANDS } from "@/services/integrations/airtable-client";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
import { generateAutopilotInstagramImage } from "@/services/marketing/autopilot-media";
import { loadAutopilotSignalGuidance } from "@/services/marketing/autopilot-signal-guidance";
import {
  loadPublishedMixArt,
  loadPublishedMixBooks,
  selectApprovedPromotionItems,
  type PromotionItem,
} from "./remaster-mix-promotions";
import {
  DONA_ANNA_REEL_IMAGES,
  loadPinosoReelVisuals,
  selectedReelImages,
} from "./remaster-reels-extra-brands";
import { loadZenEcoHomesVisualUrls } from "./remaster-mix-visual-source";
import {
  renderPortfolioReel,
  type ReelBrand,
  type ReelSong,
} from "./remaster-portfolio-reels";

export type AutonomousGrowthBrandId =
  | "zeneco"
  | "pinosoecolife"
  | "donaanna"
  | "freddyart"
  | "freddypublishing"
  | "chatgenius"
  | "freddyai"
  | "remasterfreddy";

export type AutonomousReelDefinition = {
  growthBrandId: AutonomousGrowthBrandId;
  reelBrand: Exclude<ReelBrand, "freddybremseth">;
  title: string;
};

export const AUTONOMOUS_REEL_BRANDS: readonly AutonomousReelDefinition[] = [
  { growthBrandId: "zeneco", reelBrand: "zeneco", title: "Zen Eco Homes | Costa Blanca inspiration" },
  { growthBrandId: "pinosoecolife", reelBrand: "pinosoecolife", title: "Pinoso EcoLife | Inland living" },
  { growthBrandId: "donaanna", reelBrand: "donaanna", title: "Doña Anna | Mediterranean olive life" },
  { growthBrandId: "freddyart", reelBrand: "art", title: "Freddy Bremseth Art | Art Lounge" },
  { growthBrandId: "freddypublishing", reelBrand: "books", title: "Freddy Publishing | Books and ideas" },
  { growthBrandId: "chatgenius", reelBrand: "chatgenius", title: "ChatGenius.pro | Practical AI" },
  { growthBrandId: "freddyai", reelBrand: "freddyai", title: "Freddy AI | Automation in practice" },
  { growthBrandId: "remasterfreddy", reelBrand: "remasterfreddy", title: "Re-Master Freddy | Original music" },
] as const;

type SupabaseLike = any;

function hash(value:string){
  let h=2166136261;
  for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}

function visualCount(seconds:15|20|30|45|60){return seconds<=20?3:seconds<=30?4:seconds<=45?5:6;}

function learnedDuration(signalEvidence: {youtube: Record<string,unknown>|null}):15|20|30|45 {
  const raw=signalEvidence.youtube?.averageViewPercentage;
  const pct=Number(raw);
  if(!Number.isFinite(pct)) return 30;
  if(pct<35) return 20;
  if(pct>=60) return 45;
  return 30;
}

async function activeDestinations(supabase:SupabaseLike,brandId:string){
  const {data,error}=await supabase.from("social_channels")
    .select("id,platform,display_name,is_active")
    .eq("brand_id",brandId).eq("is_active",true)
    .in("platform",["instagram","facebook","youtube"]);
  if(error) throw new Error("REEL_CHANNEL_LOOKUP_FAILED: "+error.message);
  return (data||[]).map((row:any)=>({
    channelId:String(row.id),
    platform:String(row.platform) as "instagram"|"facebook"|"youtube",
    displayName:String(row.display_name||""),
  }));
}

async function chooseSong(supabase:SupabaseLike,seed:string,reelBrand:string):Promise<ReelSong>{
  const since=new Date(Date.now()-14*86400000).toISOString();
  const [{data:songs,error:songError},{data:recent,error:recentError}]=await Promise.all([
    supabase.from("songs").select("id,name,file_url,youtube_url,brand,created_at")
      .in("brand",[...REMASTER_SONG_READ_BRANDS]).not("file_url","is",null)
      .order("created_at",{ascending:false}).limit(80),
    supabase.from("remaster_reel_jobs").select("song_id").eq("brand",reelBrand)
      .gte("created_at",since).limit(50),
  ]);
  if(songError) throw new Error("REEL_SONG_LOOKUP_FAILED: "+songError.message);
  if(recentError) throw new Error("REEL_RECENT_SONG_LOOKUP_FAILED: "+recentError.message);
  const used=new Set((recent||[]).map((row:any)=>String(row.song_id||"")).filter(Boolean));
  const valid=(songs||[]).filter((row:any)=>row.id&&row.file_url);
  const fresh=valid.filter((row:any)=>!used.has(String(row.id)));
  const pool=fresh.length?fresh:valid;
  if(!pool.length) throw new Error("REEL_NO_REMASTER_AUDIO");
  const ordered=[...pool].sort((a:any,b:any)=>hash(seed+String(a.id))-hash(seed+String(b.id)));
  const row=ordered[0];
  return {
    id:String(row.id),
    title:String(row.name||"Re-Master Freddy"),
    audioUrl:String(row.file_url),
    youtubeUrl:row.youtube_url?String(row.youtube_url):null,
  };
}

async function generatedVisuals(
  supabase:SupabaseLike,
  definition:AutonomousReelDefinition,
  seed:string,
  count:number,
  theme:string,
){
  const context=await loadBrandContext(supabase,definition.growthBrandId).catch(()=>null);
  const urls:string[]=[];
  for(let index=0;index<count;index++){
    const media=await generateAutopilotInstagramImage(supabase,{
      brandId:definition.growthBrandId,
      contentKey:`reel:${seed}:${index}`,
      theme:`${theme} Visual variant ${index+1}; vertical social-video still; no invented claims or third-party logos.`,
      audience:context?.audience,
      visualDirection:context?.visualDirection,
    });
    if(media.imageUrl) urls.push(media.imageUrl);
  }
  return [...new Set(urls)];
}

async function visualSelection(
  supabase:SupabaseLike,
  definition:AutonomousReelDefinition,
  seed:string,
  count:number,
  guidance:string,
):Promise<{imageUrls:string[];promotedItems:PromotionItem[]}>{
  const brand=definition.reelBrand;
  if(brand==="art"||brand==="books"){
    const catalog=brand==="art"?await loadPublishedMixArt():await loadPublishedMixBooks();
    const selected=selectApprovedPromotionItems(catalog,{
      brand,randomSeed:seed,
      artStyles:[],artCollections:[],artIds:[],
      bookSeries:[],bookLanguages:[],bookIds:[],
    },count*2);
    const promotedItems=[...new Map(selected.map(item=>[item.id,item])).values()].slice(0,count);
    return {imageUrls:promotedItems.map(item=>item.imageUrl),promotedItems};
  }
  if(brand==="donaanna"){
    return {imageUrls:selectedReelImages(DONA_ANNA_REEL_IMAGES,seed,count),promotedItems:[]};
  }
  if(brand==="pinosoecolife"){
    return {
      imageUrls:await loadPinosoReelVisuals({
        seed,count,region:"inland",areaQuery:"",visualTypes:["mixed"],
      }),
      promotedItems:[],
    };
  }
  if(brand==="zeneco"){
    const result=await loadZenEcoHomesVisualUrls({
      targetMinutes:1,region:"north",visualType:"mixed",visualTypes:["mixed"],
      randomSeed:seed,strictSelection:false,
    });
    return {imageUrls:[...new Set(result.urls)].slice(0,count),promotedItems:[]};
  }
  return {
    imageUrls:await generatedVisuals(
      supabase,definition,seed,count,
      definition.title+guidance,
    ),
    promotedItems:[],
  };
}

export async function createAutonomousPortfolioReel(
  supabase:SupabaseLike,
  definition:AutonomousReelDefinition,
  slotKey:string,
){
  if(definition.reelBrand==="freddybremseth") throw new Error("FREDDY_PERSONAL_AUTOPILOT_FORBIDDEN");
  const destinations=await activeDestinations(supabase,definition.growthBrandId);
  if(!destinations.length) return {skipped:true,reason:"no_connected_video_channels"} as const;

  const signals=await loadAutopilotSignalGuidance(supabase,definition.growthBrandId)
    .catch(()=>({text:"",evidence:{seo:null,youtube:null}}));
  const duration=learnedDuration(signals.evidence);
  const count=visualCount(duration);
  const seed=`${slotKey}:${definition.growthBrandId}`;
  const song=await chooseSong(supabase,seed,definition.reelBrand);
  const selected=await visualSelection(supabase,definition,seed,count,signals.text);
  if(selected.imageUrls.length<2) throw new Error("REEL_NOT_ENOUGH_AUTONOMOUS_VISUALS");

  const title=definition.reelBrand==="remasterfreddy"
    ? `${definition.title} | ${song.title}`
    : definition.title;
  const channels=destinations.map(item=>item.platform).filter((value):value is "instagram"|"facebook"=>
    value==="instagram"||value==="facebook");

  const selection={
    autopilot:true,
    slotKey,
    seed,
    growthBrandId:definition.growthBrandId,
    reelBrand:definition.reelBrand,
    destinations,
    signalEvidence:signals.evidence,
    learnedDurationSeconds:duration,
    promotedItems:selected.promotedItems.map(item=>({
      id:item.id,title:item.title,detailUrl:item.detailUrl,
    })),
  };
  const {data:created,error:createError}=await supabase.from("remaster_reel_jobs").insert({
    brand:definition.reelBrand,
    title,
    duration_seconds:duration,
    song_id:song.id,
    song_title:song.title,
    channels,
    selection,
    state:"rendering",
    created_by:"portfolio-autopilot",
  }).select("*").single();
  if(createError||!created) throw new Error("REEL_AUTOPILOT_JOB_CREATE_FAILED: "+(createError?.message||"unknown"));

  try{
    const rendered=await renderPortfolioReel({
      brand:definition.reelBrand,
      title,
      durationSeconds:duration,
      song,
      imageUrls:selected.imageUrls,
      promotedItems:selected.promotedItems,
      region:definition.reelBrand==="pinosoecolife"?"inland":definition.reelBrand==="zeneco"?"north":undefined,
      visualTypes:["mixed"],
    });
    const objectPath=String(created.id)+".mp4";
    const {error:uploadError}=await supabase.storage.from("remaster-reels").upload(objectPath,rendered.buffer,{
      contentType:"video/mp4",cacheControl:"3600",upsert:false,
    });
    if(uploadError) throw new Error("REEL_AUTOPILOT_STORAGE_FAILED: "+uploadError.message);
    const publicUrl=supabase.storage.from("remaster-reels").getPublicUrl(objectPath).data.publicUrl;
    const {data:ready,error:readyError}=await supabase.from("remaster_reel_jobs").update({
      state:"ready",
      video_path:objectPath,
      caption:rendered.caption,
      error:null,
      updated_at:new Date().toISOString(),
      selection:{...selection,visualCount:rendered.visualCount,publicUrl},
    }).eq("id",created.id).select("*").single();
    if(readyError) throw new Error("REEL_AUTOPILOT_READY_SAVE_FAILED: "+readyError.message);
    return {skipped:false,reel:ready,publicUrl,destinations,signals:signals.evidence} as const;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await supabase.from("remaster_reel_jobs").update({
      state:"failed",error:message.slice(0,700),updated_at:new Date().toISOString(),
    }).eq("id",created.id);
    throw error;
  }
}
