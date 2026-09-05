import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import { renderRemasterLongFormMixV3, cleanupRemasterLongFormMixV3 } from "./remaster-mix-video-v3";

const execFileAsync = promisify(execFile);

test("V3 renderer preserves full duration across multiple images", async () => {
  assert.ok(ffmpegPath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-v3-runtime-"));
  const images: string[] = [];
  const audioPath = path.join(dir, "audio.wav");
  let result: Awaited<ReturnType<typeof renderRemasterLongFormMixV3>> | null = null;

  try {
    for (let i = 0; i < 12; i += 1) {
      const p = path.join(dir, `img-${i}.jpg`);
      await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i",`color=c=${i % 2 ? "white" : "black"}:s=640x360:d=0.1`,`-frames:v`,`1`,`-q:v`,`2`,`-y`,p]);
      images.push(p);
    }
    await execFileAsync(ffmpegPath, ["-hide_banner","-loglevel","error","-f","lavfi","-i","sine=frequency=440:duration=3","-c:a","pcm_s16le","-y",audioPath]);

    result = await renderRemasterLongFormMixV3({
      audioPath,
      imageUrls: images,
      title: "runtime test",
      targetMinutes: 0.05,
      sponsorIntervalMinutes: 5,
      zenEcoHomesEnabled: false,
      audioDurationSeconds: 3,
    });

    assert.ok(result.durationSeconds >= 2.5 && result.durationSeconds <= 3.5, `unexpected duration ${result.durationSeconds}`);
    assert.equal(result.imageCount, 12);
    const stat = await fs.stat(result.videoPath);
    assert.ok(stat.size > 1024);
  } finally {
    if (result) await cleanupRemasterLongFormMixV3(result);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
