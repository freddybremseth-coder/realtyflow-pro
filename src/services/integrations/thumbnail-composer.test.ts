import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeThumbnail, composeThumbnailVariants } from './thumbnail-composer';
import { ensureFFmpeg } from './ffmpeg-renderer';

async function makePortraitArt(): Promise<Buffer> {
  const ffmpeg = await ensureFFmpeg();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'remaster-art-smoke-'));
  const output = path.join(dir, 'portrait.png');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
        '-i', 'color=c=0x4193b8:s=900x1200:r=1', '-frames:v', '1', '-update', '1', '-y', output,
      ]);
      let err = '';
      child.stderr.on('data', (data: Buffer) => { err += data.toString(); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(err)));
    });
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('Meditation painting composes a branded 1280x720 image without an external logo', { timeout: 90000 }, async () => {
  const source = await makePortraitArt();
  const png = await composeThumbnail({
    backgroundBuffer: source,
    artworkMode: true,
    hook: 'MEDITATION',
    brand: 'RE-MASTER FREDDY',
    titleText: 'Weightless Blue',
    // A broken optional logo must never prevent an artwork thumbnail.
    logoBuffer: Buffer.from('not an image'),
  });
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1280);
  assert.equal(png.readUInt32BE(20), 720);
  assert.ok(png.length < 2 * 1024 * 1024);
});

test('meditation variant generation creates branded thumbnails for a long song title', { timeout: 90000 }, async () => {
  const source = await makePortraitArt();
  const result = await composeThumbnailVariants([source], [{ hook: 'MEDITATION', accentColor: 'b7d5cb' }], {
    artworkMode: true,
    titleText: 'A Very Long Meditation Soundscape from the Gallery',
    brand: 'RE-MASTER FREDDY',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].readUInt32BE(16), 1280);
  assert.equal(result[0].readUInt32BE(20), 720);
});
