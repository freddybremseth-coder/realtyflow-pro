import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";

export interface RemasterMixAudioTrack {
  id: string;
  title: string;
  audioUrl: string;
}

export interface RemasterMixAudioResult {
  audioPath: string;
  workingDirectory: string;
  trackPaths: string[];
  durationSeconds: number;
}

type StableSongCandidate = {
  id: string;
  name: string | null;
  file_url: string | null;
  brand: string | null;
  updated_at?: string | null;
};

export function isEphemeralAirtableUrl(url: string | null | undefined) {
  return /(^|\.)airtableusercontent\.com\//i.test(String(url || ""));
}

export function isPermanentSupabaseAudioUrl(url: string | null | undefined) {
  const value = String(url || "");
  return /\.supabase\.co\/storage\/v1\/object\//i.test(value);
}

function normalizeTitle(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function chooseStableSongCandidate(
  track: Pick<RemasterMixAudioTrack, "id" | "title">,
  candidates: StableSongCandidate[],
) {
  const stable = candidates.filter((candidate) => isPermanentSupabaseAudioUrl(candidate.file_url));
  const sameId = stable.find((candidate) => candidate.id === track.id);
  if (sameId) return sameId;

  const normalizedTrackTitle = normalizeTitle(track.title);
  return stable
    .filter((candidate) => normalizeTitle(candidate.name || "") === normalizedTrackTitle)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
}

async function resolveStableAudioUrl(track: RemasterMixAudioTrack): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byId = await supabase
    .from("songs")
    .select("id,name,file_url,brand,updated_at")
    .eq("id", track.id)
    .limit(3);

  const titleMatches = await supabase
    .from("songs")
    .select("id,name,file_url,brand,updated_at")
    .eq("name", track.title)
    .in("brand", ["remasterfreddy", "neural-beat", "neuralbeat"])
    .order("updated_at", { ascending: false })
    .limit(10);

  const candidates = [
    ...((byId.data || []) as StableSongCandidate[]),
    ...((titleMatches.data || []) as StableSongCandidate[]),
  ];
  return chooseStableSongCandidate(track, candidates)?.file_url || null;
}

async function downloadToFile(url: string, destination: string) {
  if (url.startsWith("/") || url.startsWith("file://")) {
    await fs.copyFile(url.replace(/^file:\/\//, ""), destination);
    return;
  }

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    const error = new Error(`Mix audio download failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  await pipeline(Readable.fromWeb(response.body as any), fsSync.createWriteStream(destination));
}

async function downloadTrackWithStableFallback(track: RemasterMixAudioTrack, destination: string) {
  try {
    await downloadToFile(track.audioUrl, destination);
    return track.audioUrl;
  } catch (error) {
    const stableUrl = await resolveStableAudioUrl(track);
    if (!stableUrl || stableUrl === track.audioUrl) throw error;

    console.warn(
      `[RemasterMixAudio] Replacing stale audio source for "${track.title}" with permanent Supabase Storage URL.`,
    );
    await downloadToFile(stableUrl, destination);
    return stableUrl;
  }
}

function runFFmpeg(binary: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg crossfade failed with code ${code}: ${stderr.slice(-1800)}`));
    });
  });
}

export function buildAcrossfadeFilter(trackCount: number, crossfadeSeconds: number) {
  if (!Number.isInteger(trackCount) || trackCount < 2 || trackCount > 60) {
    throw new Error("A long-form mix requires between 2 and 60 tracks.");
  }
  const fade = Math.max(0, Math.min(20, crossfadeSeconds));

  if (fade === 0) {
    return {
      filter: `${Array.from({ length: trackCount }, (_, index) => `[${index}:a]`).join("")}concat=n=${trackCount}:v=0:a=1[mixout]`,
      outputLabel: "mixout",
    };
  }

  const parts: string[] = [];
  let previous = "0:a";
  for (let index = 1; index < trackCount; index += 1) {
    const output = index === trackCount - 1 ? "mixout" : `mix${index}`;
    parts.push(`[${previous}][${index}:a]acrossfade=d=${fade}:c1=tri:c2=tri[${output}]`);
    previous = output;
  }
  return { filter: parts.join(";"), outputLabel: "mixout" };
}

export function buildTargetDurationArgs(inputPath: string, outputPath: string, targetSeconds: number) {
  const duration = Math.max(30, Math.round(targetSeconds));
  return [
    "-stream_loop", "-1",
    "-i", inputPath,
    "-t", duration.toFixed(3),
    "-vn",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    "-ar", "44100",
    "-y",
    outputPath,
  ];
}

/**
 * Downloads selected tracks, produces one natural chained-crossfade mix, then
 * normalizes that mix to the requested long-form duration. Stale legacy
 * Airtable attachment URLs are recovered from an exact permanent Supabase
 * Storage copy (same id or same title) before the job is failed.
 */
export async function buildRemasterMixAudio(
  tracks: RemasterMixAudioTrack[],
  crossfadeSeconds: number,
  targetSeconds = 30 * 60,
): Promise<RemasterMixAudioResult> {
  if (tracks.length < 2 || tracks.length > 60) {
    throw new Error("A long-form mix requires between 2 and 60 tracks.");
  }
  if (tracks.some((track) => !track.audioUrl)) {
    throw new Error("Every selected mix track must have an audio URL.");
  }
  if (!Number.isFinite(targetSeconds) || targetSeconds < 30 || targetSeconds > 6 * 60 * 60) {
    throw new Error("Mix target duration must be between 30 seconds and 6 hours.");
  }

  const binary = await ensureFFmpeg();
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-mix-audio-"));
  const trackPaths: string[] = [];

  try {
    for (let index = 0; index < tracks.length; index += 1) {
      const target = path.join(workingDirectory, `track-${String(index).padStart(2, "0")}.mp3`);
      await downloadTrackWithStableFallback(tracks[index], target);
      trackPaths.push(target);
    }

    const naturalMixPath = path.join(workingDirectory, "mix-audio-natural.mp3");
    const inputArgs = trackPaths.flatMap((trackPath) => ["-i", trackPath]);
    const { filter, outputLabel } = buildAcrossfadeFilter(trackPaths.length, crossfadeSeconds);

    await runFFmpeg(binary, [
      ...inputArgs,
      "-filter_complex",
      filter,
      "-map",
      `[${outputLabel}]`,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-y",
      naturalMixPath,
    ]);

    const outputPath = path.join(workingDirectory, "mix-audio.mp3");
    await runFFmpeg(binary, buildTargetDurationArgs(naturalMixPath, outputPath, targetSeconds));
    await fs.unlink(naturalMixPath).catch(() => undefined);

    return {
      audioPath: outputPath,
      workingDirectory,
      trackPaths,
      durationSeconds: Math.round(targetSeconds),
    };
  } catch (error) {
    await fs.rm(workingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupRemasterMixAudio(result: Pick<RemasterMixAudioResult, "workingDirectory">) {
  if (!result.workingDirectory.includes("remaster-mix-audio-")) return;
  await fs.rm(result.workingDirectory, { recursive: true, force: true }).catch(() => undefined);
}
