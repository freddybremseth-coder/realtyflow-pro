/**
 * Manual Re-Master Reels Studio renderer.
 * Produces one 1080x1920 H.264/AAC MP4 from owner-selected published art,
 * books or canonical Zen Eco Homes inventory. Rendering is separate from Meta
 * publication so a good file is never lost/re-rendered because a social API fails.
 */
import {spawn} from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {ensureFFmpeg} from "@/services/integrations/ffmpeg-renderer";
import {isApprovedArtPreviewUrl} from "./remaster-mix-art-thumbnail";

export type ReelBrand="art"|"books"|"zeneco";
export type ReelVisual={id:string;title:string;imageUrl:string;detailUrl?:string;location?:string;ref?:string};
export type ReelRenderInput={
  brand:ReelBrand; title:string; durationSeconds:15|20|30|45|60;
  audioUrl:string; songTitle:string; visuals:ReelVisual[];
  areaLabel?:string; cta?:string;
};
export const REMASTER_REEL_BUCKET="remaster-reels";
const AUDIO_PREFIX="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/";

function clean(value:string,max=100){return String(value||"").replace(/[{}\r\n\t]/g," ").replace(/\\/g,"/").replace(/\s+/g," ").trim().slice(0,max);}
function escapeAssPath(value:string){return value.replace(/\\/g,"\\\\").replace(/:/g,"\\:").replace(/'/g,"\\'");}
function safeHttps(url:string){
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=="https:"||parsed.username||parsed.password)return false;
    const h=parsed.hostname.toLowerCase();
    if(h==="localhost"||h==="127.0.0.1"||h==="::1"||h.endsWith(".local"))return false;
    if(/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h))return false;
    return true;
  }catch{return false;}
}
export function isApprovedReelVisual(url:string,brand:ReelBrand){
  if(brand==="art")return isApprovedArtPreviewUrl(url);
  if(!safeHttps(url))return false;
  if(brand==="books"){
    const u=new URL(url);
    return (u.hostname==="books.freddybremseth.com"&&u.pathname.startsWith("/assets/covers/")) ||
      (u.hostname.endsWith(".supabase.co")&&u.pathname.includes("/storage/v1/object/public/"));
  }
  return true; // Zen Eco URL originated from canonical RealtyFlow property inventory.
}
export function isApprovedReelAudio(url:string){
  return url.startsWith(AUDIO_PREFIX)&&!/%2f|%5c|\.\.|[?#]/i.test(url.substring(AUDIO_PREFIX.length));
}
async function fetchBytes(url:string,max:number){
  const res=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(25_000)});
  if(!res.ok)throw new Error("REEL_SOURCE_HTTP_"+res.status);
  const declared=Number(res.headers.get("content-length")||0);
  if(declared>max)throw new Error("REEL_SOURCE_TOO_LARGE");
  const buf=Buffer.from(await res.arrayBuffer());
  if(buf.length<1024||buf.length>max)throw new Error("REEL_SOURCE_INVALID");
  return buf;
}
function run(binary:string,args:string[],timeoutMs=240_000){
  return new Promise<void>((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:["ignore","ignore","pipe"]});
    let stderr="",done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve();};
    const timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error("REEL_RENDER_TIMEOUT"));},timeoutMs);
    child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-2500);});
    child.once("error",error=>finish(error));
    child.once("close",code=>code===0?finish():finish(new Error("REEL_FFMPEG_"+code+": "+stderr.slice(-1000))));
  });
}
function ass(input:ReelRenderInput){
  const brand=input.brand==="art"?"FREDDY BREMSETH ART":input.brand==="books"?"FREDDY BREMSETH BOOKS":"ZEN ECO HOMES";
  const footer=input.brand==="art"?"ART.FREDDYBREMSETH.COM":input.brand==="books"?"BOOKS.FREDDYBREMSETH.COM":"ZENECOHOMES.COM";
  const area=input.areaLabel?clean(input.areaLabel,60).toUpperCase():"";
  const title=clean(input.title,80).toUpperCase();
  const song=clean(input.songTitle,70);
  return [
    "[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","WrapStyle: 2","ScaledBorderAndShadow: yes","",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Brand,DejaVu Sans,34,&H00FFFFFF,&H000000FF,&H00000000,&H78000000,-1,0,0,0,100,100,2,0,1,2,1,8,50,50,80,1",
    "Style: Title,DejaVu Sans,58,&H00FFFFFF,&H000000FF,&H00111111,&H55000000,-1,0,0,0,100,100,0,0,1,3,2,8,65,65,135,1",
    "Style: Area,DejaVu Sans,30,&H00D9F3FF,&H000000FF,&H00111111,&H55000000,-1,0,0,0,100,100,1,0,1,2,1,8,50,50,240,1",
    "Style: Footer,DejaVu Sans,30,&H00FFFFFF,&H000000FF,&H00111111,&H74000000,-1,0,0,0,100,100,1,0,1,2,1,2,50,50,80,1",
    "Style: Song,DejaVu Sans,23,&H00D0D0D0,&H000000FF,&H00111111,&H74000000,0,0,0,0,100,100,0,0,1,2,1,2,50,50,135,1",
    "","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 5,0:00:00.00,0:02:00.00,Brand,,0,0,0,,${brand}`,
    `Dialogue: 5,0:00:00.00,0:00:04.50,Title,,0,0,0,,${title}`,
    ...(area?[`Dialogue: 5,0:00:00.00,0:00:04.50,Area,,0,0,0,,${area}`]:[]),
    `Dialogue: 5,0:00:00.00,0:02:00.00,Footer,,0,0,0,,${footer}`,
    `Dialogue: 5,0:00:00.00,0:02:00.00,Song,,0,0,0,,MUSIC: RE-MASTER FREDDY — ${song}`,
    "",
  ].join("\n");
}
export function buildReelCaption(input:{
  brand:ReelBrand;songTitle:string;visuals:ReelVisual[];areaLabel?:string;
}){
  const music="Music: "+clean(input.songTitle,90)+" — Re-Master Freddy\nhttps://remaster.freddybremseth.com/";
  if(input.brand==="art"){
    const works=input.visuals.filter(x=>x.detailUrl).slice(0,6);
    return [
      "Freddy Bremseth Art × Re-Master Freddy",
      works.length?"Artworks shown:\n"+works.map(x=>clean(x.title,100)+" — "+x.detailUrl).join("\n"):"",
      "Explore the gallery: https://art.freddybremseth.com/",
      music,"#FreddyBremsethArt #ReMasterFreddy #ArtReel",
    ].filter(Boolean).join("\n\n");
  }
  if(input.brand==="books"){
    const books=input.visuals.filter(x=>x.detailUrl).slice(0,6);
    return [
      "Books by Freddy Bremseth × Re-Master Freddy",
      books.length?"Books shown:\n"+books.map(x=>clean(x.title,100)+" — "+x.detailUrl).join("\n"):"",
      "Explore the books: https://books.freddybremseth.com/",
      music,"#FreddyBremsethBooks #ReMasterFreddy #BookReel",
    ].filter(Boolean).join("\n\n");
  }
  return [
    "Homes and property inspiration from Zen Eco Homes"+(input.areaLabel?" — "+clean(input.areaLabel,70):"")+".",
    "Browse current properties: https://zenecohomes.com/",
    "Availability, prices and individual listings can change. Use the website for current details.",
    music,"#ZenEcoHomes #CostaBlanca #ReMasterFreddy",
  ].join("\n\n");
}
export async function renderRemasterReel(input:ReelRenderInput):Promise<Buffer>{
  if(![15,20,30,45,60].includes(input.durationSeconds))throw new Error("REEL_DURATION_INVALID");
  if(!isApprovedReelAudio(input.audioUrl))throw new Error("REEL_AUDIO_NOT_CANONICAL");
  const visuals=input.visuals.filter(v=>isApprovedReelVisual(v.imageUrl,input.brand)).slice(0,10);
  if(!visuals.length)throw new Error("REEL_VISUALS_UNAVAILABLE");
  const [audio,...images]=await Promise.all([
    fetchBytes(input.audioUrl,45*1024*1024),
    ...visuals.map(v=>fetchBytes(v.imageUrl,10*1024*1024)),
  ]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"remaster-reel-"));
  try{
    const audioPath=path.join(dir,"audio.mp3"),assPath=path.join(dir,"overlay.ass"),out=path.join(dir,"reel.mp4");
    await fs.writeFile(audioPath,audio);await fs.writeFile(assPath,ass(input));
    const imagePaths:string[]=[];
    for(let i=0;i<images.length;i++){const p=path.join(dir,"visual-"+i+".img");await fs.writeFile(p,images[i]);imagePaths.push(p);}
    const binary=await ensureFFmpeg();
    const segment=input.durationSeconds/imagePaths.length;
    const args=["-hide_banner","-loglevel","error"];
    for(const p of imagePaths)args.push("-loop","1","-framerate","24","-t",segment.toFixed(3),"-i",p);
    args.push("-stream_loop","-1","-ss","8","-i",audioPath);
    const filters:string[]=[];
    for(let i=0;i<imagePaths.length;i++){
      const imageFilter=input.brand==="zeneco"
        ? "scale=1080:1520:force_original_aspect_ratio=increase,crop=1080:1520"
        : "scale=1000:1520:force_original_aspect_ratio=decrease,pad=1000:1520:(ow-iw)/2:(oh-ih)/2:color=0x101820";
      filters.push(`[${i}:v]${imageFilter},pad=1080:1920:(ow-iw)/2:200:color=0x09121b,fps=24,trim=duration=${segment.toFixed(3)},setsar=1,setpts=PTS-STARTPTS[v${i}]`);
    }
    filters.push(imagePaths.map((_,i)=>`[v${i}]`).join("")+`concat=n=${imagePaths.length}:v=1:a=0[gallery]`);
    filters.push(`[gallery]ass=filename='${escapeAssPath(assPath)}',format=yuv420p[out]`);
    args.push("-filter_complex",filters.join(";"),"-map","[out]","-map",imagePaths.length+":a:0",
      "-t",String(input.durationSeconds),"-r","24","-c:v","libx264","-preset","veryfast","-crf","27",
      "-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-b:a","128k","-movflags","+faststart","-y",out);
    await run(binary,args);
    const video=await fs.readFile(out);
    if(video.length<20_000||video.length>100*1024*1024||video.toString("ascii",4,8)!=="ftyp")throw new Error("REEL_INVALID_MP4");
    return video;
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>undefined);}
}
