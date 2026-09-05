export type RemasterMixStyle =
  | "mediterranean-sunset"
  | "poolside"
  | "luxury-lounge"
  | "mediterranean-night"
  | "morning-chill";

export type RemasterMixRegion = "any" | "north" | "south" | "inland" | "costa-calida";
export type RemasterMixVisualType = "mixed" | "villas" | "apartments" | "pools" | "sea-views" | "interiors";

export interface MixTrackPlan {
  id: string;
  title: string;
  artist?: string | null;
  durationSeconds?: number | null;
}

export interface MixPropertyLike {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  town?: string | null;
  province?: string | null;
  region?: string | null;
  property_type?: string | null;
  pool?: boolean | null;
  primary_image?: string | null;
  gallery?: unknown;
  show_on_website?: boolean | null;
  website_visible?: boolean | null;
}

export interface MixVisualPlanInput {
  region: RemasterMixRegion;
  visualType: RemasterMixVisualType;
  limit: number;
}

const REGION_TERMS: Record<Exclude<RemasterMixRegion, "any">, string[]> = {
  north: [
    "altea", "albir", "alfaz", "benidorm", "finestrat", "villajoyosa", "la nucia", "polop",
    "calpe", "calp", "moraira", "teulada", "benissa", "javea", "xabia", "denia", "dénia",
    "pedreguer", "ondara", "orba", "jalon", "xaló", "alicante north", "costa blanca north",
  ],
  south: [
    "torrevieja", "orihuela", "guardamar", "santa pola", "gran alacant", "la marina", "rojales",
    "ciudad quesada", "san miguel", "pilar de la horadada", "cabo roig", "villamartin", "playa flamenca",
    "costa blanca south", "alicante south",
  ],
  inland: [
    "pinoso", "el pinós", "aspe", "novelda", "monovar", "monóvar", "biar", "villena", "sax",
    "hondón", "hondon", "salinas", "la romana", "algueña", "alguena", "inland",
  ],
  "costa-calida": [
    "murcia", "cartagena", "mar menor", "los alcazares", "los alcázares", "san pedro del pinatar",
    "san javier", "mazarron", "mazarrón", "aguilas", "águilas", "costa cálida", "costa calida",
  ],
};

function normalizedPropertyText(property: MixPropertyLike) {
  return [
    property.title,
    property.description,
    property.location,
    property.town,
    property.province,
    property.region,
    property.property_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function propertyMatchesRegion(property: MixPropertyLike, region: RemasterMixRegion) {
  if (region === "any") return true;
  const text = normalizedPropertyText(property);
  return REGION_TERMS[region].some((term) => text.includes(term));
}

function propertyMatchesVisualType(property: MixPropertyLike, visualType: RemasterMixVisualType) {
  if (visualType === "mixed" || visualType === "interiors") return true;
  const text = normalizedPropertyText(property);

  if (visualType === "villas") {
    return /villa|chalet|detached|finca|country house|casa de campo/.test(text);
  }
  if (visualType === "apartments") {
    return /apartment|apartamento|penthouse|ático|atico|flat/.test(text);
  }
  if (visualType === "pools") {
    return property.pool === true || /pool|piscina/.test(text);
  }
  return /sea view|sea-view|ocean view|views? to the sea|vista al mar|vistas al mar|mar mediterráneo|mediterranean view/.test(text);
}

function galleryUrls(property: MixPropertyLike) {
  const gallery = Array.isArray(property.gallery) ? property.gallery : [];
  return gallery
    .map((entry) => typeof entry === "string" ? entry : "")
    .filter((url) => /^https?:\/\//i.test(url));
}

function propertyImageUrls(property: MixPropertyLike, visualType: RemasterMixVisualType) {
  const gallery = galleryUrls(property);
  const primary = typeof property.primary_image === "string" && /^https?:\/\//i.test(property.primary_image)
    ? property.primary_image
    : "";

  // Interior mode intentionally de-prioritizes the hero photo. Property feeds
  // normally put exterior/hero first and interior rooms deeper in the gallery.
  if (visualType === "interiors") {
    return [...gallery.slice(2), ...gallery.slice(0, 2), ...(primary ? [primary] : [])];
  }
  return [...(primary ? [primary] : []), ...gallery];
}

export function selectZenEcoHomesVisuals(
  properties: MixPropertyLike[],
  input: MixVisualPlanInput,
): string[] {
  const safeLimit = Math.max(1, Math.min(240, Math.floor(input.limit || 1)));
  const matching = properties.filter((property) => {
    if (property.show_on_website === false || property.website_visible === false) return false;
    return propertyMatchesRegion(property, input.region) && propertyMatchesVisualType(property, input.visualType);
  });

  // Round-robin across properties so one large gallery never dominates a mix.
  const buckets = matching
    .map((property) => propertyImageUrls(property, input.visualType))
    .filter((urls) => urls.length > 0);
  const selected: string[] = [];
  const seen = new Set<string>();
  let imageIndex = 0;

  while (selected.length < safeLimit && buckets.length > 0) {
    let addedThisRound = false;
    for (const bucket of buckets) {
      const url = bucket[imageIndex];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      selected.push(url);
      addedThisRound = true;
      if (selected.length >= safeLimit) break;
    }
    imageIndex += 1;
    if (!addedThisRound && buckets.every((bucket) => imageIndex >= bucket.length)) break;
  }

  return selected;
}

export function recommendedVisualCount(targetMinutes: number) {
  // ~75 seconds per visual at 90 images / 120 minutes. Ken Burns motion keeps
  // this intentionally slower than a property-ad slideshow while avoiding a
  // static image sitting on screen for many minutes.
  return Math.max(24, Math.min(180, Math.round(targetMinutes * 0.75)));
}

function formatChapterTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function buildMixChapters(tracks: MixTrackPlan[], crossfadeSeconds: number) {
  if (tracks.length === 0 || tracks.some((track) => !track.durationSeconds || track.durationSeconds <= 0)) return "";

  let cursor = 0;
  const lines = tracks.map((track, index) => {
    const line = `${formatChapterTime(cursor)} ${track.title}`;
    cursor += Number(track.durationSeconds || 0);
    if (index < tracks.length - 1) cursor -= Math.max(0, crossfadeSeconds);
    return line;
  });
  return lines.join("\n");
}

const STYLE_TAGS: Record<RemasterMixStyle, string[]> = {
  "mediterranean-sunset": ["deep house", "sunset deep house", "melodic house", "summer vibes", "Costa Blanca"],
  poolside: ["poolside house", "deep house", "summer house", "luxury lifestyle", "Costa Blanca"],
  "luxury-lounge": ["luxury lounge", "deep house", "lounge house", "relaxing music", "Mediterranean"],
  "mediterranean-night": ["night deep house", "deep house", "melodic house", "night drive", "Mediterranean"],
  "morning-chill": ["morning chill", "chill house", "deep house", "relaxing music", "Costa Blanca"],
};

export function buildMixTags(style: RemasterMixStyle) {
  return [
    ...STYLE_TAGS[style],
    "Re-Master Freddy",
    "Mediterranean house",
    "chill music",
    "ZenEcoHomes",
    "Spain lifestyle",
  ];
}

export function buildMixDescription(input: {
  title: string;
  style: RemasterMixStyle;
  tracks: MixTrackPlan[];
  crossfadeSeconds: number;
  zenEcoHomesEnabled: boolean;
  ctaText?: string | null;
}) {
  const chapters = buildMixChapters(input.tracks, input.crossfadeSeconds);
  const propertyBlock = input.zenEcoHomesEnabled
    ? [
        "🏡 Love the Mediterranean homes and lifestyle featured in this mix?",
        "Explore Costa Blanca properties: https://zenecohomes.com/",
        input.ctaText?.trim() || "Dreaming of a home in Spain? Discover ZenEcoHomes.",
        "",
        "Presented by ZenEcoHomes.com",
      ].join("\n")
    : "";

  return [
    propertyBlock,
    propertyBlock ? "" : null,
    `🎧 ${input.title}`,
    "Music by Re-Master Freddy.",
    "A long-form Mediterranean deep-house mix for relaxing, working, driving, poolside evenings and sunset views.",
    "",
    chapters ? "TRACKLIST / CHAPTERS" : null,
    chapters || null,
    "",
    "More music: https://remaster.freddybremseth.com/",
    "",
    "#DeepHouse #Mediterranean #CostaBlanca #RemasterFreddy",
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim();
}

export function buildZenEcoHomesComment() {
  return [
    "🏡 Like the homes and Mediterranean lifestyle featured in this mix?",
    "Explore available properties on the Costa Blanca:",
    "https://zenecohomes.com/",
    "",
    "🎧 Music: Re-Master Freddy",
    "https://remaster.freddybremseth.com/",
  ].join("\n");
}
