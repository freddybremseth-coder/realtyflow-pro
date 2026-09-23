/**
 * On-demand Reel export for Re-Master Admin. Uses PUBLIC published art previews,
 * published book covers, or website-visible property photos from the selected
 * area. The selected song must be a canonical Re-Master Freddy public audio file.
 * No Meta/YouTube upload occurs in this renderer.
 */
import {spawn} from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {ensureFFmpeg} from "@/services/integrations/ffmpeg-renderer";
import {buildArtShortPoster} from "@/services/integrations/art-thumbnail-panel";
import {isApprovedArtPreviewUrl} from "./remaster-mix-art-thumbnail";
import type {PromotionItem} from "./remaster-mix-promotions";

export type StudioReelBrand="art"|"books"|"zeneco"|"pinoso";
export type StudioReelChannel="instagram"|"facebook";
export type StudioReelSource={id:string;title:string;imageUrl:string;detailUrl:string};
export interface StudioReelInput{
  brand:StudioReelBrand;
  durationSeconds:15|20|30|45|60;
  title:string;
  song:{id:string;title:string;audioUrl:string;youtubeUrl?:string|null};
  visuals:StudioReelSource[];
  area?:string;
}
const PUBLIC_AUDIO="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/";
export const STUDIO_REEL_BUCKET="remaster-studio-reels";
export const STUDIO_REEL_DURATIONS=[15,20,30,45,60] as const;
const BRAND_META:Record<StudioReelBrand,{poster:string;footer:string;site:string;label:string;tags:string}>={
  art:{poster:"ART LOUNGE",footer:"ART.FREDDYBREMSETH.COM",site:"https://art.freddybremseth.com/",label:"Original art by Freddy Bremseth",tags:"#FreddyBremsethArt #ArtLounge #ReMasterFreddy"},
  books:{poster:"FREDDY BOOKS",footer:"BOOKS.FREDDYBREMSETH.COM",site:"https://books.freddybremseth.com/",label:"Books by Freddy Bremseth",tags:"#FreddyBremsethBooks #BookReels #ReMasterFreddy"},
  zeneco:{poster:"ZEN ECO HOMES",footer:"ZENECOHOMES.COM",site:"https://zenecohomes.com/",label:"Homes from Zen Eco Homes",tags:"#ZenEcoHomes #CostaBlanca #ReMasterFreddy"},
  pinoso:{poster:"PINOSO ECO LIFE",footer:"PINOSOECOLIFE.COM",site:"https://pinosoecolife.com/",label:"Inland homes from Pinoso EcoLife",tags:"#PinosoEcoLife #InlandSpain #ReMasterFreddy"},
};
const noControl=(v:string)=>v.replace(/[\r\n\t<>]/g," ").replace(/\s+/g," ").trim();
export function reelStudioCaption(input:StudioReelInput):string{
  const meta=BRAND_META[input.brand];
  const named=[...new Map(input.visuals.map(x=>[x.id,x])).values()].slice(0,3);
  const area=input.area? " in "+noControl(input.area).slice(0,55):"";
  const show=input.brand==="zeneco"||input.brand==="pinoso"
    ? "Photos are property inspiration; availability and prices may change. Explore current homes at "+meta.site
    : named.map(v=>noControl(v.title).slice(0,85)+(v.detailUrl?" — "+v.detailUrl:"")).join("\n");
  return [
    meta.label+area+" | "+noControl(input.title).slice(0,120),
    show,
    "Explore more: "+meta.site,
    "Music: "+noControl(input.song.title).slice(0,90)+" — Re-Master Freddy",
    input.song.youtubeUrl && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(input.song.youtubeUrl)
      ? "Listen: "+input.song.youtubeUrl : "More music: https://remaster.freddybremseth.com/",
    meta.tags,
  ].filter(Boolean).join("\n\n");
}
function isApprovedImage(url:string,brand:StudioReelBrand):boolean{
  if(brand==="art")return isApprovedArtPreviewUrl(url);
  try {
    const u=new URL(url);
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||/%2f|%5c|\.\./i.test(u.pathname))return false;
    if(brand==="books")return u.hostname==="books.freddybremseth.com" && /^\/assets\/covers\/[a-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(u.pathname)
      || u.hostname==="ereapsfcsqtdmzosgnnn.supabase.co"&&u.pathname.startsWith("/storage/v1/object/public/")&&/\.(?:png|jpe?g|webp)$/i.test(u.pathname);
    return /(^|\.)apinmo\.com$/.test(u.hostname)||u.hostname==="static.tmgrupoinmobiliario.com"
      ||u.hostname==="zenecohomes.com"||u.hostname==="pinosoecolife.com"
      ||u.hostname==="ereapsfcsqtdmzosgnnn.supabase.co"&&u.pathname.startsWith("/storage/v1/object/public/");
  }catch{return false;}
}
export function assertStudioReelSources(input:StudioReelInput):void {
  if(!STUDIO_REEL_DURATIONS.includes(input.durationSeconds))throw new Error("REEL_INVALID_DURATION");
  if(!input.visuals.length||input.visuals.length>5)throw new Error("REEL_SELECT_ONE_TO_FIVE_VISUALS");
  if(!input.song.audioUrl.startsWith(PUBLIC_AUDIO)||/%2f|%5c|\.\.|[?#]/i.test(input.song.audioUrl.slice(PUBLIC_AUDIO.length))) {
    throw new Error("REEL_SONG_NEEDS_PUBLIC_REMASTER_AUDIO");
  }
  for(const visual of input.visuals) if(!isApprovedImage(visual.imageUrl,input.brand))
    throw new Error("REEL_UNAPPROVED_VISUAL: "+noControl(visual.title).slice(0,85)+" ["+visual.id+"]");
}
async function fetchBytes(url:string,max:number,kind:string):Promise<Buffer>{
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error("REEL_"+kind+"_HTTP_"+response.status);
  if(Number(response.headers.get("content-length")||0)>max)throw new Error("REEL_"+kind+"_TOO_LARGE");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1024||bytes.length>max)throw new Error("REEL_"+kind+"_INVALID_BYTES");
  return bytes;
}
function renderFFmpeg(binary:string,args:string[]):Promise<void>{
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:["ignore","ignore","pipe"]});
    let stderr="",done=false;
    const finish=(err?:Error)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve();};
    const timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error("REEL_FFMPEG_TIMEOUT"));},245_000);
    child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-3000);});
    child.once("error",e=>finish(e));
    child.once("close",code=>code===0?finish():finish(new Error("REEL_FFMPEG_"+code+": "+stderr.slice(-900))));
  });
}
/** Render only; publishing must be a separate, explicitly approved action. */
export async function renderStudioReel(input:StudioReelInput):Promise<Buffer>{
  assertStudioReelSources(input);
  const meta=BRAND_META[input.brand];
  const visuals=Array.from({length:3},(_,i)=>input.visuals[i%input.visuals.length]);
  const [audio,...pictures]=await Promise.all([
    fetchBytes(input.song.audioUrl,45*1024*1024,"AUDIO"),
    ...visuals.map(async(item)=> {
      try{return await fetchBytes(item.imageUrl,12*1024*1024,"IMAGE");}
      catch(err){throw new Error("REEL_VISUAL_UNAVAILABLE: "+noControl(item.title).slice(0,85)+" ["+item.id+"]: "+(err instanceof Error?err.message:String(err)));}
    }),
  ]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"remaster-reel-studio-"));
  try {
    const poster=path.join(dir,"poster.ppm"),song=path.join(dir,"song.mp3"),output=path.join(dir,"reel.mp4");
    await fs.writeFile(poster,buildArtShortPoster(meta.poster,input.title,"music",meta.footer));
    await fs.writeFile(song,audio);
    const sources=await Promise.all(pictures.map(async(bytes,i)=>{
      const extension=/\.(?:png)(?:$|\?)/i.test(visuals[i].imageUrl)?".png":/\.webp(?:$|\?)/i.test(visuals[i].imageUrl)?".webp":".jpg";
      const src=path.join(dir,"visual-"+i+extension);
      await fs.writeFile(src,bytes);
      return src;
    }));
    const binary=await ensureFFmpeg();
    const segment=input.durationSeconds/3;
    const args=["-hide_banner","-loglevel","error"];
    for(const src of sources)args.push("-loop","1","-framerate","1","-t",String(segment),"-i",src);
    args.push("-loop","1","-framerate","1","-i",poster,"-stream_loop","-1","-i",song);
    const filters=sources.map((_,i)=>"["+i+":v]scale=1080:1320:force_original_aspect_ratio=decrease,"+
      "pad=1080:1320:(ow-iw)/2:(oh-ih)/2:color=0x101820,setsar=1,"+
      "trim=duration="+segment+",setpts=PTS-STARTPTS,fps=24[v"+i+"]");
    filters.push("[v0][v1][v2]concat=n=3:v=1:a=0[gallery]");
    filters.push("[3:v]format=rgb24[poster];[poster][gallery]overlay=0:160:shortest=1,format=yuv420p[out]");
    args.push("-filter_complex",filters.join(";"),"-map","[out]","-map","4:a:0",
      "-t",String(input.durationSeconds),"-r","24","-c:v","libx264","-preset","ultrafast",
      "-crf","28","-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-b:a","128k",
      "-movflags","+faststart","-y",output);
    await renderFFmpeg(binary,args);
    const mp4=await fs.readFile(output);
    if(mp4.length<20_000||mp4.length>90*1024*1024||mp4.toString("ascii",4,8)!=="ftyp")
      throw new Error("REEL_OUTPUT_INVALID_MP4");
    return mp4;
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>undefined);}
}
