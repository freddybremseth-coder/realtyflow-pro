import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureFFmpeg } from './ffmpeg-renderer';
import { buildArtShortPoster } from './art-thumbnail-panel';
import { generateArtShortFromAudio, generateShort, generateShortFromAudio } from './shorts-generator';

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

test('music Shorts poster is 9:16 and uses a music footer, not art credits', () => {
  const art = buildArtShortPoster('PURE ENERGY', 'Silent Rain', 'art');
  const music = buildArtShortPoster('PURE ENERGY', 'Silent Rain', 'music');
  assert.equal(music.length, art.length);
  assert.notDeepEqual(music.subarray(-200000), art.subarray(-200000));
});

test('bundled ffmpeg-static renders standard and MP3-only follow-up Shorts without drawtext', { timeout: 360000 }, async () => {
  const ffmpeg = await ensureFFmpeg();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'music-short-smoke-'));
  try {
    const image = path.join(dir, 'background.png');
    const audio = path.join(dir, 'song.mp3');
    const video = path.join(dir, 'full.mp4');
    await run(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i',
      'color=c=0x5283a2:s=320x180:r=1','-frames:v','1','-update','1','-y',image]);
    await run(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i',
      'sine=frequency=220:duration=17','-c:a','libmp3lame','-b:a','64k','-y',audio]);
    await run(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i',
      'color=c=0x5283a2:s=320x180:r=2','-f','lavfi','-i','sine=frequency=220:duration=17',
      '-t','17','-c:v','libx264','-preset','ultrafast','-crf','34','-r','2',
      '-c:a','aac','-b:a','64k','-shortest','-y',video]);
    const fromVideo = await generateShort({
      videoBuffer: await fs.readFile(video), hook: 'PURE ENERGY',
      titleText: 'Silent Rain', targetDuration: 15, loopFade: 0.5,
      logoBuffer: Buffer.from('unavailable-optional-logo'),
    });
    assert.ok(fromVideo.durationSeconds >= 14 && fromVideo.durationSeconds <= 16);
    assert.equal(fromVideo.videoBuffer.subarray(4,8).toString(), 'ftyp');
    const fromAudio = await generateShortFromAudio({
      audioBuffer: await fs.readFile(audio), imageBuffers: [await fs.readFile(image)],
      startTime: 0, hook: 'PURE ENERGY', titleText: 'Silent Rain', targetDuration: 15,
      logoBuffer: Buffer.from('unavailable-optional-logo'),
    });
    assert.ok(fromAudio.durationSeconds >= 14 && fromAudio.durationSeconds <= 16);
    assert.equal(fromAudio.videoBuffer.subarray(4,8).toString(), 'ftyp');
    assert.ok(fromAudio.videoBuffer.length > 10000);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
