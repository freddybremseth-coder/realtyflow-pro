import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { REMASTER_SONG_READ_BRANDS } from "@/services/integrations/airtable-client";

const styleSchema = z.enum([
  "mediterranean-sunset",
  "poolside",
  "luxury-lounge",
  "mediterranean-night",
  "morning-chill",
]);

const regionSchema = z.enum(["any", "north", "south", "inland", "costa-calida"]);
const visualTypeSchema = z.enum(["mixed", "villas", "apartments", "pools", "sea-views", "interiors"]);

const createMixSchema = z.object({
  title: z.string().trim().min(3).max(160),
  style: styleSchema,
  targetMinutes: z.number().int().min(30).max(180),
  crossfadeSeconds: z.number().int().min(0).max(20),
  playlist: z.string().trim().min(3).max(180),
  zenEcoHomesEnabled: z.boolean().default(true),
  visualRegion: regionSchema.default("any"),
  visualType: visualTypeSchema.default("mixed"),
  sponsorIntervalMinutes: z.number().int().min(5).max(60).default(20),
  ctaText: z.string().trim().max(500).default(""),
  selectedSongIds: z.array(z.string().trim().min(1).max(200)).min(2).max(60),
  queue: z.boolean().optional().default(false),
}).strict();

const patchMixSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["queue", "cancel"]),
}).strict();

type SongRow = {
  id: string;
  name: string | null;
  artist: string | null;
  file_url: string | null;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  duration: number | null;
  brand: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function schemaMissing(message: string) {
  return /remaster_mix_jobs|relation .* does not exist|schema cache/i.test(message);
}

function apiError(message: string, status = 500) {
  if (schemaMissing(message)) {
    return NextResponse.json(
      {
        error: "Re-Master Mix Studio schema is not installed yet.",
        code: "MIX_SCHEMA_NOT_READY",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: message }, { status });
}

async function authorize(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return { unauthorized, context: null };
  const context = await getRequestAccessContext(request);
  if (!context) {
    return {
      unauthorized: NextResponse.json({ error: "Admin session required" }, { status: 401 }),
      context: null,
    };
  }
  return { unauthorized: null, context };
}

export async function GET(request: NextRequest) {
  const { unauthorized } = await authorize(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = new URL(request.url).searchParams.get("id");

  try {
    if (id) {
      const { data, error } = await supabase
        .from("remaster_mix_jobs")
        .select("*")
        .eq("id", id)
        .single();
      if (error) return apiError(error.message, error.code === "PGRST116" ? 404 : 500);
      return NextResponse.json({ mix: data }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data, error } = await supabase
      .from("remaster_mix_jobs")
      .select("*")
      .eq("brand", "remasterfreddy")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return apiError(error.message);
    return NextResponse.json({ mixes: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to load mix jobs");
  }
}

export async function POST(request: NextRequest) {
  const { unauthorized, context } = await authorize(request);
  if (unauthorized || !context) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createMixSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid mix payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const uniqueTrackIds = [...new Set(input.selectedSongIds)];
  if (uniqueTrackIds.length !== input.selectedSongIds.length) {
    return NextResponse.json({ error: "The same song cannot appear twice in one mix yet." }, { status: 400 });
  }

  try {
    const { data: songs, error: songError } = await supabase
      .from("songs")
      .select("id,name,artist,file_url,genre,mood,bpm,duration,brand")
      .in("id", uniqueTrackIds)
      .in("brand", [...REMASTER_SONG_READ_BRANDS]);

    if (songError) return apiError(songError.message);

    const byId = new Map((songs || []).map((song) => [song.id, song as SongRow]));
    const orderedSongs = input.selectedSongIds.map((id) => byId.get(id)).filter(Boolean) as SongRow[];
    const missingIds = input.selectedSongIds.filter((id) => !byId.has(id));
    const missingAudio = orderedSongs.filter((song) => !song.file_url).map((song) => song.id);

    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: "One or more selected songs could not be found.", missingSongIds: missingIds },
        { status: 400 },
      );
    }

    if (missingAudio.length > 0) {
      return NextResponse.json(
        { error: "One or more selected songs do not have an audio file.", missingAudioSongIds: missingAudio },
        { status: 400 },
      );
    }

    const knownDuration = orderedSongs.every((song) => Number(song.duration) > 0);
    const exactAudioSeconds = knownDuration
      ? orderedSongs.reduce((sum, song) => sum + Number(song.duration || 0), 0)
        - Math.max(0, orderedSongs.length - 1) * input.crossfadeSeconds
      : null;

    const now = new Date().toISOString();
    const row = {
      brand: "remasterfreddy",
      title: input.title,
      style: input.style,
      target_minutes: input.targetMinutes,
      crossfade_seconds: input.crossfadeSeconds,
      playlist_name: input.playlist,
      zenecohomes_enabled: input.zenEcoHomesEnabled,
      visual_region: input.visualRegion,
      visual_type: input.visualType,
      sponsor_interval_minutes: input.sponsorIntervalMinutes,
      cta_text: input.ctaText || null,
      track_ids: input.selectedSongIds,
      input_snapshot: {
        version: "mediterranean-mix-v1",
        createdAt: now,
        exactAudioSeconds,
        tracks: orderedSongs.map((song, index) => ({
          position: index + 1,
          id: song.id,
          title: song.name || "Untitled",
          artist: song.artist || "Re-Master Freddy",
          audioUrl: song.file_url,
          genre: song.genre,
          mood: song.mood,
          bpm: song.bpm,
          durationSeconds: song.duration,
        })),
        visualPlan: {
          source: input.zenEcoHomesEnabled ? "zenecohomes-properties" : "remaster-image-bank",
          region: input.visualRegion,
          type: input.visualType,
          sponsorIntervalMinutes: input.sponsorIntervalMinutes,
          ctaText: input.ctaText,
        },
      },
      status: input.queue ? "queued" : "draft",
      pipeline_step: input.queue ? "queued" : "draft",
      progress: 0,
      source: "remaster-admin",
      created_by: context.email,
      updated_at: now,
      queued_at: input.queue ? now : null,
    };

    const { data, error } = await supabase
      .from("remaster_mix_jobs")
      .insert(row)
      .select("*")
      .single();

    if (error) return apiError(error.message);

    return NextResponse.json(
      {
        success: true,
        mix: data,
        exactAudioSeconds,
        message: input.queue ? "Mix queued for production." : "Mix draft saved.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to create mix draft");
  }
}

export async function PATCH(request: NextRequest) {
  const { unauthorized } = await authorize(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = patchMixSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid mix action" }, { status: 400 });

  const { id, action } = parsed.data;

  try {
    const { data: current, error: loadError } = await supabase
      .from("remaster_mix_jobs")
      .select("id,status")
      .eq("id", id)
      .single();

    if (loadError) return apiError(loadError.message, loadError.code === "PGRST116" ? 404 : 500);

    const now = new Date().toISOString();
    if (action === "queue") {
      if (!current || !["draft", "failed"].includes(current.status)) {
        return NextResponse.json({ error: "Only draft or failed mixes can be queued." }, { status: 409 });
      }
      const { data, error } = await supabase
        .from("remaster_mix_jobs")
        .update({
          status: "queued",
          pipeline_step: "queued",
          progress: 0,
          error_code: null,
          error_message: null,
          queued_at: now,
          updated_at: now,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) return apiError(error.message);
      return NextResponse.json({ success: true, mix: data });
    }

    if (!current || !["draft", "queued"].includes(current.status)) {
      return NextResponse.json({ error: "Only draft or queued mixes can be cancelled." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("remaster_mix_jobs")
      .update({
        status: "cancelled",
        pipeline_step: "cancelled",
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return apiError(error.message);
    return NextResponse.json({ success: true, mix: data });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to update mix job");
  }
}
