import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import {
  buildRemasterMixAssOverlay,
  buildRemasterMixGlobalAssOverlay,
  buildVisualConcatFile,
} from "./remaster-mix-video";

const execFileAsync = promisify(execFile);

test("ASS overlay contains CTA without duplicate sponsor branding", () => {
  const overlay = buildRemasterMixAssOverlay({
    durationSeconds: 12.5,
    sponsorSlide: true,
    ctaText: "Dreaming of a home in Spain? Explore Costa Blanca at ZenEcoHomes.com",
    zenEcoHomesEnabled: true,
  });

  assert.match(overlay, /ZenEcoHomes\.com/);
  assert.match(overlay, /Dreaming of a home in Spain/);
  assert.doesNotMatch(overlay, /Presented by ZenEcoHomes\.com/);
  assert.doesNotMatch(overlay, /drawtext/);
});

test("global ASS overlay schedules recurring CTA while image lockup owns sponsor branding", () => {
  const overlay = buildRemasterMixGlobalAssOverlay({
    durationSeconds: 1300,
    sponsorIntervalMinutes: 10,
    ctaText: "Explore Costa Blanca at ZenEcoHomes.com",
    zenEcoHomesEnabled: true,
  });

  assert.match(overlay, /ZenEcoHomes\.com/);
  assert.match(overlay, /0:10:00\.00/);
  assert.match(overlay, /0:20:00\.00/);
  assert.match(overlay, /Explore Costa Blanca/);
  assert.doesNotMatch(overlay, /Presented by ZenEcoHomes\.com/);
  assert.doesNotMatch(overlay, /drawtext/);
});

test("visual concat manifest uses durations and repeats final frame", () => {
  const manifest = buildVisualConcatFile(["/tmp/a.jpg", "/tmp/b.jpg", "/tmp/c.jpg"], 4.25);
  assert.match(manifest, /^ffconcat version 1\.0/m);
  assert.equal((manifest.match(/duration 4\.250000/g) || []).length, 3);
  assert.equal((manifest.match(/file '\/tmp\/c\.jpg'/g) || []).length, 2);
  assert.doesNotMatch(manifest, /segment-\d+\.ts/);
});

test("production ffmpeg-static build can render ASS overlays", async () => {
  assert.ok(ffmpegPath, "ffmpeg-static did not provide a binary path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-ass-overlay-test-"));
  const assPath = path.join(dir, "overlay.ass");

  try {
    await fs.writeFile(
      assPath,
      buildRemasterMixAssOverlay({
        durationSeconds: 0.5,
        sponsorSlide: true,
        ctaText: "ZenEcoHomes Costa Blanca",
        zenEcoHomesEnabled: true,
      }),
      "utf8",
    );

    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-f", "lavfi",
        "-i", "color=c=black:s=320x180:r=6:d=0.5",
        "-vf", `ass=filename='${assPath}'`,
        "-frames:v", "2",
        "-f", "null",
        "-",
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("production ffmpeg-static can build a single-pass slideshow MP4 without TS segments", async () => {
  assert.ok(ffmpegPath, "ffmpeg-static did not provide a binary path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-single-pass-test-"));
  const imagePaths = [0, 1, 2].map((index) => path.join(dir, `visual-${index}.jpg`));
  const concatPath = path.join(dir, "visuals.ffconcat");
  const assPath = path.join(dir, "overlay.ass");
  const audioPath = path.join(dir, "audio.wav");
  const outputPath = path.join(dir, "mix.mp4");

  try {
    for (let index = 0; index < imagePaths.length; index += 1) {
      await execFileAsync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi",
        "-i", `color=c=${index === 0 ? "black" : index === 1 ? "gray" : "white"}:s=640x360:d=0.1`,
        "-frames:v", "1",
        "-q:v", "3",
        "-y", imagePaths[index],
      ]);
    }

    await execFileAsync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi",
      "-i", "sine=frequency=440:duration=1.5",
      "-c:a", "pcm_s16le",
      "-y", audioPath,
    ]);

    await fs.writeFile(concatPath, buildVisualConcatFile(imagePaths, 0.5), "utf8");
    await fs.writeFile(
      assPath,
      buildRemasterMixGlobalAssOverlay({
        durationSeconds: 1.5,
        sponsorIntervalMinutes: 5,
        ctaText: "ZenEcoHomes Costa Blanca",
        zenEcoHomesEnabled: true,
      }),
      "utf8",
    );

    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", concatPath,
        "-i", audioPath,
        "-t", "1.5",
        "-vf", `fps=6,scale=640:360:force_original_aspect_ratio=increase,crop=640:360,ass=filename='${assPath}',format=yuv420p`,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart",
        "-y", outputPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );

    const stat = await fs.stat(outputPath);
    assert.ok(stat.size > 1024, "single-pass MP4 was not created");
    const names = await fs.readdir(dir);
    assert.equal(names.some((name) => name.endsWith(".ts")), false, "single-pass renderer must not create TS segments");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
