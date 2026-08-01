import assert from "node:assert/strict";
import test from "node:test";
import { assertMediaRateLimit } from "./api-guards";
import { mapOpenArtToolsToCapabilities, supportsCapability } from "./capabilities";

test("OpenArt tools/list output maps to provider capabilities", () => {
  const capabilities = mapOpenArtToolsToCapabilities([
    { name: "openart_generate_image", description: "Generate images" },
    { name: "openart_generate_video", description: "Generate videos" },
    { name: "openart_creation_get", description: "Poll creation" },
  ]);

  assert.equal(capabilities.status, "available");
  assert.equal(capabilities.image.textToImage, true);
  assert.equal(capabilities.image.imageToImage, true);
  assert.equal(capabilities.video.textToVideo, true);
  assert.equal(capabilities.video.imageToVideo, true);
  assert.equal(capabilities.voice.textToSpeech, false);
});

test("supportsCapability rejects unavailable and unsupported operations", () => {
  const capabilities = mapOpenArtToolsToCapabilities([
    { name: "openart_generate_image" },
  ]);

  assert.equal(supportsCapability(capabilities, "image", "text_to_image"), true);
  assert.equal(supportsCapability(capabilities, "video", "text_to_video"), false);
  assert.equal(supportsCapability({ ...capabilities, status: "not_connected" }, "image", "text_to_image"), false);
});

test("media generation rate limit protects provider calls", () => {
  const now = 1_000_000;
  for (let i = 0; i < 4; i += 1) {
    assertMediaRateLimit("freddy@example.com", "generate", now);
  }

  assert.throws(
    () => assertMediaRateLimit("freddy@example.com", "generate", now),
    /For mange Media Studio-handlinger/,
  );
  assert.doesNotThrow(() => assertMediaRateLimit("freddy@example.com", "generate", now + 61_000));
});
