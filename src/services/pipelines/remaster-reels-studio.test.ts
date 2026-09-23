import assert from "node:assert/strict";
import test from "node:test";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import {assertStudioReelSources,isApprovedStudioReelImage,renderStudioReel,reelStudioCaption,type StudioReelInput} from "./remaster-reels-studio";
import {selectStudioProperties} from "./remaster-reels-property-catalog";

const song={id:"song-one",title:"Evening Glow",audioUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3",
  youtubeUrl:"https://www.youtube.com/watch?v=abc123def45"};
const art={id:"hope",title:"Hope, Pain and Love",
  imageUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/hope/view.webp",
  detailUrl:"https://art.freddybremseth.com/verk/hope/"};
const book={id:"book-one",title:"The Facade of Justice",
  imageUrl:"https://books.freddybremseth.com/assets/covers/facade.jpg",
  detailUrl:"https://books.freddybremseth.com/book/the-facade-of-justice"};
const property={id:"property-1",title:"Villa in Benidorm",
  imageUrl:"https://fotos15.apinmo.com/7515/19293751/1-1.jpg",detailUrl:""};

test("Reels Studio caption includes only owner-selected works, actual song and correct destination",()=>{
  const input:StudioReelInput={brand:"art",durationSeconds:20,title:"Art and Champagne",
    song,visuals:[art]};
  const caption=reelStudioCaption(input);
  assert.match(caption,/Art and Champagne/);assert.match(caption,/Hope, Pain and Love/);
  assert.match(caption,/https:\/\/art.freddybremseth.com\/verk\/hope\//);
  assert.match(caption,/Evening Glow/);
  assert.doesNotMatch(caption,/zenecohomes|books\.freddybremseth/i);
  const books=reelStudioCaption({...input,brand:"books",visuals:[book]});
  assert.match(books,/The Facade of Justice/);assert.match(books,/books.freddybremseth.com/);
  const inland=reelStudioCaption({...input,brand:"pinoso",area:"Pinoso",visuals:[property]});
  assert.match(inland,/Pinoso EcoLife in Pinoso/);
  assert.match(inland,/availability and prices may change/);
  assert.doesNotMatch(inland,/zenecohomes|art.freddybremseth.com/i);
});
test("Reel only accepts public approved art/books/properties and canonical song source",()=>{
  const input:StudioReelInput={brand:"art",durationSeconds:15,title:"Art",song,visuals:[art]};
  assert.doesNotThrow(()=>assertStudioReelSources(input));
  assert.equal(isApprovedStudioReelImage(art.imageUrl,"art"),true);
  assert.equal(isApprovedStudioReelImage(book.imageUrl,"books"),true);
  assert.equal(isApprovedStudioReelImage(property.imageUrl,"zeneco"),true);
  for(const url of ["http://127.0.0.1/1.jpg","https://evil.example/1.jpg","file:///etc/passwd",
    "https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/private/art-originals/hope/master.png"]){
    assert.equal(isApprovedStudioReelImage(url,"art"),false);
    assert.equal(isApprovedStudioReelImage(url,"zeneco"),false);
  }
  assert.throws(()=>assertStudioReelSources({...input,
    song:{...song,audioUrl:"https://evil.example/music.mp3"}}),/REEL_SONG_NEEDS_PUBLIC/);
});
test("Property area selector never mixes towns or unpublished/hidden houses or outside brand",()=>{
  const rows=[
    {id:"d557a86c-27c5-472e-9b90-55149d2a32c8",title:"Benidorm Villa",town:"Benidorm",
      primary_image:property.imageUrl,website_visible:true,show_on_website:true},
    {id:"1f8dc752-21a2-45f2-bb9b-2d772b11acf4",title:"Altea Villa",town:"Altea",
      primary_image:property.imageUrl,website_visible:true,show_on_website:true},
    {id:"eec7a64b-509f-4aec-b1a1-44e3c981c870",title:"Benidorm hidden",town:"Benidorm",
      primary_image:property.imageUrl,website_visible:false},
    {id:"59348701-1419-472e-b984-1f937ca9dd63",title:"Benidorm SSRF",town:"Benidorm",
      primary_image:"https://localhost/hidden.jpg"},
  ];
  const catalog=selectStudioProperties(rows,"zeneco","benidorm");
  assert.deepEqual(catalog.properties.map(x=>x.title),["Benidorm Villa"]);
  assert.deepEqual(catalog.areas,["Altea","Benidorm"]);
});
test("actual production FFmpeg generates valid 1080x1920 MP4 for an area-specific Reel",{timeout:150_000},async()=>{
  assert.ok(ffmpegStatic);
  const exec=promisify(execFile),tmp=await fs.mkdtemp(path.join(os.tmpdir(),"reel-studio-test-"));
  const jpeg=path.join(tmp,"visual.jpg"),audio=path.join(tmp,"song.mp3");
  const prior=globalThis.fetch;
  try{
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "testsrc2=size=600x800:rate=1","-frames:v","1","-update","1","-y",jpeg]);
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "sine=frequency=420:duration=17","-c:a","libmp3lame","-y",audio]);
    const image=await fs.readFile(jpeg),music=await fs.readFile(audio);
    globalThis.fetch=async (uri:any)=>new Response(String(uri).endsWith(".mp3")?music:image,
      {status:200,headers:{"content-length":String(String(uri).endsWith(".mp3")?music.length:image.length)}});
    const video=await renderStudioReel({brand:"zeneco",durationSeconds:15,title:"Benidorm Villas",
      song,visuals:[property],area:"Benidorm"});
    assert.ok(video.length>20_000);
    assert.equal(video.toString("ascii",4,8),"ftyp");
    const output=path.join(tmp,"reel.mp4");
    await fs.writeFile(output,video);
    const probe=await exec(ffmpegStatic!,["-hide_banner","-i",output,"-f","null","-"]);
    assert.match(probe.stderr,/1080x1920/);
    assert.match(probe.stderr,/Duration: 00:00:15/);
  }finally{globalThis.fetch=prior;await fs.rm(tmp,{recursive:true,force:true});}
});
