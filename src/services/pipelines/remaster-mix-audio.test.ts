import assert from "node:assert/strict";
import test from "node:test";
import { buildAcrossfadeFilter, buildTargetDurationArgs } from "./remaster-mix-audio";

const FOUR_TRACK_CROSSFADE = [
  "[0:a][1:a]acrossfade=d=8:c1=tri:c2=tri[mix1]",
  "[mix1][2:a]acrossfade=d=8:c1=tri:c2=tri[mix2]",
  "[mix2][3:a]acrossfade=d=8:c1=tri:c2=tri[mixout]",
].join(";");

test("buildAcrossfadeFilter chains every track with the configured fade", () => {
  const result = buildAcrossfadeFilter(4, 8);
  assert.equal(result.filter, FOUR_TRACK_CROSSFADE);
  assert.equal(result.outputLabel, "mixout");
});

test("buildAcrossfadeFilter uses concat when crossfade is disabled", () => {
  const result = buildAcrossfadeFilter(3, 0);
  assert.equal(result.filter, "[0:a][1:a][2:a]concat=n=3:v=0:a=1[mixout]");
});

test("buildAcrossfadeFilter clamps oversized crossfade", () => {
  const result = buildAcrossfadeFilter(2, 90);
  assert.equal(result.filter, "[0:a][1:a]acrossfade=d=20:c1=tri:c2=tri[mixout]");
});

test("buildAcrossfadeFilter rejects invalid track counts", () => {
  assert.throws(() => buildAcrossfadeFilter(1, 8), /between 2 and 60 tracks/i);
  assert.throws(() => buildAcrossfadeFilter(61, 8), /between 2 and 60 tracks/i);
});

test("target-duration pass loops short mixes and trims to exactly 30 minutes", () => {
  const args = buildTargetDurationArgs("natural.mp3", "mix.mp3", 1800);
  assert.deepEqual(args.slice(0, 6), ["-stream_loop", "-1", "-i", "natural.mp3", "-t", "1800.000"]);
  assert.equal(args[args.length - 1], "mix.mp3");
});
