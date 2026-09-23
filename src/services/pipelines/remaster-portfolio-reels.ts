import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";
import { isApprovedArtPreviewUrl } from "./remaster-mix-art-thumbnail";
import type { PromotionItem } from "./remaster-mix-promotions";
import { DONA_ANNA_REEL_IMAGES } from "./remaster-reels-extra-brands";
import type { RemasterMixRegion, RemasterMixVisualType } from "./remaster-mix-planner";

export type ReelBrand = "art" | "books" | "zeneco" | "freddybremseth" | "pinosoecolife" | "donaanna";
export type ReelChannel = "instagram"|"facebook";
export type ReelSong = {id:string;title:string;audioUrl:string;youtubeUrl?:string|null};
export type ReelRenderInput = {
  brand: ReelBrand;
  title: string;
  durationSeconds: 15|20|30|45|60;
  song: ReelSong;
  imageUrls: string[];
  promotedItems?: PromotionItem[];
  region?: RemasterMixRegion;
  areaQuery?: string;
  visualTypes?: RemasterMixVisualType[];
};
export type ReelRenderResult = {buffer:Buffer;caption:string;durationSeconds:number;visualCount:number};

const SUPABASE_AUDIO = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:public|sign)\/assets\/neural-beat\//i;
const SAFE_PUBLIC_SUPABASE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[a-z0-9_-]+\//i;
const BOOK_HOST="books.freddybremseth.com";

function safeText(value:string,max:number) {
  return String(value||"").replace(/[{}\\\r\n]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
function assPath(value:string){return value.replace(/\\/g,"\\\\").replace(/:/g,"\\:").replace(/'/g,"\\'");}
function brandLabel(brand:ReelBrand) {
  return ({art:"FREDDY BREMSETH ART",books:"FREDDY BREMSETH BOOKS",zeneco:"ZEN ECO HOMES",freddybremseth:"FREDDY BREMSETH",pinosoecolife:"PINOSO ECO LIFE",donaanna:"DOÑA ANNA"} as const)[brand];
}
function brandWebsite(brand:ReelBrand) {
  return ({art:"art.freddybremseth.com",books:"books.freddybremseth.com",zeneco:"zenecohomes.com",freddybremseth:"freddybremseth.com",pinosoecolife:"pinosoecolife.com",donaanna:"donaanna.com"} as const)[brand];
}
function buildAss(input:ReelRenderInput) {
  const brand=brandLabel(input.brand),title=safeText(input.title,78),site=brandWebsite(input.brand);
  return [
    "[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","WrapStyle: 2","ScaledBorderAndShadow: yes","",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Brand,DejaVu Sans,38,&H00FFFFFF,&H000000FF,&H006A3E16,&H90000000,-1,0,0,0,100,100,2,0,1,2,1,8,70,70,54,1",
    "Style: Title,DejaVu Sans,52,&H00E8F6FF,&H000000FF,&H00995A22,&H90000000,-1,0,0,0,100,100,0,0,1,3,1,8,60,60,106,1",
    "Style: Footer,DejaVu Sans,33,&H00FFFFFF,&H000000FF,&H006A3E16,&HA0000000,-1,0,0,0,100,100,0,0,1,2,1,2,50,50,52,1",
    "Style: Music,DejaVu Sans,26,&H00B9E8FF,&H000000FF,&H002A5E83,&HA0000000,0,0,0,0,100,100,0,0,1,2,1,2,50,50,94,1",
    "","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 5,0:00:00.00,0:10:00.00,Brand,,0,0,0,,{\\an8}${safeText(brand,50)}`,
    `Dialogue: 5,0:00:00.00,0:10:00.00,Title,,0,0,0,,{\\an8}${title}`,
    `Dialogue: 5,0:00:00.00,0:10:00.00,Footer,,0,0,0,,{\\an2}${site}`,
    `Dialogue: 5,0:00:00.00,0:10:00.00,Music,,0,0,0,,{\\an2}Music by Re-Master Freddy`,
    "",
  ].join("\n");
}
function privateHost(host:string){
  return host==="localhost" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host==="::1";
}
export function isApprovedReelImageUrl(url:string,brand:ReelBrand){
  if(brand==="art") return isApprovedArtPreviewUrl(url);
  try{
    const u=new URL(url);
    if(u.protocol!=="https:"||privateHost(u.hostname)||u.username||u.password)return false;
    if(brand==="books" || brand==="freddybremseth") return (brand==="freddybremseth" && isApprovedArtPreviewUrl(url)) || u.hostname===BOOK_HOST || SAFE_PUBLIC_SUPABASE.test(u.href);
    if(brand==="donaanna") return DONA_ANNA_REEL_IMAGES.includes(u.href);
    return true; // Property URLs originate from canonical, website-visible, brand-filtered inventory only.
  }catch{return false;}
}
export function isApprovedReelAudioUrl(url:string){return SUPABASE_AUDIO.test(String(url||"")) && !/\.\.|%2f|%5c/i.test(url);}
async function download(url:string,dest:string,max:number){
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(25_000)});
  if(!response.ok)throw new Error("REEL_SOURCE_HTTP_"+response.status);
  const declared=Number(response.headers.get("content-length")||"0");
  if(declared>max)throw new Error("REEL_SOURCE_TOO_LARGE");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1024||bytes.length>max)throw new Error("REEL_SOURCE_INVALID");
  await fs.writeFile(dest,bytes);
}
function run(binary:string,args:string[],timeout=280_000):Promise<void>{
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:["ignore","ignore","pipe"]});
    let stderr="",done=false;
    const finish=(err?:Error)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve();};
    const timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error("REEL_RENDER_TIMEOUT"));},timeout);
    child.stderr.on("data",(chunk:Buffer)=>{stderr=(stderr+chunk.toString()).slice(-2200);});
    child.once("error",(error:Error)=>finish(error));
    child.once("close",(code:number|null)=>code===0?finish():finish(new Error("REEL_FFMPEG_"+code+": "+stderr.slice(-900))));
  });
}
export function buildPortfolioReelCaption(input:ReelRenderInput){
  const music="🎧 Music by Re-Master Freddy: https://remaster.freddybremseth.com/";
  if(input.brand==="art"){
    const unique=[...new Map((input.promotedItems||[]).map(item=>[item.id,item])).values()].slice(0,6);
    return [
      "🎨 Artwork by Freddy Bremseth.",
      ...unique.map(item=>item.title+" — "+item.detailUrl),
      "Explore the gallery: https://art.freddybremseth.com/",
      music,
      "#FreddyBremsethArt #ArtReel #ReMasterFreddy",
    ].join("\n\n");
  }
  if(input.brand==="books"){
    const unique=[...new Map((input.promotedItems||[]).map(item=>[item.id,item])).values()].slice(0,6);
    return [
      "📚 Books by Freddy Bremseth.",
      ...unique.map(item=>item.title+" — "+item.detailUrl),
      "Discover the books: https://books.freddybremseth.com/",
      music,
      "#FreddyBremsethBooks #BookReel #ReMasterFreddy",
    ].join("\n\n");
  }
  if(input.brand==="freddybremseth") return [
    "Freddy Bremseth — books, art, music and ideas.",
    ...(input.promotedItems||[]).slice(0,6).map(item=>item.title+" — "+item.detailUrl),
    "Explore: https://freddybremseth.com/", music,
    "#FreddyBremseth #ArtAndBooks #ReMasterFreddy",
  ].join("\n\n");
  if(input.brand==="donaanna") return [
    "🫒 Doña Anna — olives, olive oil and Mediterranean life in Biar.",
    "Discover Doña Anna: https://donaanna.com/", music,
    "#DonaAnna #OliveOil #Biar #ReMasterFreddy",
  ].join("\n\n");
  const area=safeText(input.areaQuery||"",80);
  const region=input.region&&input.region!=="any" ? input.region.replace(/-/g," ") : "";
  return [
    "🏡 Homes and property inspiration from "+(input.brand==="pinosoecolife"?"Pinoso EcoLife":"Zen Eco Homes")+(area?" in "+area:region?" — "+region:"")+".",
    "Explore current properties: https://"+brandWebsite(input.brand)+"/",
    "Availability and prices can change; check the website for current listings.",
    music,
    input.brand==="pinosoecolife"?"#PinosoEcoLife #AlicanteInland #PropertyReel #ReMasterFreddy":"#ZenEcoHomes #CostaBlanca #PropertyReel #ReMasterFreddy",
  ].join("\n\n");
}

export async function renderPortfolioReel(input:ReelRenderInput):Promise<ReelRenderResult>{
  if(![15,20,30,45,60].includes(input.durationSeconds))throw new Error("REEL_DURATION_NOT_ALLOWED");
  if(!isApprovedReelAudioUrl(input.song.audioUrl))throw new Error("REEL_AUDIO_MUST_USE_PERMANENT_REMASTER_SUPABASE_FILE");
  const imageUrls=[...new Set(input.imageUrls)].filter(url=>isApprovedReelImageUrl(url,input.brand)).slice(0,8);
  if(imageUrls.length<2)throw new Error("REEL_NEEDS_AT_LEAST_TWO_APPROVED_VISUALS");
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"remaster-portfolio-reel-"));
  try{
    const audio=path.join(dir,"audio.mp3"),ass=path.join(dir,"overlay.ass"),out=path.join(dir,"reel.mp4");
    await download(input.song.audioUrl,audio,50*1024*1024);
    await fs.writeFile(ass,buildAss(input));
    const files:string[]=[];
    for(let i=0;i<imageUrls.length;i++){
      let ext=".jpg";try{const candidate=path.extname(new URL(imageUrls[i]).pathname).toLowerCase();if([".jpg",".jpeg",".png",".webp"].includes(candidate))ext=candidate;}catch{}
      const target=path.join(dir,"visual-"+i+ext);await download(imageUrls[i],target,10*1024*1024);files.push(target);
    }
    const binary=await ensureFFmpeg();
    const segment=input.durationSeconds/files.length;
    const args=["-hide_banner","-loglevel","error"];
    for(const file of files)args.push("-loop","1","-framerate","24","-t",segment.toFixed(3),"-i",file);
    args.push("-stream_loop","-1","-ss","10","-i",audio);
    const filters:string[]=[];
    for(let i=0;i<files.length;i++)filters.push(
      `[${i}:v]scale=1080:1540:force_original_aspect_ratio=decrease,pad=1080:1540:(ow-iw)/2:(oh-ih)/2:color=0x0a1724,fps=24,trim=duration=${segment.toFixed(3)},setsar=1,setpts=PTS-STARTPTS[v${i}]`
    );
    filters.push(files.map((_,i)=>"[v"+i+"]").join("")+`concat=n=${files.length}:v=1:a=0[gallery]`);
    filters.push(`[gallery]pad=1080:1920:0:190:color=0x07131f[canvas]`);
    filters.push(`[canvas]ass=filename='${assPath(ass)}',format=yuv420p[vout]`);
    const audioIndex=files.length;
    args.push("-filter_complex",filters.join(";"),"-map","[vout]","-map",`${audioIndex}:a:0`,
      "-t",String(input.durationSeconds),"-r","24","-c:v","libx264","-preset","ultrafast","-crf","27",
      "-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-b:a","128k","-movflags","+faststart","-y",out);
    await run(binary,args);
    const buffer=await fs.readFile(out);
    if(buffer.length<20_000||buffer.length>80*1024*1024||buffer.toString("ascii",4,8)!=="ftyp")
      throw new Error("REEL_INVALID_MP4");
    return {buffer,caption:buildPortfolioReelCaption(input),durationSeconds:input.durationSeconds,visualCount:files.length};
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>undefined);}
}
