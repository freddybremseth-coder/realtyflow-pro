/**
 * Branded Art Lounge video/playlist-cover still: a real public gallery artwork
 * on either side, a protected center title stage, warm amber / electric-blue
 * accents, and a vinyl turntable illustration. All copy comes from the saved
 * owner's mix/playlist title; no baked-in "ART LOUNGE 2026" title.
 *
 * Uses the production ffmpeg-static ASS renderer (NOT drawtext or SVG logos).
 * Only public art-preview URLs from the verified gallery catalog may be used.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";

const W=1280, H=720;
const ART_PREVIEW_PREFIX="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/";
const BG="0x091321";
const MAX_BYTES=8*1024*1024;

function escapeAss(input:string) {
  return input.replace(/\\/g,"/").replace(/[{}]/g,"").replace(/[\r\n]+/g," ").trim();
}
function safeTitle(value:string) {
  const title=escapeAss(value).replace(/\s+/g," ").trim();
  return (title || "ART LOUNGE").slice(0,110);
}
export function splitArtLoungeTitle(value:string):string[] {
  const title=safeTitle(value).toUpperCase();
  // Respect explicit words; never silently replace owner's title with the
  // old baked-in ART LOUNGE 2026 artwork label.
  if(title.length<=17)return [title];
  const words=title.split(" "),lines:string[]=[];
  for(const word of words) {
    const last=lines.length-1;
    if(last>=0 && lines[last].length+1+word.length<=20)lines[last]+=" "+word;
    else if(lines.length<3)lines.push(word.slice(0,20));
    else {lines[2]=lines[2].slice(0,17)+"...";break;}
  }
  return lines;
}
export function artLoungeAss(title:string,footer="ART.FREDDYBREMSETH.COM  •  RE-MASTER FREDDY") {
  const lines=splitArtLoungeTitle(title);
  const events:string[]=[
    "Dialogue: 5,0:00:00.00,0:00:05.00,Tag,,0,0,0,,{\\an8\\pos(640,92)}RE-MASTER FREDDY",
    "Dialogue: 5,0:00:00.00,0:00:05.00,Footer,,0,0,0,,{\\an2\\pos(640,680)}"+escapeAss(footer),
  ];
  const fontSize=lines.length===1?(lines[0].length>13?69:84):lines.some(x=>x.length>16)?59:70;
  const gap=fontSize+18,start=355-((lines.length-1)*gap)/2;
  for(let i=0;i<lines.length;i++){
    const style=i===0?"Electric":"Gold";
    events.push(`Dialogue: 5,0:00:00.00,0:00:05.00,${style},,0,0,0,,{\\an5\\pos(640,${Math.round(start+i*gap)})\\fs${fontSize}}${escapeAss(lines[i])}`);
  }
  return [
    "[Script Info]","ScriptType: v4.00+","PlayResX: 1280","PlayResY: 720","WrapStyle: 2","ScaledBorderAndShadow: yes","",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Electric,DejaVu Sans,70,&H00FFE9B1,&H000000FF,&H00C77316,&H8A000000,-1,0,0,0,100,100,1,0,1,4,2,5,0,0,0,1",
    "Style: Gold,DejaVu Sans,70,&H0000C7FF,&H000000FF,&H00005DAE,&H8A000000,-1,0,0,0,100,100,1,0,1,4,2,5,0,0,0,1",
    "Style: Tag,DejaVu Sans,24,&H00FFFFFF,&H000000FF,&H009E5B22,&H80000000,-1,0,0,0,100,100,1,0,1,2,1,8,0,0,0,1",
    "Style: Footer,DejaVu Sans,24,&H00FFFFFF,&H000000FF,&H009E5B22,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,0,0,0,1",
    "","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,"",
  ].join("\n");
}
export function isApprovedArtPreviewUrl(url:string):boolean {
  try{const u=new URL(url);return u.origin==="https://ereapsfcsqtdmzosgnnn.supabase.co"
      && u.href.startsWith(ART_PREVIEW_PREFIX) && !u.username && !u.password
      && !/\.{2}|%2f|%5c/i.test(u.pathname);}
  catch{return false;}
}
async function fetchPreview(url:string,out:string) {
  if(!isApprovedArtPreviewUrl(url))throw new Error("Only published public art previews can be used for Art Lounge thumbnail.");
  const res=await fetch(url,{signal:AbortSignal.timeout(20_000),redirect:"error"});
  if(!res.ok)throw new Error("Published artwork preview was unavailable.");
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length<1024||bytes.length>MAX_BYTES)throw new Error("Artwork preview has an invalid size.");
  await fs.writeFile(out,bytes);
}
function ffmpeg(binary:string,args:string[],timeoutMs=60_000):Promise<void>{
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:["ignore","ignore","pipe"]});
    let err="",finished=false;
    const timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error("Art Lounge thumbnail render timed out"));},timeoutMs);
    const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve();};
    child.stderr.on("data",chunk=>{err=(err+chunk.toString()).slice(-2000);});
    child.once("error",error=>finish(error));
    child.once("close",code=>code===0?finish():finish(new Error("Art Lounge thumbnail FFmpeg: "+err.slice(-700))));
  });
}
function escPath(value:string){return value.replace(/\\/g,"\\\\").replace(/:/g,"\\:").replace(/'/g,"\\'");}
/** A 360x180 vinyl deck drawn without external PNG/SVG/fonts or extra URL inputs. */
export function buildArtLoungeVinylPPM():Buffer{
  const width=360,height=180;
  const pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const radius=Math.hypot(x-180,y-169);
    const groove=Math.floor(radius/4)%2===0;
    const color=radius<166
      ? radius<35?[177,103,40]
        :radius<44?[24,52,74]
        :groove?[19,36,51]:[8,17,26]
      :[7,16,24];
    const i=(y*width+x)*3;
    pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];
  }
  return Buffer.concat([Buffer.from("P6\n"+width+" "+height+"\n255\n","ascii"),pixels]);
}
export interface ArtLoungeThumbnailInput {
  title:string;
  imageUrls:string[];
  footer?:string;
}
export async function renderArtLoungeThumbnail(input:ArtLoungeThumbnailInput):Promise<Buffer>{
  const sources=[...new Set(input.imageUrls)].filter(isApprovedArtPreviewUrl);
  if(!sources.length)throw new Error("An approved public art preview is required for Art Lounge thumbnail.");
  const binary=await ensureFFmpeg();
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"art-lounge-thumbnail-"));
  try{
    const left=path.join(dir,"left.source"),right=path.join(dir,"right.source");
    await fetchPreview(sources[0],left);
    await fetchPreview(sources[1]||sources[0],right);
    const assFile=path.join(dir,"title.ass");
    await fs.writeFile(assFile,artLoungeAss(input.title,input.footer));
    const vinyl=path.join(dir,"vinyl.ppm");
    await fs.writeFile(vinyl,buildArtLoungeVinylPPM());
    const output=path.join(dir,"art-lounge.jpg");
    // Paintings remain fully inside their gallery frames; the title is
    // composited on a dark central panel. A graphic vinyl deck anchors
    // the lower right, echoing the owner's art/music lounge reference.
    const filter=[
      `[0:v]format=yuv420p,drawbox=x=0:y=0:w=${W}:h=${H}:color=${BG}:t=fill,drawbox=x=0:y=0:w=${W}:h=14:color=0x174572:t=fill,drawbox=x=0:y=600:w=${W}:h=120:color=0x071018:t=fill[base]`,
      "[1:v]scale=278:400:force_original_aspect_ratio=decrease,pad=278:400:(ow-iw)/2:(oh-ih)/2:color=0x0b1f30,setsar=1[artleft]",
      "[2:v]scale=278:400:force_original_aspect_ratio=decrease,pad=278:400:(ow-iw)/2:(oh-ih)/2:color=0x0b1f30,setsar=1[artright]",
      "[base]drawbox=x=18:y=105:w=290:h=412:color=0xf6a83b:t=8,drawbox=x=972:y=105:w=290:h=412:color=0xf6a83b:t=8[framed]",
      "[framed][artleft]overlay=24:111[one]",
      "[one][artright]overlay=978:111[two]",
      "[two]drawbox=x=324:y=151:w=631:h=385:color=0x07121d@0.92:t=fill,drawbox=x=340:y=167:w=598:h=350:color=0x1a354d@0.44:t=3,drawbox=x=0:y=614:w=1280:h=5:color=0xa9571c@0.86:t=fill[stage]",
      "[stage][3:v]overlay=460:555[deck]",
      `[deck]ass=filename='${escPath(assFile)}',format=yuv420p[vout]`,
    ].join(";");
    await ffmpeg(binary,[
      "-hide_banner","-loglevel","error",
      "-f","lavfi","-i",`color=c=${BG}:s=${W}x${H}:r=1`,
      "-i",left,"-i",right,"-i",vinyl,"-filter_complex",filter,"-map","[vout]",
      "-frames:v","1","-q:v","5","-update","1","-y",output,
    ]);
    const result=await fs.readFile(output);
    if(result.length<10_000||result.length>2_000_000)throw new Error("Art Lounge thumbnail must be a playable YouTube JPG <2MB.");
    return result;
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>undefined);}
}
