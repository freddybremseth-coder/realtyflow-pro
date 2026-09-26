import assert from "node:assert/strict";
import test from "node:test";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { DONA_ANNA_REEL_IMAGES } from "./remaster-reels-extra-brands";
import {
  buildPortfolioReelCaption,buildPortfolioReelTextFilters,isApprovedReelAudioUrl,isApprovedReelImageUrl,renderPortfolioReel,
} from "./remaster-portfolio-reels";

test("Reels Studio source guards accept only permanent Re-Master audio and brand-appropriate images",()=>{
  const audio="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3";
  assert.equal(isApprovedReelAudioUrl(audio),true);
  assert.equal(isApprovedReelAudioUrl("https://evil.example/song.mp3"),false);
  assert.equal(isApprovedReelImageUrl("https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/work/view.webp","art"),true);
  assert.equal(isApprovedReelImageUrl("https://books.freddybremseth.com/assets/covers/book.jpg","books"),true);
  assert.equal(isApprovedReelImageUrl("https://images.example-cdn.com/property.jpg","zeneco"),true);
  assert.equal(isApprovedReelImageUrl("http://127.0.0.1/private.jpg","zeneco"),false);
});
test("brand captions point to the correct site and explain what the viewer sees",()=>{
  const song={id:"s",title:"Sunset",audioUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3"};
  const art=buildPortfolioReelCaption({brand:"art",title:"Art Reel",durationSeconds:15,song,imageUrls:["x"],promotedItems:[
    {id:"a",title:"Golden Heart",imageUrl:"x",detailUrl:"https://art.freddybremseth.com/verk/a/"},
  ]});
  assert.match(art,/Golden Heart/);assert.match(art,/art\.freddybremseth\.com/);assert.match(art,/Re-Master Freddy/);
  const homes=buildPortfolioReelCaption({brand:"zeneco",title:"Homes",durationSeconds:15,song,imageUrls:["x","y"],areaQuery:"Benidorm",region:"north"});
  assert.match(homes,/Benidorm/);assert.match(homes,/zenecohomes\.com/);assert.match(homes,/Availability and prices can change/);
});
test("production FFmpeg renders a real 15-second 1080x1920 Reel with two approved art previews",{timeout:120_000},async()=>{
  assert.ok(ffmpegStatic);
  const exec=promisify(execFile),dir=await fs.mkdtemp(path.join(os.tmpdir(),"reel-render-test-"));
  const pic1=path.join(dir,"one.webp"),pic2=path.join(dir,"two.webp"),audioFile=path.join(dir,"song.mp3");
  const prior=globalThis.fetch;
  try{
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=480x640:rate=1","-frames:v","1","-y",pic1]);
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=640x480:rate=1","-vf","hflip","-frames:v","1","-y",pic2]);
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i","sine=frequency=330:duration=35","-c:a","libmp3lame","-y",audioFile]);
    const one=await fs.readFile(pic1),two=await fs.readFile(pic2),audio=await fs.readFile(audioFile);
    const audioUrl="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3";
    const image1="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/one/view.webp";
    const image2="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/two/view.webp";
    globalThis.fetch=async(input)=>{
      const url=String(input);
      const body=url===audioUrl?audio:url===image1?one:two;
      return new Response(body,{status:200,headers:{"content-length":String(body.length)}});
    };
    const result=await renderPortfolioReel({brand:"art",title:"Art Test Reel",durationSeconds:15,
      song:{id:"s",title:"Test Song",audioUrl},imageUrls:[image1,image2],
      promotedItems:[
        {id:"one",title:"One",imageUrl:image1,detailUrl:"https://art.freddybremseth.com/verk/one/"},
        {id:"two",title:"Two",imageUrl:image2,detailUrl:"https://art.freddybremseth.com/verk/two/"},
      ]});
    assert.ok(result.buffer.length>20_000);
    const out=path.join(dir,"out.mp4");await fs.writeFile(out,result.buffer);
    const probe=await exec(ffmpegStatic!,["-hide_banner","-i",out,"-f","null","-"]);
    assert.match(probe.stderr,/1080x1920/);
    assert.match(probe.stderr,/Duration: 00:00:15/);
  }finally{globalThis.fetch=prior;await fs.rm(dir,{recursive:true,force:true});}
});


test("portfolio Reel text overlays use an explicit font file and no ASS/SVG dependency",()=>{
  const song={id:"s",title:"Sunset",audioUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3"};
  const filters=buildPortfolioReelTextFilters({
    brand:"zeneco",title:"Costa Blanca homes",durationSeconds:15,song,imageUrls:["x","y"],
  },"/tmp/render-font.ttf");
  assert.match(filters,/fontfile='\/tmp\/render-font\.ttf'/);
  assert.match(filters,/ZEN ECO HOMES/);
  assert.match(filters,/COSTA BLANCA/);
  assert.doesNotMatch(filters,/ass=/);
  assert.doesNotMatch(filters,/\.svg/i);
});

test("six-brand Reels use their own images and destinations", () => {
  const song={id:"song",title:"Sunset",audioUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3"};
  const artImage="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/work/view.webp";
  const bookImage="https://books.freddybremseth.com/assets/covers/book.jpg";
  const pinosoImage="https://images.example-cdn.com/pinoso.jpg";
  assert.equal(isApprovedReelImageUrl(artImage,"freddybremseth"),true);
  assert.equal(isApprovedReelImageUrl(bookImage,"freddybremseth"),true);
  assert.equal(isApprovedReelImageUrl(pinosoImage,"pinosoecolife"),true);
  // Curated Doña Anna images must match the exact approved brand media list.
  assert.equal(isApprovedReelImageUrl(DONA_ANNA_REEL_IMAGES[0],"donaanna"),true);
  assert.equal(isApprovedReelImageUrl("https://evil.example/olive.jpg","donaanna"),false);
  for (const [brand,site] of [
    ["freddybremseth","freddybremseth.com"],
    ["pinosoecolife","pinosoecolife.com"],
    ["donaanna","donaanna.com"],
  ] as const) {
    const caption=buildPortfolioReelCaption({brand,title:"Brand reel",durationSeconds:15,song,
      imageUrls:[artImage,bookImage],areaQuery:brand==="pinosoecolife"?"Pinoso":""});
    assert.ok(caption.includes(site),brand);
    assert.ok(caption.includes("Re-Master Freddy"),brand);
    assert.ok(!caption.includes("https://zenecohomes.com/"),brand);
  }
});
