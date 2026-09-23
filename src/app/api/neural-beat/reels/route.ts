import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {requireAdminApi} from "@/lib/api-admin";
import {REMASTER_SONG_READ_BRANDS} from "@/services/integrations/airtable-client";
import {loadPublishedMixArt,loadPublishedMixBooks} from "@/services/pipelines/remaster-mix-promotions";
import {loadStudioProperties} from "@/services/pipelines/remaster-reels-property-catalog";
import {renderStudioReel,reelStudioCaption,STUDIO_REEL_BUCKET,
  type StudioReelInput,type StudioReelSource,type StudioReelBrand} from "@/services/pipelines/remaster-reels-studio";

export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=300;
const requestSchema=z.object({
  requestKey:z.string().uuid(),
  brand:z.enum(["art","books","zeneco","pinoso"]),
  title:z.string().trim().min(3).max(120),
  durationSeconds:z.union([z.literal(15),z.literal(20),z.literal(30),z.literal(45),z.literal(60)]),
  songId:z.string().uuid(),
  selectedIds:z.array(z.string().min(1).max(160)).max(5).default([]),
  area:z.string().trim().max(100).default(""),
  channels:z.array(z.enum(["instagram","facebook"])).min(1).max(2).default(["instagram","facebook"]),
}).strict();
function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Supabase is not configured for Reels Studio.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function responseJob(database:ReturnType<typeof db>,row:Record<string,unknown>){
  const videoUrl=row.state==="ready"&&typeof row.video_path==="string"
    ?database.storage.from(STUDIO_REEL_BUCKET).getPublicUrl(row.video_path).data.publicUrl:null;
  return {...row,videoUrl};
}
/** Durable read-only owner history; downloads are ready only after completed MP4 upload. */
export async function GET(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  try{
    const database=db();
    const {data,error}=await database.from("remaster_studio_reel_jobs").select("*")
      .order("created_at",{ascending:false}).limit(30);
    if(error)throw new Error("Reels Studio schema is not installed: "+error.message);
    return NextResponse.json({jobs:(data||[]).map(row=>responseJob(database,row))},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(err){return NextResponse.json({error:err instanceof Error?err.message:"Failed loading Reels."},{status:503});}
}
/**
 * Explicit owner's render/save action. Never makes a Meta/YouTube request.
 * Same requestKey is idempotent even if the browser double-submits. Failed
 * and timed-out jobs are NOT retried on GET; a new owner's action is required.
 */
export async function POST(request:NextRequest){
  const denied=await requireAdminApi(request);if(denied)return denied;
  const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({
    error:"Velg merke, tittel, publisert musikk og 1–5 passende bilder (eller et bestemt boligområde).",
    issues:parsed.error.issues.map(x=>({path:x.path.join("."),message:x.message})),
  },{status:400});
  const input=parsed.data;
  if(new Set(input.channels).size!==input.channels.length)return NextResponse.json({error:"Dupliserte publiseringskanaler."},{status:400});
  if(input.brand!=="art"&&input.brand!=="books"&&!input.area)
    return NextResponse.json({error:"Velg et konkret område for bolig-Reels."},{status:400});
  if(["art","books"].includes(input.brand)&&input.selectedIds.length===0)
    return NextResponse.json({error:"Velg minst ett publisert kunstverk eller én bok."},{status:400});
  if(input.selectedIds.length&&new Set(input.selectedIds).size!==input.selectedIds.length)
    return NextResponse.json({error:"Velg hvert verk bare én gang."},{status:400});
  const database=db();
  const existing=await database.from("remaster_studio_reel_jobs").select("*")
    .eq("request_key",input.requestKey).maybeSingle();
  if(existing.error)return NextResponse.json({error:"Reels Studio schema is not installed: "+existing.error.message},{status:503});
  if(existing.data)return NextResponse.json({job:responseJob(database,existing.data)},
    {status:existing.data.state==="ready"?200:202,headers:{"Cache-Control":"private, no-store"}});
  const {data:busy,error:busyError}=await database.from("remaster_studio_reel_jobs")
    .select("id").eq("state","rendering").gt("updated_at",new Date(Date.now()-5*60_000).toISOString()).limit(1);
  if(busyError)return NextResponse.json({error:busyError.message},{status:503});
  if(busy?.length)return NextResponse.json({error:"En Reel rendres allerede. Vent til den er ferdig og oppdater status."},{status:409});
  let reel:StudioReelInput;
  try{
    const {data:song,error:songError}=await database.from("songs")
      .select("id,name,file_url,youtube_url,brand").eq("id",input.songId)
      .in("brand",[...REMASTER_SONG_READ_BRANDS]).maybeSingle();
    if(songError||!song?.file_url)throw new Error("Valgt Re-Master Freddy-sang har ingen tilgjengelig lydfil. Velg en annen sang.");
    let visuals:StudioReelSource[]=[];
    if(input.brand==="art"||input.brand==="books"){
      const catalog=input.brand==="art"?await loadPublishedMixArt():await loadPublishedMixBooks();
      const byId=new Map(catalog.map(x=>[x.id,x]));
      visuals=input.selectedIds.map(id=>{
        const item=byId.get(id);
        if(!item)throw new Error("Verket eller boken ["+id+"] er ikke lenger publisert eller mangler en godkjent forhåndsvisning. Oppdater katalogen.");
        return {id:item.id,title:item.title,imageUrl:item.imageUrl,detailUrl:item.detailUrl};
      });
    }else{
      const catalog=await loadStudioProperties(input.brand,input.area);
      if(!catalog.areas.some(area=>area.localeCompare(input.area,undefined,{sensitivity:"base"})===0))
        throw new Error("Boligområdet er ikke tilgjengelig. Velg et område fra katalogen.");
      const byId=new Map(catalog.properties.map(x=>[x.id,x]));
      visuals=input.selectedIds.length
        ?input.selectedIds.map(id=>{
          const item=byId.get(id);
          if(!item)throw new Error("Boligen ["+id+"] er ikke synlig på nettsiden eller ligger utenfor valgt område. Oppdater utvalget.");
          return item;
        })
        :catalog.properties.slice(0,3);
      if(!visuals.length)throw new Error("Ingen publiserte, godkjente boligbilder er tilgjengelige i "+input.area+". Velg et annet område.");
    }
    reel={brand:input.brand as StudioReelBrand,durationSeconds:input.durationSeconds,title:input.title,
      song:{id:song.id,title:String(song.name||"Re-Master Freddy"),audioUrl:song.file_url,youtubeUrl:song.youtube_url},
      visuals,area:input.area||undefined};
    // Verify all allowed origins, explicit selections and audio BEFORE inserting
    // a costly durable render job.
    const {assertStudioReelSources}=await import("@/services/pipelines/remaster-reels-studio");
    assertStudioReelSources(reel);
  }catch(err){
    return NextResponse.json({error:err instanceof Error?err.message:"The selected Reel sources are unavailable."},{status:400});
  }
  const caption=reelStudioCaption(reel);
  const {data:reserved,error:reserveError}=await database.from("remaster_studio_reel_jobs").insert({
    request_key:input.requestKey,brand:input.brand,title:input.title,
    area:input.area||null,duration_seconds:input.durationSeconds,channels:input.channels,
    song_id:reel.song.id,song_title:reel.song.title,
    visual_items:reel.visuals.map(v=>({id:v.id,title:v.title,detailUrl:v.detailUrl})),
    caption,state:"rendering",
  }).select("*").single();
  if(reserveError){
    if(reserveError.code==="23505"){
      const prior=await database.from("remaster_studio_reel_jobs").select("*")
        .eq("request_key",input.requestKey).maybeSingle();
      if(prior.data)return NextResponse.json({job:responseJob(database,prior.data)},{status:202});
    }
    return NextResponse.json({error:"Could not reserve Reel: "+reserveError.message},{status:503});
  }
  try{
    const video=await renderStudioReel(reel);
    const objectPath=reserved.id+".mp4";
    const {error:uploaded}=await database.storage.from(STUDIO_REEL_BUCKET).upload(objectPath,video,{
      contentType:"video/mp4",cacheControl:"3600",upsert:false,
    });
    if(uploaded)throw new Error("REEL_STORAGE_UPLOAD_FAILED: "+uploaded.message);
    const {data:ready,error:saved}=await database.from("remaster_studio_reel_jobs")
      .update({state:"ready",video_path:objectPath,error:null,updated_at:new Date().toISOString()})
      .eq("id",reserved.id).eq("state","rendering").select("*").single();
    if(saved||!ready)throw new Error("REEL_SAVED_VIDEO_BUT_JOB_UPDATE_FAILED");
    return NextResponse.json({job:responseJob(database,ready)},
      {status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    const message=err instanceof Error?err.message:"REEL_RENDER_FAILED";
    await database.from("remaster_studio_reel_jobs").update({
      state:"failed",error:message.slice(0,700),updated_at:new Date().toISOString(),
    }).eq("id",reserved.id).eq("state","rendering");
    return NextResponse.json({error:message,jobId:reserved.id},{status:500});
  }
}
