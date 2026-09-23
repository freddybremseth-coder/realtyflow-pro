import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { REMASTER_SONG_READ_BRANDS } from "@/services/integrations/airtable-client";
import {
  loadPublishedMixArt, loadPublishedMixBooks, selectApprovedPromotionItems, type PromotionItem,
} from "@/services/pipelines/remaster-mix-promotions";
import { diagnoseExplicitMixSelection, describeMixSelectionIssue } from "@/services/pipelines/remaster-mix-selection-validation";
import { loadZenEcoHomesVisualUrls } from "@/services/pipelines/remaster-mix-visual-source";
import {
  renderPortfolioReel, type ReelBrand, type ReelSong,
} from "@/services/pipelines/remaster-portfolio-reels";

export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=300;

const region=z.enum(["any","north","south","inland","costa-calida"]);
const visual=z.enum(["mixed","villas","apartments","pools","sea-views","interiors"]);
const bodySchema=z.object({
  title:z.string().trim().min(3).max(100),
  brand:z.enum(["art","books","zeneco"]),
  durationSeconds:z.union([z.literal(15),z.literal(20),z.literal(30),z.literal(45),z.literal(60)]),
  songId:z.string().uuid(),
  channels:z.array(z.enum(["instagram","facebook"])).min(1).max(2).default(["instagram","facebook"]),
  artStyles:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  artCollections:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  artIds:z.array(z.string().trim().min(1).max(130)).max(30).default([]),
  bookSeries:z.array(z.string().trim().min(1).max(100)).max(40).default([]),
  bookLanguages:z.array(z.string().trim().min(1).max(12)).max(12).default([]),
  bookIds:z.array(z.string().uuid()).max(30).default([]),
  region:region.default("any"),
  areaQuery:z.string().trim().max(80).default(""),
  visualTypes:z.array(visual).min(1).max(6).default(["mixed"]),
}).strict();

function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function visualCount(seconds:number){return seconds<=20?3:seconds<=30?4:seconds<=45?5:6;}

export async function GET(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const supabase=db();if(!supabase)return NextResponse.json({error:"Supabase not configured"},{status:503});
  const {data,error}=await supabase.from("remaster_reel_jobs").select("*")
    .order("created_at",{ascending:false}).limit(30);
  if(error)return NextResponse.json({error:error.message,code:"REEL_SCHEMA_NOT_READY"},{status:503});
  return NextResponse.json({reels:data||[]},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const context=await getRequestAccessContext(request);
  if(!context)return NextResponse.json({error:"Admin session required"},{status:401});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Ugyldig Reel-oppsett",issues:parsed.error.issues},{status:400});
  const input=parsed.data,supabase=db();
  if(!supabase)return NextResponse.json({error:"Supabase not configured"},{status:503});

  const {data:songRow,error:songError}=await supabase.from("songs")
    .select("id,name,file_url,youtube_url,brand").eq("id",input.songId)
    .in("brand",[...REMASTER_SONG_READ_BRANDS]).maybeSingle();
  if(songError||!songRow)return NextResponse.json({error:"Valgt Re-Master-sang ble ikke funnet."},{status:400});
  if(!songRow.file_url)return NextResponse.json({error:"Valgt sang mangler permanent lydfil."},{status:400});
  const song:ReelSong={id:String(songRow.id),title:String(songRow.name||"Re-Master Freddy"),
    audioUrl:String(songRow.file_url),youtubeUrl:songRow.youtube_url?String(songRow.youtube_url):null};

  const seed=crypto.randomUUID(),count=visualCount(input.durationSeconds);
  let promotedItems:PromotionItem[]=[];
  let imageUrls:string[]=[];
  try{
    if(input.brand==="art"||input.brand==="books"){
      const catalog=input.brand==="art"?await loadPublishedMixArt():await loadPublishedMixBooks();
      const selection={
        brand:input.brand,randomSeed:seed,
        artStyles:input.artStyles,artCollections:input.artCollections,artIds:input.artIds,
        bookSeries:input.bookSeries,bookLanguages:input.bookLanguages,bookIds:input.bookIds,
      };
      const issues=diagnoseExplicitMixSelection(catalog,selection);
      if(issues.length)return NextResponse.json({
        code:"REEL_PROMOTION_SELECTION_INVALID",
        error:"Rett bildeutvalget før Reel lages: "+issues.slice(0,5).map(describeMixSelectionIssue).join(" "),
        issues,
      },{status:400});
      const selected=selectApprovedPromotionItems(catalog,selection,count*2);
      promotedItems=[...new Map(selected.map(item=>[item.id,item])).values()].slice(0,count);
      if(promotedItems.length<2)return NextResponse.json({
        error:"Velg minst to publiserte "+(input.brand==="art"?"kunstverk":"bokomslag")+" som passer filtrene.",
        code:"REEL_NOT_ENOUGH_VISUALS",
      },{status:400});
      imageUrls=promotedItems.map(item=>item.imageUrl);
    }else{
      const result=await loadZenEcoHomesVisualUrls({
        targetMinutes:Math.max(1,input.durationSeconds/60),
        region:input.region,visualType:input.visualTypes[0]||"mixed",
        visualTypes:input.visualTypes,randomSeed:seed,strictSelection:true,
        areaQuery:input.areaQuery||undefined,
      });
      imageUrls=[...new Set(result.urls)].slice(0,count);
      if(imageUrls.length<2)return NextResponse.json({
        error:"Fant ikke nok boligbilder i valgt område/type. Velg et bredere område eller flere bildetyper.",
        code:"REEL_NOT_ENOUGH_PROPERTY_VISUALS",
      },{status:400});
    }
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Kunne ikke hente Reel-bilder."},{status:400});
  }

  const selection={
    seed,brand:input.brand,channels:input.channels,region:input.region,areaQuery:input.areaQuery,
    visualTypes:input.visualTypes,
    artStyles:input.artStyles,artCollections:input.artCollections,artIds:input.artIds,
    bookSeries:input.bookSeries,bookLanguages:input.bookLanguages,bookIds:input.bookIds,
    promotedItems:promotedItems.map(item=>({id:item.id,title:item.title,detailUrl:item.detailUrl})),
  };
  const {data:created,error:createError}=await supabase.from("remaster_reel_jobs").insert({
    brand:input.brand,title:input.title,duration_seconds:input.durationSeconds,
    song_id:song.id,song_title:song.title,channels:input.channels,selection,
    state:"rendering",created_by:context.email,
  }).select("*").single();
  if(createError||!created)return NextResponse.json({
    error:createError?.message||"Kunne ikke opprette Reel-jobb.",code:"REEL_SCHEMA_NOT_READY",
  },{status:503});

  try{
    const rendered=await renderPortfolioReel({
      brand:input.brand as ReelBrand,title:input.title,durationSeconds:input.durationSeconds,
      song,imageUrls,promotedItems,region:input.region,areaQuery:input.areaQuery,
      visualTypes:input.visualTypes,
    });
    const objectPath=String(created.id)+".mp4";
    const {error:uploadError}=await supabase.storage.from("remaster-reels").upload(objectPath,rendered.buffer,{
      contentType:"video/mp4",cacheControl:"3600",upsert:false,
    });
    if(uploadError)throw new Error("REEL_STORAGE_FAILED: "+uploadError.message);
    const publicUrl=supabase.storage.from("remaster-reels").getPublicUrl(objectPath).data.publicUrl;
    const {data:ready,error:readyError}=await supabase.from("remaster_reel_jobs").update({
      state:"ready",video_path:objectPath,caption:rendered.caption,error:null,updated_at:new Date().toISOString(),
      selection:{...selection,visualCount:rendered.visualCount,publicUrl},
    }).eq("id",created.id).select("*").single();
    if(readyError)throw new Error("REEL_JOB_SAVE_FAILED: "+readyError.message);
    return NextResponse.json({success:true,reel:ready,publicUrl},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"Reel-rendering feilet.";
    await supabase.from("remaster_reel_jobs").update({
      state:"failed",error:message.slice(0,700),updated_at:new Date().toISOString(),
    }).eq("id",created.id);
    return NextResponse.json({success:false,id:created.id,error:message},{status:500});
  }
}
