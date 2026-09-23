import assert from "node:assert/strict";
import test from "node:test";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import {
  buildReelCaption,isApprovedReelAudio,isApprovedReelVisual,renderRemasterReel,
} from "./remaster-reels";

test("reel source guards allow only canonical Re-Master audio and owner sources",()=>{
  assert.equal(isApprovedReelAudio("https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3"),true);
  assert.equal(isApprovedReelAudio("https://evil.example/song.mp3"),false);
  assert.equal(isApprovedReelVisual("https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/work/view.webp","art"),true);
  assert.equal(isApprovedReelVisual("https://books.freddybremseth.com/assets/covers/book.jpg","books"),true);
  assert.equal(isApprovedReelVisual("https://example.com/property.jpg","zeneco"),true);
  assert.equal(isApprovedReelVisual("http://127.0.0.1/private.jpg","zeneco"),false);
});
test("captions explain what is shown and where it can be found",()=>{
  const art=buildReelCaption({brand:"art",songTitle:"Blue Hour",visuals:[{
    id:"a",title:"Stillness in Gold",imageUrl:"x",detailUrl:"https://art.freddybremseth.com/verk/stillness-in-gold/",
  }]});
  assert.match(art,/Stillness in Gold/);assert.match(art,/art\.freddybremseth\.com/);assert.match(art,/Re-Master Freddy/);
  const home=buildReelCaption({brand:"zeneco",songTitle:"Blue Hour",areaLabel:"Finestrat",visuals:[]});
  assert.match(home,/Finestrat/);assert.match(home,/zenecohomes\.com/);assert.match(home,/Availability, prices/);
});
test("production FFmpeg renders an actual 15 second 1080x1920 Art Reel",{timeout:120_000},async()=>{
  assert.ok(ffmpegStatic);
  const exec=promisify(execFile);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"remaster-reel-test-"));
  const image=path.join(tmp,"image.webp"),audio=path.join(tmp,"audio.mp3");
  const prior=globalThis.fetch;
  try{
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=640x480:rate=1","-frames:v","1","-y",image]);
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i","sine=frequency=320:duration=25","-c:a","libmp3lame","-y",audio]);
    const img=await fs.readFile(image),snd=await fs.readFile(audio);
    globalThis.fetch=async(input)=>{
      const url=String(input);
      return new Response(url.endsWith(".mp3")?snd:img,{status:200});
    };
    const audioUrl="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/test.mp3";
    const visuals=[0,1,2].map(i=>({
      id:"work-"+i,title:"Work "+i,
      imageUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/work-"+i+"/view.webp",
      detailUrl:"https://art.freddybremseth.com/verk/work-"+i+"/",
    }));
    const video=await renderRemasterReel({brand:"art",title:"Art Lounge",durationSeconds:15,audioUrl,songTitle:"Blue Hour",visuals});
    assert.equal(video.toString("ascii",4,8),"ftyp");
    assert.ok(video.length>20_000);
    const out=path.join(tmp,"reel.mp4");await fs.writeFile(out,video);
    let stderr="";
    try{await exec(ffmpegStatic!,["-hide_banner","-i",out,"-f","null","-"]);}catch(e:any){stderr=e.stderr||"";}
    if(!stderr){const result=await exec(ffmpegStatic!,["-hide_banner","-i",out,"-f","null","-"]);stderr=result.stderr||"";}
    assert.match(stderr,/1080x1920/);
    assert.match(stderr,/Duration: 00:00:15/);
  }finally{globalThis.fetch=prior;await fs.rm(tmp,{recursive:true,force:true});}
});
