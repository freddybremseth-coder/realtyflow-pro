import assert from "node:assert/strict";
import test from "node:test";
import { selectBestRemasterPlaylist } from "./remaster-growth-optimizer";

test("selects playlist with strongest title overlap", () => {
  const selected = selectBestRemasterPlaylist("Late Night Drive Synthwave", [
    { playlistId: "a", title: "Morning Focus", description: "study music" },
    { playlistId: "b", title: "Late Night Drive", description: "synthwave driving playlist" },
  ]);
  assert.equal(selected?.playlistId, "b");
});

test("does not force unrelated playlist", () => {
  const selected = selectBestRemasterPlaylist("Piano Rain", [
    { playlistId: "a", title: "Gym Workout", description: "heavy training" },
  ]);
  assert.equal(selected, null);
});
