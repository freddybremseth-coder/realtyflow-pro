import assert from "node:assert/strict";
import test from "node:test";
import {
  ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID,
  assertZenecoYoutubeUploadDestination,
  requiresZenecoCanonicalYoutubeChannel,
} from "./zeneco-youtube-routing";

test("Zen Eco Homes is pinned to the requested stable YouTube channel ID", () => {
  assert.equal(ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID, "UCT5vAXY68LUXewOBF9onYew");
  assert.equal(requiresZenecoCanonicalYoutubeChannel("zeneco"), true);
  assert.equal(requiresZenecoCanonicalYoutubeChannel(" ZENECO "), true);
  assert.equal(requiresZenecoCanonicalYoutubeChannel("pinosoecolife"), false);
});

test("correct OAuth channel + exactly one active matching RealtyFlow channel passes", () => {
  assert.doesNotThrow(() => assertZenecoYoutubeUploadDestination(
    "zeneco", ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID, [ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID],
  ));
});

test("wrong OAuth channel or missing channel fails BEFORE upload", () => {
  for (const actual of [null, "", "UCwrongZenEcoHomesSpain"]) {
    assert.throws(() => assertZenecoYoutubeUploadDestination(
      "zeneco", actual, [ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID],
    ), /ZENECO_YOUTUBE_CHANNEL_MISMATCH/);
  }
});

test("wrong, inactive or ambiguous RealtyFlow destination fails closed", () => {
  for (const active of [[], ["UCwrong"], [ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID, "UCwrong"]]) {
    assert.throws(() => assertZenecoYoutubeUploadDestination(
      "zeneco", ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID, active,
    ), /ZENECO_YOUTUBE_CHANNEL_CONFIGURATION/);
  }
  assert.doesNotThrow(() => assertZenecoYoutubeUploadDestination("remasterfreddy", "UCmusic", ["UCmusic"]));
});
