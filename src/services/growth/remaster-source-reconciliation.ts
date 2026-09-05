import type { SupabaseClient } from "@supabase/supabase-js";

export const REMASTER_PENDING_REASON = "Song is not published to YouTube yet; keep in Re-Master publishing pipeline before social promotion.";

const REMASTER_BRANDS = new Set(["remasterfreddy", "neuralbeat", "neural-beat"]);
const SYSTEM_MANAGED_STATUSES = new Set(["pending", "ready"]);

export type RemasterSongRow = {
  id: string;
  name: string | null;
  artist: string | null;
  genre: string | null;
  mood: string | null;
  file_url: string | null;
  status: string | null;
  youtube_url: string | null;
  brand: string | null;
  style: string | null;
  energy: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  ai_metadata: Record<string, unknown> | null;
};

export type RemasterSourceRow = {
  id?: string;
  brand_id: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  title: string;
  priority: number | string;
  recommended_channels: string[] | null;
  payload: Record<string, unknown> | null;
  status: string;
  blocked_reason: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSystemPendingReason(reason: string | null | undefined) {
  return clean(reason) === REMASTER_PENDING_REASON;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function desiredRemasterSource(song: RemasterSongRow, existing?: RemasterSourceRow | null) {
  const youtubeUrl = clean(song.youtube_url) || null;
  const published = Boolean(youtubeUrl);
  const existingStatus = clean(existing?.status);
  const manualBlocked = existingStatus === "blocked" && !isSystemPendingReason(existing?.blocked_reason);
  const preserveWorkflowStatus = existingStatus && !SYSTEM_MANAGED_STATUSES.has(existingStatus) && existingStatus !== "blocked";

  let status: string;
  let blockedReason: string | null;

  if (manualBlocked) {
    status = "blocked";
    blockedReason = existing?.blocked_reason ?? null;
  } else if (preserveWorkflowStatus) {
    status = existingStatus;
    blockedReason = existing?.blocked_reason ?? null;
  } else if (published) {
    status = "ready";
    blockedReason = null;
  } else {
    status = "pending";
    blockedReason = REMASTER_PENDING_REASON;
  }

  const currentPayload = existing?.payload && typeof existing.payload === "object" ? existing.payload : {};
  const payload: Record<string, unknown> = {
    ...currentPayload,
    song_id: song.id,
    artist: song.artist,
    genre: song.genre,
    mood: song.mood,
    style: song.style,
    energy: song.energy,
    status: song.status,
    file_url: song.file_url,
    image_url: song.image_url,
    thumbnail_url: song.thumbnail_url,
    ai_metadata: song.ai_metadata ?? {},
    youtube_url: youtubeUrl,
    legacy_brand: song.brand,
    cta: "Watch on YouTube / follow Re-Master Freddy",
  };

  return {
    brand_id: "remasterfreddy",
    source_type: "song",
    source_id: song.id,
    source_url: youtubeUrl,
    title: clean(song.name) || "Untitled Re-Master track",
    priority: published ? 78 : 55,
    recommended_channels: ["instagram", "facebook"],
    payload,
    status,
    blocked_reason: blockedReason,
  } satisfies Omit<RemasterSourceRow, "id">;
}

export function remasterSourceNeedsUpdate(existing: RemasterSourceRow, desired: Omit<RemasterSourceRow, "id">) {
  const comparableExisting = {
    brand_id: existing.brand_id,
    source_type: existing.source_type,
    source_id: existing.source_id,
    source_url: existing.source_url,
    title: existing.title,
    priority: Number(existing.priority),
    recommended_channels: existing.recommended_channels ?? [],
    payload: existing.payload ?? {},
    status: existing.status,
    blocked_reason: existing.blocked_reason,
  };
  const comparableDesired = { ...desired, priority: Number(desired.priority) };
  return canonicalJson(comparableExisting) !== canonicalJson(comparableDesired);
}

export async function reconcileRemasterSongSources(supabase: SupabaseClient) {
  const [{ data: songRows, error: songError }, { data: sourceRows, error: sourceError }] = await Promise.all([
    supabase
      .from("songs")
      .select("id,name,artist,genre,mood,file_url,status,youtube_url,brand,style,energy,image_url,thumbnail_url,ai_metadata"),
    supabase
      .from("marketing_source_queue")
      .select("id,brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,blocked_reason")
      .eq("brand_id", "remasterfreddy")
      .eq("source_type", "song"),
  ]);

  if (songError) throw new Error(`REMASTER_SONG_READ_FAILED: ${songError.message}`);
  if (sourceError) throw new Error(`REMASTER_SOURCE_READ_FAILED: ${sourceError.message}`);

  const songs = ((songRows ?? []) as RemasterSongRow[]).filter((song) => REMASTER_BRANDS.has(clean(song.brand).toLowerCase()));
  const existingBySong = new Map(((sourceRows ?? []) as RemasterSourceRow[]).map((row) => [String(row.source_id), row]));

  const toUpsert: Array<Omit<RemasterSourceRow, "id"> & { updated_at: string }> = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let ready = 0;
  let pending = 0;
  let preservedWorkflow = 0;
  const now = new Date().toISOString();

  for (const song of songs) {
    const existing = existingBySong.get(String(song.id));
    const desired = desiredRemasterSource(song, existing);
    if (desired.status === "ready") ready += 1;
    if (desired.status === "pending") pending += 1;
    if (!["ready", "pending", "blocked"].includes(desired.status)) preservedWorkflow += 1;

    if (!existing) {
      created += 1;
      toUpsert.push({ ...desired, updated_at: now });
      continue;
    }
    if (remasterSourceNeedsUpdate(existing, desired)) {
      updated += 1;
      toUpsert.push({ ...desired, updated_at: now });
    } else {
      unchanged += 1;
    }
  }

  if (toUpsert.length) {
    const { error } = await supabase
      .from("marketing_source_queue")
      .upsert(toUpsert, { onConflict: "brand_id,source_type,source_id" });
    if (error) throw new Error(`REMASTER_SOURCE_UPSERT_FAILED: ${error.message}`);
  }

  return {
    scannedSongs: songs.length,
    existingSources: existingBySong.size,
    created,
    updated,
    unchanged,
    written: toUpsert.length,
    ready,
    pending,
    preservedWorkflow,
  };
}
