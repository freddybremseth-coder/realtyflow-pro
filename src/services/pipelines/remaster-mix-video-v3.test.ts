import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import {
  buildConcatVisualFilterV4,
  renderRemasterLongFormMixV4,
  cleanupRemasterLongFormMixV4,
} from "./remaster-mix-video-v4";

const execFileAsync = promisify(execFile);

test("V4 filter graph burns ASS branding into the single-pass slideshow", () => {
  const filter = buildConcatVisualFilterV4("/tmp/overlay.ass");
  assert.match(filter, /^\[0:v\]fps=6/);
  assert.match(filter, /scale=1920:1080/);
  assert.match(filter, /ass=filename=/);
  assert.match(filter, /format=yuv420p\[vout\]/);
  assert.doesNotMatch(filter, /overlay=/);
  assert.doesNotMatch(filter, /png/i);
});

test("V4 renderer preserves duration without PNG branding inputs", { timeout: 60_000 }, async (t) => {
  assert.ok(ffmpegPath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-v4-runtime-"));
  const images: string[] = [];
  const audioPath = path.join(dir, "audio.wav");
  let result: Awaited<ReturnType<typeof renderRemasterLongFormMixV4>> | null = null;

  try {
    for (let i = 0; i < 12; i += 1) {
      const p = path.join(dir, `img-${i}.jpg`);
      await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i",`color=c=${i % 2 ? "white" : "black"}:s=640x360:d=0.1`,`-frames:v`,`1`,`-q:v`,`2`,`-y`,p]);
      images.push(p);
    }
    await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i","sine=frequency=440:duration=24","-c:a","pcm_s16le","-y",audioPath]);

    result = await renderRemasterLongFormMixV4({
      audioPath,
      imageUrls: images,
      title: "runtime test",
      targetMinutes: 0.4,
      sponsorIntervalMinutes: 5,
      zenEcoHomesEnabled: true,
      ctaText: "Explore Costa Blanca at ZenEcoHomes.com",
      audioDurationSeconds: 24,
      abortSignal: t.signal,
    });

    assert.ok(result.durationSeconds >= 23.5 && result.durationSeconds <= 24.5, `unexpected duration ${result.durationSeconds}`);
    assert.equal(result.imageCount, 12);
    const stat = await fs.stat(result.videoPath);
    assert.ok(stat.size > 1024);
  } finally {
    if (result) await cleanupRemasterLongFormMixV4(result);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
