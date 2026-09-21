import assert from "node:assert/strict";
import test from "node:test";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import {
  artLoungeAss,isApprovedArtPreviewUrl,renderArtLoungeThumbnail,splitArtLoungeTitle,
} from "./remaster-mix-art-thumbnail";

test("dynamic thumbnail keeps the exact video or playlist title, never baked-in Art Lounge 2026",()=>{
  assert.deepEqual(splitArtLoungeTitle("Stillness in Gold"),["STILLNESS IN GOLD"]);
  assert.deepEqual(splitArtLoungeTitle("Art Lounge 2026"),["ART LOUNGE 2026"]);
  assert.match(artLoungeAss("Stillness in Gold"),/STILLNESS IN GOLD/);
  assert.doesNotMatch(artLoungeAss("Stillness in Gold"),/ART LOUNGE 2026/);
  assert.ok(splitArtLoungeTitle("A Very Long Artistic Music Playlist For Relaxing at Home").every(line=>line.length<=20));
});
test("only safe public gallery previews can be used as thumbnail art",()=>{
  const base="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/a/view.webp";
  assert.equal(isApprovedArtPreviewUrl(base),true);
  for(const invalid of [
    "https://evil.example/view.webp","file:///etc/passwd",
    "https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/private/art-originals/a/view.webp",
    "https://ereapsfcsqtdmzosgnnn.supabase.co.evil.example/storage/v1/object/public/art-previews/a/view.webp",
    "https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/../private/original.jpg",
  ]) assert.equal(isApprovedArtPreviewUrl(invalid),false);
});
test("bundled production FFmpeg builds actual JPEG with dynamically set Art Lounge title and approved paintings",{timeout:120_000},async()=>{
  assert.ok(ffmpegStatic);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"art-thumb-test-"));
  const picture=path.join(tmp,"picture.jpg");
  const exec=promisify(execFile);
  const prior=globalThis.fetch;
  try{
    await exec(ffmpegStatic!,["-hide_banner","-loglevel","error","-f","lavfi","-i",
      "testsrc2=size=640x480:rate=1","-frames:v","1","-update","1","-y",picture]);
    const data=await fs.readFile(picture);
    const url="https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/approved/view.webp";
    globalThis.fetch=async()=>new Response(data,{status:200,headers:{"content-type":"image/jpeg"}});
    const result=await renderArtLoungeThumbnail({title:"Stillness in Gold",imageUrls:[url]});
    assert.equal(result[0],0xff);assert.equal(result[1],0xd8);
    assert.ok(result.length>10_000 && result.length<2_000_000);
    const output=path.join(tmp,"youtube-thumb.jpg");
    await fs.writeFile(output,result);
    const probe=await exec(ffmpegStatic!,["-hide_banner","-i",output,"-f","null","-"]);
    assert.match(probe.stderr,/1280x720/);
  }finally{globalThis.fetch=prior;await fs.rm(tmp,{recursive:true,force:true});}
});
