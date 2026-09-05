import { createClient } from "@supabase/supabase-js";
import { getGenreImages, REMASTER_CANONICAL_SONG_BRAND } from "@/services/integrations/airtable-client";
import {
  buildMixDescription,
  buildMixTags,
  buildZenEcoHomesComment,
  recommendedVisualCount,
  type MixTrackPlan,
  type RemasterMixRegion,
  type RemasterMixStyle,
  type RemasterMixVisualType,
} from "./remaster-mix-planner";
import {
  buildRemasterMixAudio,
  cleanupRemasterMixAudio,
  type RemasterMixAudioResult,
} from "./remaster-mix-audio";
import { loadZenEcoHomesVisualUrls } from "./remaster-mix-visual-source";
import {
  cleanupRemasterLongFormMix,
  renderRemasterLongFormMix,
  type RemasterMixVideoResult,
} from "./remaster-mix-video";
import {
  addRemasterLongFormToPlaylist,
  createRemasterTopLevelComment,
  ensureRemasterLongFormPlaylist,
  uploadRemasterLongFormFile,
} from "@/services/integrations/remaster-youtube-longform";

const LEASE_SECONDS = 1800;
const HEARTBEAT_MS = 5 * 60 * 1000;

interface MixSnapshotTrack {
  position: number;
  id: string;
  title: string;
  artist?: string | null;
  audioUrl: string;
  genre?: string | null;
  mood?: string | null;
  bpm?: number | null;
  durationSeconds?: number | null;
}

interface MixSnapshot {
  version?: string;
  exactAudioSeconds?: number | null;
  tracks?: MixSnapshotTrack[];
}

interface MixJobRow {
  id: string;
  title: string;
  style: RemasterMixStyle;
  target_minutes: number;
  crossfade_seconds: number;
  playlist_name: string;
  zenecohomes_enabled: boolean;
  visual_region: RemasterMixRegion;
  visual_type: RemasterMixVisualType;
  sponsor_interval_minutes: number;
  cta_text?: string | null;
  input_snapshot: MixSnapshot;
  status: string;
  pipeline_step: string;
  progress: number;
  lease_token: string;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured for the Re-Master mix worker.");
  }
  return createClient(url, key);
}

function rpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] || null) as T | null;
  if (data && typeof data === "object") return data as T;
  return null;
}

function validateTracks(job: MixJobRow) {
  const tracks = Array.isArray(job.input_snapshot?.tracks) ? job.input_snapshot.tracks : [];
  if (tracks.length < 2 || tracks.length > 60) {
    throw new Error("Mix snapshot must contain 2–60 tracks.");
  }
  for (const track of tracks) {
    if (!track.id || !track.title || !track.audioUrl) {
      throw new Error("Mix snapshot contains an incomplete track.");
    }
  }
  return [...tracks].sort((a, b) => a.position - b.position);
}

async function claimNextJob(workerId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("claim_remaster_mix_job", {
    p_worker_id: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw new Error(`Could not claim Re-Master mix job: ${error.message}`);
  return rpcRow<MixJobRow>(data);
}

async function heartbeat(job: MixJobRow, step?: string, progress?: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("heartbeat_remaster_mix_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_lease_seconds: LEASE_SECONDS,
    p_pipeline_step: step || null,
    p_progress: typeof progress === "number" ? progress : null,
  });
  if (error) throw new Error(`Mix heartbeat failed: ${error.message}`);
  const row = rpcRow<MixJobRow>(data);
  if (!row) throw new Error("Mix heartbeat returned no row.");
  return row;
}

async function markUploadStarting(job: MixJobRow) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("mark_remaster_mix_youtube_upload_started", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
  });
  if (error) throw new Error(`Could not mark YouTube upload start: ${error.message}`);
  const row = rpcRow<MixJobRow>(data);
  if (!row) {
    throw new Error(
      "YouTube upload start was rejected because the lease expired or this mix already entered upload.",
    );
  }
  return row;
}

async function completeJob(job: MixJobRow, videoId: string, youtubeUrl: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("complete_remaster_mix_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_youtube_video_id: videoId,
    p_youtube_url: youtubeUrl,
  });
  if (error) throw new Error(`Could not complete Re-Master mix job: ${error.message}`);
  const row = rpcRow<MixJobRow>(data);
  if (!row) throw new Error("Mix completion returned no row.");
  return row;
}

async function failJob(job: MixJobRow, error: unknown, retryable: boolean) {
  const supabase = getSupabase();
  const message = error instanceof Error ? error.message : String(error);
  const code = /youtube/i.test(message)
    ? "YOUTUBE_LONGFORM_FAILED"
    : /ffmpeg|render|audio|visual/i.test(message)
      ? "MIX_RENDER_FAILED"
      : "MIX_WORKER_FAILED";
  const { error: failError } = await supabase.rpc("fail_remaster_mix_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_error_code: code,
    p_error_message: message,
    p_retryable: retryable,
  });
  if (failError) {
    console.error("[RemasterMixWorker] Could not persist failure:", failError.message);
  }
}

async function loadFallbackVisualUrls(tracks: MixSnapshotTrack[], targetMinutes: number) {
  const genre = tracks.find((track) => track.genre)?.genre || "deep house";
  const desired = recommendedVisualCount(targetMinutes);
  const images = await getGenreImages(genre, desired).catch(() => []);
  const urls = [...new Set(images.map((image) => image.imageUrl).filter(Boolean))];
  if (urls.length < 12) {
    throw new Error(`Only ${urls.length} Re-Master fallback visuals available for ${genre}.`);
  }
  return urls.slice(0, desired);
}

function mixPrivacy() {
  const raw = String(process.env.REMASTER_MIX_YOUTUBE_PRIVACY || "private").toLowerCase();
  return raw === "public" || raw === "unlisted" ? raw : "private";
}

async function recordMixInSongHistory(
  job: MixJobRow,
  tracks: MixSnapshotTrack[],
  youtubeUrl: string,
) {
  const supabase = getSupabase();
  const genre = tracks.find((track) => track.genre)?.genre || "Deep House";
  const { error } = await supabase.from("songs").insert({
    name: job.title,
    artist: "Re-Master Freddy",
    brand: REMASTER_CANONICAL_SONG_BRAND,
    youtube_url: youtubeUrl,
    status: "published",
    genre,
    ai_metadata: {
      isMix: true,
      mixType: "mediterranean-longform",
      mixJobId: job.id,
      trackCount: tracks.length,
      zenEcoHomes: job.zenecohomes_enabled,
      processedAt: new Date().toISOString(),
    },
  });
  if (error) {
    console.warn("[RemasterMixWorker] Mix history insert skipped:", error.message);
  }
}

export async function executeClaimedRemasterMixJob(job: MixJobRow) {
  const tracks = validateTracks(job);
  let audio: RemasterMixAudioResult | null = null;
  let video: RemasterMixVideoResult | null = null;
  let uploadStarted = false;
  let jobCompleted = false;

  let lastStep = "claimed";
  let lastProgress = 1;
  const heartbeatTimer = setInterval(() => {
    if (jobCompleted) return;
    heartbeat(job, lastStep, lastProgress).catch((error) => {
      console.error(
        "[RemasterMixWorker] heartbeat timer failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }, HEARTBEAT_MS);

  const report = async (progress: number, step: string) => {
    lastProgress = Math.max(lastProgress, Math.min(99, progress));
    lastStep = step;
    await heartbeat(job, step, lastProgress);
  };

  try {
    await report(4, "building_crossfade_audio");
    audio = await buildRemasterMixAudio(
      tracks.map((track) => ({
        id: track.id,
        title: track.title,
        audioUrl: track.audioUrl,
      })),
      job.crossfade_seconds,
    );

    await report(12, "selecting_visuals");
    const imageUrls = job.zenecohomes_enabled
      ? (await loadZenEcoHomesVisualUrls({
          targetMinutes: job.target_minutes,
          region: job.visual_region,
          visualType: job.visual_type,
        })).urls
      : await loadFallbackVisualUrls(tracks, job.target_minutes);

    const exactAudioSeconds = Number(job.input_snapshot?.exactAudioSeconds || 0) || null;
    video = await renderRemasterLongFormMix({
      audioPath: audio.audioPath,
      imageUrls,
      title: job.title,
      targetMinutes: job.target_minutes,
      sponsorIntervalMinutes: job.sponsor_interval_minutes,
      ctaText: job.cta_text,
      zenEcoHomesEnabled: job.zenecohomes_enabled,
      audioDurationSeconds: exactAudioSeconds,
      onProgress: async (renderProgress, renderStep) => {
        await report(Math.max(15, Math.min(85, renderProgress)), renderStep);
      },
    });

    const trackPlan: MixTrackPlan[] = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      durationSeconds: track.durationSeconds,
    }));
    const description = buildMixDescription({
      title: job.title,
      style: job.style,
      tracks: trackPlan,
      crossfadeSeconds: job.crossfade_seconds,
      zenEcoHomesEnabled: job.zenecohomes_enabled,
      ctaText: job.cta_text,
    });
    const tags = buildMixTags(job.style);

    await report(87, "preparing_youtube_upload");
    await markUploadStarting(job);
    uploadStarted = true;

    const upload = await uploadRemasterLongFormFile({
      videoPath: video.videoPath,
      title: job.title,
      description,
      tags,
      privacyStatus: mixPrivacy(),
    });

    // Persist the verified video before optional enrichment. Playlist/comment
    // failures must never cause a second full upload.
    await completeJob(job, upload.videoId, upload.youtubeUrl);
    jobCompleted = true;
    clearInterval(heartbeatTimer);

    try {
      const playlist = await ensureRemasterLongFormPlaylist(
        job.playlist_name,
        "Long-form Mediterranean deep-house mixes by Re-Master Freddy. Selected editions are presented with ZenEcoHomes Costa Blanca visuals.",
      );
      await addRemasterLongFormToPlaylist(upload.videoId, playlist.playlistId);
    } catch (error) {
      console.warn(
        "[RemasterMixWorker] Playlist enrichment skipped:",
        error instanceof Error ? error.message : error,
      );
    }

    if (job.zenecohomes_enabled) {
      try {
        await createRemasterTopLevelComment(upload.videoId, buildZenEcoHomesComment());
      } catch (error) {
        console.warn(
          "[RemasterMixWorker] Standard ZenEcoHomes comment skipped:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    await recordMixInSongHistory(job, tracks, upload.youtubeUrl);

    return {
      status: "completed" as const,
      jobId: job.id,
      videoId: upload.videoId,
      youtubeUrl: upload.youtubeUrl,
      privacyStatus: upload.privacyStatus,
      playlist: job.playlist_name,
      visuals: video.imageCount,
      durationSeconds: video.durationSeconds,
      fileSizeBytes: video.fileSizeBytes,
    };
  } catch (error) {
    // Once a YouTube upload has started, never auto-retry the whole job: an
    // interrupted response can be ambiguous and a retry could duplicate video.
    await failJob(job, error, !uploadStarted);
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
    if (video) await cleanupRemasterLongFormMix(video);
    if (audio) await cleanupRemasterMixAudio(audio);
  }
}

export async function runOneRemasterMixJob(workerId = `mix-worker-${process.pid}`) {
  const job = await claimNextJob(workerId);
  if (!job) return { status: "idle" as const, workerId };

  try {
    return await executeClaimedRemasterMixJob(job);
  } catch (error) {
    return {
      status: "failed" as const,
      workerId,
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
