export type RemasterPlaylistTaxonomyRow = {
  videoId: string;
  title: string;
  genre?: string | null;
  mood?: string | null;
  style?: string | null;
};

export type ExistingPlaylist = {
  playlistId: string;
  title: string;
  description?: string | null;
  itemCount?: number;
};

export type PlaylistGapCandidate = {
  key: string;
  dimension: "genre" | "mood" | "style";
  label: string;
  title: string;
  description: string;
  videoIds: string[];
  trackTitles: string[];
};

const GENRE_ALIASES: Record<string, string> = {
  edm: "electronic dance music",
  electronic: "electronic dance music",
  "electronic dance music": "electronic dance music",
};

const TOKEN_ALIASES: Record<string, string> = {
  uplifting: "euphoric",
  relaxing: "chill",
  relaxed: "chill",
  atmospheric: "atmospheric",
};

const GENERIC_STYLE = new Set(["melodic", "progressive", "energetic"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function safeLabel(value: string) {
  return /^[a-z0-9][a-z0-9 &+.'-]{1,38}$/i.test(value) && !value.includes("http");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tokens(value: unknown) {
  return clean(value)
    .split(/[,;/|]+/)
    .map((part) => clean(part))
    .filter(Boolean)
    .map((part) => TOKEN_ALIASES[part] || part)
    .filter((part) => safeLabel(part));
}

function normalizedGenre(value: unknown) {
  const raw = clean(value);
  const normalized = GENRE_ALIASES[raw] || raw;
  return safeLabel(normalized) ? normalized : "";
}

function playlistCovers(existing: ExistingPlaylist[], label: string) {
  const target = clean(label);
  const targetTokens = new Set(target.split(/\s+/).filter(Boolean));
  return existing.some((playlist) => {
    const haystack = clean(`${playlist.title} ${playlist.description || ""}`);
    if (haystack.includes(target)) return true;
    const words = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean));
    if (targetTokens.size <= 1) return words.has(target);
    let overlap = 0;
    for (const token of targetTokens) if (words.has(token)) overlap += 1;
    return overlap / targetTokens.size >= 0.8;
  });
}

export function findRemasterPlaylistGap(
  rows: RemasterPlaylistTaxonomyRow[],
  existing: ExistingPlaylist[],
  options: { minimumTracks?: number; maximumSeedTracks?: number } = {},
): PlaylistGapCandidate | null {
  const minimumTracks = Math.max(3, options.minimumTracks ?? 3);
  const maximumSeedTracks = Math.max(minimumTracks, Math.min(8, options.maximumSeedTracks ?? 5));
  const clusters = new Map<string, { dimension: PlaylistGapCandidate["dimension"]; label: string; rows: RemasterPlaylistTaxonomyRow[] }>();

  const add = (dimension: PlaylistGapCandidate["dimension"], label: string, row: RemasterPlaylistTaxonomyRow) => {
    if (!label || !safeLabel(label)) return;
    if (dimension === "style" && GENERIC_STYLE.has(label)) return;
    const key = `${dimension}:${label}`;
    const cluster = clusters.get(key) || { dimension, label, rows: [] };
    if (!cluster.rows.some((item) => item.videoId === row.videoId)) cluster.rows.push(row);
    clusters.set(key, cluster);
  };

  for (const row of rows) {
    const genre = normalizedGenre(row.genre);
    if (genre) add("genre", genre, row);
    for (const mood of tokens(row.mood)) add("mood", mood, row);
    for (const style of tokens(row.style)) add("style", style, row);
  }

  const dimensionRank: Record<PlaylistGapCandidate["dimension"], number> = { style: 3, mood: 2, genre: 1 };
  const candidates = [...clusters.values()]
    .filter((cluster) => cluster.rows.length >= minimumTracks)
    .filter((cluster) => !playlistCovers(existing, cluster.label))
    .sort((a, b) => dimensionRank[b.dimension] - dimensionRank[a.dimension] || b.rows.length - a.rows.length || a.label.localeCompare(b.label));

  const best = candidates[0];
  if (!best) return null;
  const selected = best.rows.slice(0, maximumSeedTracks);
  const label = titleCase(best.label);
  return {
    key: `${best.dimension}:${best.label}`,
    dimension: best.dimension,
    label: best.label,
    title: `Re-Master Freddy — ${label}`,
    description: `Official Re-Master Freddy playlist for ${label.toLowerCase()} tracks. Curated from the Re-Master catalog to help listeners discover related music in one session.`,
    videoIds: selected.map((row) => row.videoId),
    trackTitles: selected.map((row) => row.title),
  };
}
