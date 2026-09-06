import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAcrossfadeFilter,
  buildTargetDurationArgs,
  chooseStableSongCandidate,
  isEphemeralAirtableUrl,
  isPermanentSupabaseAudioUrl,
} from "./remaster-mix-audio";

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

test("legacy Airtable attachments are classified as ephemeral", () => {
  assert.equal(isEphemeralAirtableUrl("https://v5.airtableusercontent.com/v3/u/51/example"), true);
  assert.equal(isEphemeralAirtableUrl("https://example.supabase.co/storage/v1/object/public/assets/a.mp3"), false);
});

test("Supabase Storage audio is classified as permanent", () => {
  assert.equal(
    isPermanentSupabaseAudioUrl("https://example.supabase.co/storage/v1/object/public/assets/neural-beat/song.mp3"),
    true,
  );
  assert.equal(isPermanentSupabaseAudioUrl("https://v5.airtableusercontent.com/v3/u/51/example"), false);
});

test("stable source recovery prefers exact track id", () => {
  const result = chooseStableSongCandidate(
    { id: "track-1", title: "Sunset Elegance" },
    [
      {
        id: "track-2",
        name: "Sunset Elegance",
        file_url: "https://example.supabase.co/storage/v1/object/public/assets/newer.mp3",
        brand: "neural-beat",
        updated_at: "2026-09-06T10:00:00Z",
      },
      {
        id: "track-1",
        name: "Sunset Elegance",
        file_url: "https://example.supabase.co/storage/v1/object/public/assets/exact.mp3",
        brand: "neural-beat",
        updated_at: "2026-01-01T10:00:00Z",
      },
    ],
  );
  assert.equal(result?.id, "track-1");
});

test("stable source recovery uses exact normalized title only", () => {
  const result = chooseStableSongCandidate(
    { id: "legacy-id", title: "  Sunset   Elegance " },
    [
      {
        id: "wrong",
        name: "Sunset Elegance Extended",
        file_url: "https://example.supabase.co/storage/v1/object/public/assets/wrong.mp3",
        brand: "neural-beat",
      },
      {
        id: "right",
        name: "Sunset Elegance",
        file_url: "https://example.supabase.co/storage/v1/object/public/assets/right.mp3",
        brand: "neural-beat",
      },
    ],
  );
  assert.equal(result?.id, "right");
});
