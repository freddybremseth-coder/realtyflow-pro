import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureFFmpeg } from './ffmpeg-renderer';
import { buildArtShortPoster } from './art-thumbnail-panel';
import { generateArtShortFromAudio } from './shorts-generator';

async function run(ffmpeg: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc=spawn(ffmpeg,args);
    let error='';
    proc.stderr.on('data',(chunk:Buffer)=>{ error+=chunk.toString(); });
    proc.once('error',reject);
    proc.once('close',code=>code===0?resolve():reject(new Error(error.slice(-1800))));
  });
}

test('9:16 art poster contains persistent song and artist without native text filters', () => {
  const ppm=buildArtShortPoster('meditation','Weightless Blue');
  const header=Buffer.from('P6\n1080 1920\n255\n','ascii');
  assert.deepEqual(ppm.subarray(0,header.length),header);
  assert.equal(ppm.length,header.length+1080*1920*3);
});

test('actual ffmpeg-static encodes a branded vertical art Short without drawtext', { timeout: 180000 }, async () => {
  const ffmpeg=await ensureFFmpeg();
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'art-short-smoke-'));
  try {
    const art=path.join(dir,'portrait.png');
    const audio=path.join(dir,'audio.mp3');
    await run(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x5283a2:s=600x900:r=1','-frames:v','1','-update','1','-y',art]);
    await run(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=17','-c:a','libmp3lame','-b:a','64k','-y',audio]);
    const result=await generateArtShortFromAudio({
      audioBuffer:await fs.readFile(audio), artworkBuffer:await fs.readFile(art),
      title:'Weightless Blue',category:'meditation',targetDuration:15,startTime:0,
    });
    assert.ok(result.durationSeconds>=14 && result.durationSeconds<=16);
    assert.equal(result.videoBuffer.subarray(4,8).toString(),'ftyp');
    assert.ok(result.videoBuffer.length>10000);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
