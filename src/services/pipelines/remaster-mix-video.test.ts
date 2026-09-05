import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import { buildRemasterMixAssOverlay } from "./remaster-mix-video";

const execFileAsync = promisify(execFile);

test("ASS overlay contains ZenEcoHomes branding and CTA", () => {
  const overlay = buildRemasterMixAssOverlay({
    durationSeconds: 12.5,
    sponsorSlide: true,
    ctaText: "Dreaming of a home in Spain? Explore Costa Blanca at ZenEcoHomes.com",
    zenEcoHomesEnabled: true,
  });

  assert.match(overlay, /ZenEcoHomes\.com/);
  assert.match(overlay, /Presented by ZenEcoHomes\.com/);
  assert.match(overlay, /Dreaming of a home in Spain/);
  assert.doesNotMatch(overlay, /drawtext/);
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
