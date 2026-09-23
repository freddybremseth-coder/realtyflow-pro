import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getRequestAccessContext,requireAdminApi} from "@/lib/api-admin";
import {REMASTER_SONG_READ_BRANDS} from "@/services/integrations/airtable-client";
import {
  loadPublishedMixArt,loadPublishedMixBooks,selectApprovedPromotionItems,type PromotionItem,
} from "@/services/pipelines/remaster-mix-promotions";
import {diagnoseExplicitMixSelection,describeMixSelectionIssue} from "@/services/pipelines/remaster-mix-selection-validation";
import {loadZenEcoHomesReelVisuals} from "@/services/pipelines/remaster-mix-visual-source";
import {
  buildReelCaption,REMASTER_REEL_BUCKET,renderRemasterReel,type ReelVisual,
} from "@/services/pipelines/remaster-reels";

export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=300;

const region=z.enum(["any","north","south","inland","costa-calida"]);
const visualType=z.enum(["mixed","villas","apartments","pools","sea-views","interiors"]);
const renderSchema=z.object({
  title:z.string().trim().min(3).max(120),
  brand:z.enum(["art","books","zeneco"]),
  durationSeconds:z.union([z.literal(15),z.literal(20),z.literal(30),z.literal(45),z.literal(60)]),
  songId:z.string().trim().min(1).max(200),
  channels:z.array(z.enum(["instagram","facebook"])).min(1).max(2).default(["instagram"]),
  artStyles:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  artCollections:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  artIds:z.array(z.string().trim().min(1).max(130)).max(30).default([]),
  bookSeries:z.array(z.string().trim().min(1).max(100)).max(40).default([]),
  bookLanguages:z.array(z.string().trim().min(1).max(12)).max(12).default([]),
  bookIds:z.array(z.string().trim().min(1).max(130)).max(30).default([]),
  region:region.default("any"),
  town:z.string().trim().max(80).default(""),
  visualType:visualType.default("mixed"),
}).strict();

function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function areaLabel(regionValue:string,town:string){
  if(town.trim())return town.trim();
  return regionValue==="north"?"Costa Blanca North":regionValue==="south"?"Costa Blanca South":
    regionValue==="inland"?"Alicante Inland":regionValue==="costa-calida"?"Costa Calida":"Costa Blanca";
}
function visualCount(seconds:number){return Math.max(3,Math.min(10,Math.round(seconds/6)));}

export async function GET(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const client=db();if(!client)return NextResponse.json({error:"Supabase not configured"},{status:503});
  const {data,error}=await client.from("remaster_reel_jobs").select("*")
    .order("created_at",{ascending:false}).limit(50);
  if(error)return NextResponse.json({error:error.message,code:"REELS_SCHEMA_NOT_READY"},{status:503});
  const rows=(data||[]).map(row=>({
    ...row,
    video_url:row.video_path?client.storage.from(REMASTER_REEL_BUCKET).getPublicUrl(row.video_path).data.publicUrl:null,
  }));
  return NextResponse.json({reels:rows},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const context=await getRequestAccessContext(request);
  if(!context)return NextResponse.json({error:"Admin session required"},{status:401});
  const parsed=renderSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({
    error:"Invalid Reel Studio payload",
    issues:parsed.error.issues.map(issue=>({path:issue.path.join("."),message:issue.message})),
  },{status:400});
  const input=parsed.data,client=db();
  if(!client)return NextResponse.json({error:"Supabase not configured"},{status:503});
  const id=crypto.randomUUID(),seed=id;
  const {data:song,error:songError}=await client.from("songs")
    .select("id,name,file_url,brand").eq("id",input.songId).in("brand",[...REMASTER_SONG_READ_BRANDS]).maybeSingle();
  if(songError)return NextResponse.json({error:songError.message},{status:500});
  if(!song?.file_url)return NextResponse.json({error:"Valgt sang finnes ikke eller mangler en offentlig lydfil.",code:"REEL_SONG_UNAVAILABLE"},{status:400});

  const selection={
    brand:input.brand,randomSeed:seed,
    artStyles:input.artStyles,artCollections:input.artCollections,artIds:input.artIds,
    bookSeries:input.bookSeries,bookLanguages:input.bookLanguages,bookIds:input.bookIds,
  } as const;
  let visuals:ReelVisual[]=[];
  const count=visualCount(input.durationSeconds);
  const area=areaLabel(input.region,input.town);
  try{
    if(input.brand==="art"||input.brand==="books"){
      const catalog=input.brand==="art"?await loadPublishedMixArt():await loadPublishedMixBooks();
      const issues=diagnoseExplicitMixSelection(catalog,selection);
      if(issues.length)return NextResponse.json({
        code:"REEL_SELECTION_INVALID",
        error:"Rett disse valgene før Reel lages: "+issues.map(describeMixSelectionIssue).join(" "),
        issues,
      },{status:400});
      const chosen=selectApprovedPromotionItems(catalog,selection,count);
      if(!chosen.length)return NextResponse.json({error:"Ingen publiserte bilder passer til valgte filtre.",code:"REEL_SELECTION_EMPTY"},{status:400});
      visuals=chosen.map((item:PromotionItem)=>({
        id:item.id,title:item.title,imageUrl:item.imageUrl,detailUrl:item.detailUrl,
      }));
    }else{
      const property=await loadZenEcoHomesReelVisuals({
        region:input.region,town:input.town,visualType:input.visualType,limit:count,
      });
      visuals=property.visualSummaries.map((item,index)=>({
        id:item.propertyId||"property-"+index,
        title:item.title,imageUrl:item.url,detailUrl:item.externalUrl||"https://zenecohomes.com/",
        location:item.location,ref:item.ref,
      }));
    }

    const caption=buildReelCaption({brand:input.brand,songTitle:String(song.name||"Re-Master Freddy"),visuals,areaLabel:input.brand==="zeneco"?area:undefined});
    const {error:insertError}=await client.from("remaster_reel_jobs").insert({
      id,brand:input.brand,title:input.title,duration_seconds:input.durationSeconds,
      song_id:String(song.id),song_title:String(song.name||"Re-Master Freddy"),
      region:input.region,town:input.town||null,visual_type:input.visualType,
      selection:{...selection,channels:input.channels},
      assets:visuals.map(v=>({id:v.id,title:v.title,detailUrl:v.detailUrl,location:v.location,ref:v.ref})),
      caption,channels:input.channels,state:"rendering",created_by:context.email,
    });
    if(insertError)return NextResponse.json({error:insertError.message,code:"REELS_SCHEMA_NOT_READY"},{status:503});

    const video=await renderRemasterReel({
      brand:input.brand,title:input.title,durationSeconds:input.durationSeconds,
      audioUrl:String(song.file_url),songTitle:String(song.name||"Re-Master Freddy"),
      visuals,areaLabel:input.brand==="zeneco"?area:undefined,
    });
    const objectPath=id+".mp4";
    const {error:uploadError}=await client.storage.from(REMASTER_REEL_BUCKET).upload(objectPath,video,{
      contentType:"video/mp4",cacheControl:"3600",upsert:false,
    });
    if(uploadError)throw new Error("REEL_STORAGE_FAILED: "+uploadError.message);
    const {data:ready,error:readyError}=await client.from("remaster_reel_jobs").update({
      video_path:objectPath,state:"ready",updated_at:new Date().toISOString(),error:null,
    }).eq("id",id).select("*").single();
    if(readyError)throw new Error("REEL_JOB_SAVE_FAILED: "+readyError.message);
    const videoUrl=client.storage.from(REMASTER_REEL_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    return NextResponse.json({success:true,reel:{...ready,video_url:videoUrl}},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"REEL_RENDER_FAILED";
    await client.from("remaster_reel_jobs").update({
      state:"failed",error:message.slice(0,700),updated_at:new Date().toISOString(),
    }).eq("id",id);
    return NextResponse.json({success:false,error:message,code:"REEL_RENDER_FAILED"},{status:500});
  }
}
