import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import {
  buildLoopedVisualFilter,
  renderRemasterLongFormMixV3,
  cleanupRemasterLongFormMixV3,
} from "./remaster-mix-video-v3";

const execFileAsync = promisify(execFile);

test("V3 filter graph burns Re-Master and ZenEcoHomes overlays into output", () => {
  const filter = buildLoopedVisualFilter(12, "/tmp/overlay.ass", 12, 13, 10, 1800);
  assert.match(filter, /\[12:v\]scale=240:-1/);
  assert.match(filter, /overlay=x=W-w-38:y=H-h-28/);
  assert.match(filter, /\[13:v\]split=2/);
  assert.match(filter, /scale=320:-1/);
  assert.match(filter, /scale=760:-1/);
  assert.match(filter, /between\(t,600\.000,610\.000\)/);
  assert.match(filter, /between\(t,1200\.000,1210\.000\)/);
  assert.match(filter, /ass=filename=/);
});

test("V3 renderer preserves duration with embedded ZenEcoHomes Presented by PNG", { timeout: 60_000 }, async () => {
  assert.ok(ffmpegPath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-v3-runtime-"));
  const images: string[] = [];
  const audioPath = path.join(dir, "audio.wav");
  const logoPath = path.join(dir, "logo.png");
  let result: Awaited<ReturnType<typeof renderRemasterLongFormMixV3>> | null = null;

  try {
    for (let i = 0; i < 12; i += 1) {
      const p = path.join(dir, `img-${i}.jpg`);
      await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i",`color=c=${i % 2 ? "white" : "black"}:s=640x360:d=0.1`,`-frames:v`,`1`,`-q:v`,`2`,`-y`,p]);
      images.push(p);
    }
    await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=s=400x200:d=0.1","-frames:v","1","-y",logoPath]);
    await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i","sine=frequency=440:duration=12","-c:a","pcm_s16le","-y",audioPath]);

    // Keep each static input segment at least one second. The production renderer
    // uses 1 fps for source stills, so sub-frame test segments are invalid and can
    // deadlock concat despite never occurring in real 30-minute jobs.
    result = await renderRemasterLongFormMixV3({
      audioPath,
      imageUrls: images,
      title: "runtime test",
      targetMinutes: 0.2,
      sponsorIntervalMinutes: 5,
      zenEcoHomesEnabled: true,
      logoUrl: `file://${logoPath}`,
      audioDurationSeconds: 12,
    });

    assert.ok(result.durationSeconds >= 11.5 && result.durationSeconds <= 12.5, `unexpected duration ${result.durationSeconds}`);
    assert.equal(result.imageCount, 12);
    const stat = await fs.stat(result.videoPath);
    assert.ok(stat.size > 1024);
  } finally {
    if (result) await cleanupRemasterLongFormMixV3(result);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
