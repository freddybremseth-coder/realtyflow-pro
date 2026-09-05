import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMixChapters,
  buildMixDescription,
  buildZenEcoHomesComment,
  recommendedVisualCount,
  selectZenEcoHomesVisuals,
} from "./remaster-mix-planner";

test("selectZenEcoHomesVisuals filters by region and spreads images across properties", () => {
  const visuals = selectZenEcoHomesVisuals(
    [
      {
        id: "north-1",
        title: "Sea view villa in Altea",
        town: "Altea",
        property_type: "Villa",
        primary_image: "https://images.example/altea-hero.jpg",
        gallery: ["https://images.example/altea-1.jpg", "https://images.example/altea-2.jpg"],
      },
      {
        id: "north-2",
        title: "Villa in Finestrat",
        town: "Finestrat",
        property_type: "Villa",
        primary_image: "https://images.example/finestrat-hero.jpg",
        gallery: ["https://images.example/finestrat-1.jpg"],
      },
      {
        id: "south-1",
        title: "Apartment in Torrevieja",
        town: "Torrevieja",
        property_type: "Apartment",
        primary_image: "https://images.example/torrevieja.jpg",
        gallery: [],
      },
    ],
    { region: "north", visualType: "villas", limit: 4 },
  );

  assert.deepEqual(visuals, [
    "https://images.example/altea-hero.jpg",
    "https://images.example/finestrat-hero.jpg",
    "https://images.example/altea-1.jpg",
    "https://images.example/finestrat-1.jpg",
  ]);
});

test("interior visual mode de-prioritizes hero images", () => {
  const visuals = selectZenEcoHomesVisuals(
    [
      {
        id: "property-1",
        town: "Benidorm",
        primary_image: "https://images.example/hero.jpg",
        gallery: [
          "https://images.example/exterior-1.jpg",
          "https://images.example/exterior-2.jpg",
          "https://images.example/kitchen.jpg",
          "https://images.example/living-room.jpg",
        ],
      },
    ],
    { region: "north", visualType: "interiors", limit: 4 },
  );

  assert.deepEqual(visuals.slice(0, 2), [
    "https://images.example/kitchen.jpg",
    "https://images.example/living-room.jpg",
  ]);
});

test("buildMixChapters accounts for crossfades", () => {
  const chapters = buildMixChapters(
    [
      { id: "1", title: "Sunset One", durationSeconds: 240 },
      { id: "2", title: "Coastal Two", durationSeconds: 300 },
      { id: "3", title: "Night Three", durationSeconds: 180 },
    ],
    8,
  );

  assert.equal(chapters, "0:00 Sunset One\n3:52 Coastal Two\n8:44 Night Three");
});

test("buildMixDescription puts clickable ZenEcoHomes URL near the top", () => {
  const description = buildMixDescription({
    title: "Mediterranean Sunset Deep House Mix #001",
    style: "mediterranean-sunset",
    crossfadeSeconds: 8,
    zenEcoHomesEnabled: true,
    ctaText: "Dreaming of a home in Spain?",
    tracks: [
      { id: "1", title: "Sunset One", durationSeconds: 240 },
      { id: "2", title: "Coastal Two", durationSeconds: 300 },
    ],
  });

  assert.match(description, /https:\/\/zenecohomes\.com\//);
  assert.match(description, /Presented by ZenEcoHomes\.com/);
  assert.match(description, /TRACKLIST \/ CHAPTERS/);
});

test("standard comment contains both brand destinations", () => {
  const comment = buildZenEcoHomesComment();
  assert.match(comment, /https:\/\/zenecohomes\.com\//);
  assert.match(comment, /https:\/\/remaster\.freddybremseth\.com\//);
});

test("visual count stays inside long-form safety bounds", () => {
  assert.equal(recommendedVisualCount(30), 24);
  assert.equal(recommendedVisualCount(120), 90);
  assert.equal(recommendedVisualCount(300), 180);
});
