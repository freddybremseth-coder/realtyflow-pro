import { createClient } from "@supabase/supabase-js";
import { getGenreImages, REMASTER_CANONICAL_SONG_BRAND } from "@/services/integrations/airtable-client";
import {
  buildMixDescription,
  buildMixTags,
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
import { diagnoseExplicitMixSelection, MixSelectionValidationError } from "./remaster-mix-selection-validation";
import { buildRemasterPartnerComment, type PartnerCommentStyle } from "./remaster-mix-partner-comment";
import { renderArtLoungeThumbnail } from "./remaster-mix-art-thumbnail";
import { loadPublishedMixArt, loadPublishedMixBooks, selectApprovedPromotionItems, type PromotionBrand, type PromotionSelection, type PromotionItem } from "./remaster-mix-promotions";
import {
  cleanupRemasterLongFormMix,
  renderRemasterLongFormMix,
  type RemasterMixVideoResult,
} from "./remaster-mix-video";
import {
  addRemasterLongFormToPlaylist,
  createRemasterTopLevelComment,
  ensureRemasterLongFormPlaylist,
  isRemasterYouTubeReconnectRequired,
  uploadRemasterLongFormFile,
  setRemasterLongFormThumbnail,
  verifyRemasterLongFormYouTubeConnection,
} from "@/services/integrations/remaster-youtube-longform";

// Renew often while encoding still images; if the process is terminated by
// infrastructure, the existing DB claim RPC can recover without a 30m blackout.
const LEASE_SECONDS = 600;
const HEARTBEAT_MS = 60 * 1000;

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
  visualPlan?: PromotionSelection & {source?:string; visualTypes?: RemasterMixVisualType[];
    thumbnailStyle?:"art-lounge"|"standard"; thumbnailTitle?:string;
    commentStyle?:PartnerCommentStyle};
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
  const code = error instanceof MixSelectionValidationError
    ? "MIX_PROMOTION_SELECTION_INVALID"
    : isRemasterYouTubeReconnectRequired(error)
    ? "YOUTUBE_RECONNECT_REQUIRED"
    : /youtube/i.test(message)
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
  // Production policy: autonomous Re-Master long-form mixes are always public.
  // Environment drift must never silently create private or unlisted uploads.
  return "public" as const;
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
      promotionBrand: job.input_snapshot?.visualPlan?.brand || job.input_snapshot?.visualPlan?.source || (job.zenecohomes_enabled ? "zeneco" : "none"),
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
    await report(2, "verifying_youtube_connection");
    await verifyRemasterLongFormYouTubeConnection();

    // Fail *before* audio transcoding if a saved artwork or cover is no longer
    // published or its actual style/collection conflicts with selected filters.
    // Never retry a deterministic owner-selection mismatch on a worker lease.
    const savedBrand = job.input_snapshot?.visualPlan?.brand || job.input_snapshot?.visualPlan?.source;
    const brand: PromotionBrand = ['zeneco','art','books','none'].includes(String(savedBrand))
      ? savedBrand as PromotionBrand
      : (job.zenecohomes_enabled ? 'zeneco' : 'none');
    let checkedCatalog: PromotionItem[] | null = null;
    if (brand === "art" || brand === "books") {
      await report(3, "validating_promotion_selection");
      checkedCatalog = brand === "art" ? await loadPublishedMixArt() : await loadPublishedMixBooks();
      const issues = diagnoseExplicitMixSelection(checkedCatalog, {
        ...job.input_snapshot?.visualPlan,
        brand, randomSeed: job.input_snapshot?.visualPlan?.randomSeed || job.id,
      });
      if(issues.length) throw new MixSelectionValidationError(issues);
    }
    await report(4, "building_crossfade_audio");
    audio = await buildRemasterMixAudio(
      tracks.map((track) => ({
        id: track.id,
        title: track.title,
        audioUrl: track.audioUrl,
      })),
      job.crossfade_seconds,
      job.target_minutes * 60,
    );

    await report(12, "selecting_visuals");
    // For legacy plans, keep the exact previous ZenEcoHomes/music behavior.
    // For modern plans, use only the chosen public content from ONE partner.
    let promotedItems: PromotionItem[] = [];
    const imageUrls = brand === 'zeneco'
      ? (await loadZenEcoHomesVisualUrls({
          targetMinutes: job.target_minutes,
          region: job.visual_region,
          visualType: job.visual_type,
          visualTypes: job.input_snapshot?.visualPlan?.visualTypes,
          randomSeed: job.input_snapshot?.visualPlan?.randomSeed || job.id,
          strictSelection: job.input_snapshot?.version === "cross-brand-mix-v2",
        })).urls
      : brand === 'art' || brand === 'books'
        ? await (async () => {
            const catalog = checkedCatalog || (brand === 'art' ? await loadPublishedMixArt() : await loadPublishedMixBooks());
            const finalIssues = diagnoseExplicitMixSelection(catalog, {
              ...job.input_snapshot?.visualPlan, brand,
              randomSeed: job.input_snapshot?.visualPlan?.randomSeed || job.id,
            });
            if(finalIssues.length) throw new MixSelectionValidationError(finalIssues);
            const selected = selectApprovedPromotionItems(catalog, {
              ...job.input_snapshot?.visualPlan, brand,
              randomSeed: job.input_snapshot?.visualPlan?.randomSeed || job.id,
            }, recommendedVisualCount(job.target_minutes));
            if (!selected.length) throw new Error('No published '+brand+' visuals match the saved mix selection');
            // Explicit IDs are validated directly above, not inferred from a 180-image random sample.
            promotedItems = selected;
            return selected.map(item => item.imageUrl);
          })()
        : await loadFallbackVisualUrls(tracks, job.target_minutes);

    const exactAudioSeconds = audio.durationSeconds;
    video = await renderRemasterLongFormMix({
      audioPath: audio.audioPath,
      imageUrls,
      title: job.title,
      targetMinutes: job.target_minutes,
      sponsorIntervalMinutes: job.sponsor_interval_minutes,
      ctaText: job.cta_text,
      zenEcoHomesEnabled: brand === 'zeneco',
      promotionBrand: brand,
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
      zenEcoHomesEnabled: brand === 'zeneco',
      promotionBrand: brand,
      promotedItems,
      ctaText: job.cta_text,
    });
    const tags = buildMixTags(job.style, brand);

    // Resolve the optional YouTube thumbnail before the irreversible upload.
    // Thumbnail errors must NOT replay the expensive 30-minute render or cause
    // a duplicate YouTube publication: default YouTube artwork is the fallback.
    let thumbnailJpeg: Buffer | null = null;
    if (brand === "art" && job.input_snapshot?.visualPlan?.thumbnailStyle === "art-lounge") {
      try {
        thumbnailJpeg = await renderArtLoungeThumbnail({
          title: job.input_snapshot.visualPlan.thumbnailTitle || job.title,
          imageUrls: promotedItems.map(item=>item.imageUrl),
          footer:"ART.FREDDYBREMSETH.COM  -  MUSIC BY RE-MASTER FREDDY",
        });
      } catch (error) {
        console.warn("[RemasterMixWorker] Art Lounge thumbnail unavailable; YouTube default will be used:",
          error instanceof Error ? error.message : error);
      }
    }

    await report(87, "preparing_youtube_upload");
    const upload = await uploadRemasterLongFormFile({
      videoPath: video.videoPath,
      title: job.title,
      description,
      tags,
      privacyStatus: mixPrivacy(),
      onReadyToInsert: async () => {
        await markUploadStarting(job);
        uploadStarted = true;
      },
    });

    if (upload.privacyStatus !== "public") {
      throw new Error(`YOUTUBE_LONGFORM_NOT_PUBLIC: YouTube verified privacy as ${upload.privacyStatus}.`);
    }

    // Persist the verified public video before optional enrichment. Playlist/comment
    // failures must never cause a second full upload.
    await completeJob(job, upload.videoId, upload.youtubeUrl);
    jobCompleted = true;
    clearInterval(heartbeatTimer);

    if (thumbnailJpeg) {
      try {
        await setRemasterLongFormThumbnail(upload.videoId, thumbnailJpeg);
      } catch (error) {
        // Thumbnail enrichment never changes the verified completed video.
        console.warn("[RemasterMixWorker] YouTube thumbnail update skipped; video remains published:",
          error instanceof Error ? error.message : error);
      }
    }

    try {
      const playlist = await ensureRemasterLongFormPlaylist(
        job.playlist_name,
        "Long-form Re-Master Freddy music mixes featuring music, Costa Blanca homes, published art or books by Freddy Bremseth.",
      );
      await addRemasterLongFormToPlaylist(upload.videoId, playlist.playlistId);
    } catch (error) {
      console.warn(
        "[RemasterMixWorker] Playlist enrichment skipped:",
        error instanceof Error ? error.message : error,
      );
    }

    // One useful brand-specific top-level comment per verified public video.
    // Only list actually selected/published art and book links, never invent
    // a property detail URL from a picture. No duplicate video/upload if
    // YouTube disallows commenting: optional post-publication enrichment only.
    try {
      const plan = job.input_snapshot?.visualPlan;
      const comment = buildRemasterPartnerComment({
        brand,
        style: plan?.commentStyle || "detailed",
        title: job.title,
        promotedItems,
        artStyles: plan?.artStyles, artCollections: plan?.artCollections,
        bookSeries: plan?.bookSeries, bookLanguages: plan?.bookLanguages,
        region: job.visual_region,
        visualTypes: plan?.visualTypes || [job.visual_type],
      });
      if (comment.trim()) await createRemasterTopLevelComment(upload.videoId, comment);
    } catch (error) {
      console.warn(
        "[RemasterMixWorker] Partner comment skipped; published mix remains complete:",
        error instanceof Error ? error.message : error,
      );
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
    // A reconnect-required failure is also terminal until an operator repairs
    // OAuth, otherwise the recovery loop would repeatedly rerender the mix.
    const reconnectRequired = isRemasterYouTubeReconnectRequired(error);
    await failJob(job, error, !uploadStarted && !reconnectRequired && !(error instanceof MixSelectionValidationError));
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
