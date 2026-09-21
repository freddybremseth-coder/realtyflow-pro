import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import {
  publicBookCoverUrl, selectApprovedPromotionItems, type PromotionItem,
} from "./remaster-mix-promotions";
import { buildMixDescription, buildMixTags, buildMixPartnerComment } from "./remaster-mix-planner";
import { buildConcatVisualFilterV4, renderRemasterLongFormMixV4, cleanupRemasterLongFormMixV4 } from "./remaster-mix-video-v4";
import { buildRemasterMixGlobalAssOverlay } from "./remaster-mix-video-compat";

const art:PromotionItem[]=[
  {id:"painting-1",title:"Portrait",style:"symbolic-realism",collection:"human-condition",imageUrl:"https://example.com/a",detailUrl:"https://art.freddybremseth.com/verk/painting-1/"},
  {id:"painting-2",title:"Landscape",style:"landscape",collection:"mediterranean-soul",imageUrl:"https://example.com/b",detailUrl:"https://art.freddybremseth.com/verk/painting-2/"},
  {id:"painting-3",title:"Another",style:"symbolic-realism",collection:"human-condition",imageUrl:"https://example.com/c",detailUrl:"https://art.freddybremseth.com/verk/painting-3/"},
];

test("art selection restricts randomized visuals to explicitly allowed styles, collections and items",()=>{
  const input={brand:"art" as const,artStyles:["symbolic-realism"],artCollections:["human-condition"],
    artIds:["painting-1","painting-3"],randomSeed:"mix-001"};
  const first=selectApprovedPromotionItems(art,input,24);
  assert.equal(first.length,24);
  assert.ok(first.every(item=>item.style==="symbolic-realism"&&input.artIds.includes(item.id)));
  assert.deepEqual(first,selectApprovedPromotionItems(art,input,24));
  assert.equal(selectApprovedPromotionItems(art,{...input,artStyles:["landscape"]},24).length,0);
});

test("books selection never inserts another series or unchosen book",()=>{
  const books:PromotionItem[]=[
    {id:"b1",title:"A",series:"michael-thorne",language:"en",imageUrl:"https://example.com/1",detailUrl:"https://books.freddybremseth.com/book/a"},
    {id:"b2",title:"B",series:"elias-holm",language:"no",imageUrl:"https://example.com/2",detailUrl:"https://books.freddybremseth.com/book/b"},
  ];
  const selected=selectApprovedPromotionItems(books,{brand:"books",bookSeries:["michael-thorne"],bookIds:["b1"],randomSeed:"mix-002"},24);
  assert.equal(selected.length,24);
  assert.ok(selected.every(item=>item.id==="b1"));
});

test("book cover URLs reject private, arbitrary or unsafe file references",()=>{
  assert.equal(publicBookCoverUrl("assets/covers/the-book.jpg"),"https://books.freddybremseth.com/assets/covers/the-book.jpg");
  for(const input of ["javascript:alert(1)","https://evil.example/cover.png","../secret.pdf","assets/covers/../../master.png","https://books.freddybremseth.com@evil.example/cover.png"]) {
    assert.equal(publicBookCoverUrl(input),null);
  }
});

test("brand descriptions and tags never advertise ZenEcoHomes inside art/books mix",()=>{
  for(const brand of ["art","books"] as const){
    const detailUrl=brand==="art"?"https://art.freddybremseth.com/verk/painting-1/":"https://books.freddybremseth.com/book/a";
    const description=buildMixDescription({title:"My Mix",style:"morning-chill",tracks:[],
      crossfadeSeconds:8,zenEcoHomesEnabled:false,promotionBrand:brand,
      promotedItems:[{title:"Featured",detailUrl}],
    });
    assert.ok(description.includes(detailUrl));
    assert.ok(!description.includes("ZenEcoHomes"));
    assert.ok(!buildMixTags("morning-chill",brand).includes("ZenEcoHomes"));
    assert.ok(buildMixPartnerComment(brand).includes(brand==="art"?"art.freddybremseth.com":"books.freddybremseth.com"));
  }
});

test("art/book visual mode contains complete landscape or portrait images rather than cropping",()=>{
  const filter=buildConcatVisualFilterV4(null,null,null,10,1800,"contain");
  assert.match(filter,/force_original_aspect_ratio=decrease/);
  assert.match(filter,/pad=1920:1080/);
  assert.doesNotMatch(filter,/crop=1920:1080/);
});
test("partner video overlay names correct brand and remains separate from Re-Master credit",()=>{
  const ass=buildRemasterMixGlobalAssOverlay({durationSeconds:1800,
    sponsorIntervalMinutes:10,zenEcoHomesEnabled:false,promotionBrand:"books",
    ctaText:"Visit books.freddybremseth.com"});
  assert.match(ass,/RE-MASTER FREDDY/);
  assert.match(ass,/Presented by Freddy Bremseth Books/);
  assert.match(ass,/books.freddybremseth.com/);
  assert.doesNotMatch(ass,/ZenEcoHomes/);
});

test("actual ffmpeg-static renders portrait book-cover and art-preview mixes with contain, normalized images and matching brand", {timeout:120_000}, async (t) => {
  assert.ok(ffmpegStatic, "FFmpeg static must be installed");
  const exec = promisify(execFile);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"remaster-cross-brand-test-"));
  const portrait=path.join(tmp,"portrait.png"), audio=path.join(tmp,"audio.wav");
  try {
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "color=c=0x7760a2:s=480x720:r=1","-frames:v","1","-update","1","-y",portrait]);
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "sine=frequency=330:duration=16","-c:a","pcm_s16le","-y",audio]);
    for(const brand of ["art","books"] as const) {
      const result=await renderRemasterLongFormMixV4({
        audioPath:audio,imageUrls:Array(12).fill(portrait),title:"Cross Brand Preview",
        targetMinutes:16/60,sponsorIntervalMinutes:5,ctaText:brand==="art"
          ?"Explore art.freddybremseth.com":"Explore books.freddybremseth.com",
        promotionBrand:brand,zenEcoHomesEnabled:false,logoUrl:"/does-not-exist.png",
        audioDurationSeconds:16,abortSignal:t.signal,
      });
      try {
        assert.equal(result.imageCount,12);
        assert.ok(result.durationSeconds>=15.5&&result.durationSeconds<=16.5);
        const stat=await fs.stat(result.videoPath);
        assert.ok(stat.size>10_000,"Expected playable encoded MP4");
      } finally {await cleanupRemasterLongFormMixV4(result);}
    }
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});

test("historical corrupt PNG branding must not strand a 30-minute mix at 18 percent", { timeout:120_000 }, async (t) => {
  assert.ok(ffmpegStatic,"Production FFmpeg binary required");
  const exec=promisify(execFile);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"remaster-corrupt-logo-regression-"));
  const image=path.join(tmp,"clean.png");
  const audio=path.join(tmp,"music.wav");
  const corruptLogo=path.join(tmp,"presented-by-broken.png");
  try {
    await fs.writeFile(corruptLogo,Buffer.alloc(4096,0x33));
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "color=c=0x415b89:s=320x180:r=1","-frames:v","1","-update","1","-y",image]);
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "sine=frequency=330:duration=16","-c:a","pcm_s16le","-y",audio]);
    for(const brand of ["art","books","zeneco"] as const) {
      const finished=await renderRemasterLongFormMixV4({
        audioPath:audio,imageUrls:Array(12).fill(image),title:"Corrupt sponsor logo regression",
        targetMinutes:16/60,sponsorIntervalMinutes:5,ctaText:"Explore our portfolio",
        promotionBrand:brand,zenEcoHomesEnabled:brand==="zeneco",
        logoUrl:corruptLogo,zenEcoLogoUrl:image,audioDurationSeconds:16,
        abortSignal:t.signal,
      });
      try {
        assert.ok(finished.durationSeconds>=15.5 && finished.durationSeconds<=16.5);
        assert.ok((await fs.stat(finished.videoPath)).size>10_000);
      } finally {await cleanupRemasterLongFormMixV4(finished);}
    }
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});
