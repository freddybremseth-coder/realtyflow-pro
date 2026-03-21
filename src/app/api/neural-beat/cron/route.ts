import { NextRequest, NextResponse } from 'next/server';
import {
  getSongsWithoutYouTube,
  getRecord,
  isConfigured,
} from '@/services/integrations/airtable-client';
import { NeuralBeatPipeline } from '@/services/pipelines/neural-beat-pipeline';
import type { AirtableSongRecord } from '@/lib/types';

// ─── Vercel serverless: allow up to 5 minutes for batch processing ──
export const maxDuration = 300;

// Field mapping for the "Make.com Songs" Airtable table
const SONG_FIELD_MAP = {
  trackName: 'Track Name',
  audioFile: 'Audio File',
  youtubeUrl: 'YouTube URL',
  aiMetadata: 'AI Metadata',
  generatedImage: 'Generated Image',
  lastModifiedTime: 'Last Modified Time',
  created: 'Created',
} as const;

function extractAttachmentUrl(field: any): string | undefined {
  if (!field) return undefined;
  if (typeof field === 'string') return field;
  if (Array.isArray(field) && field.length > 0) return field[0].url || undefined;
  return undefined;
}

function mapRawRecordToSong(record: { id: string; fields: Record<string, any> }): AirtableSongRecord {
  const f = record.fields;
  let metadata: Record<string, any> | undefined;
  const rawMeta = f[SONG_FIELD_MAP.aiMetadata];
  if (rawMeta) {
    if (typeof rawMeta === 'string') {
      try { metadata = JSON.parse(rawMeta); } catch { metadata = { raw: rawMeta }; }
    } else {
      metadata = rawMeta;
    }
  }

  return {
    id: record.id,
    title: f[SONG_FIELD_MAP.trackName] || '',
    artist: 'Neural Beat',
    audioUrl: extractAttachmentUrl(f[SONG_FIELD_MAP.audioFile]),
    status: undefined,
    genre: metadata?.genre,
    mood: metadata?.mood,
    bpm: metadata?.bpm,
    imageUrl: extractAttachmentUrl(f[SONG_FIELD_MAP.generatedImage]),
    youtubeUrl: f[SONG_FIELD_MAP.youtubeUrl] || undefined,
    metadata,
    lastModifiedTime: f[SONG_FIELD_MAP.lastModifiedTime],
    createdTime: f[SONG_FIELD_MAP.created],
  };
}

/**
 * GET /api/neural-beat/cron
 *
 * Automatic daily batch processing: processes up to 3 unpublished songs.
 * Designed for Vercel Cron Jobs — runs once per day.
 *
 * Security: requires CRON_SECRET in Authorization header.
 *
 * Each song is processed sequentially (not parallel) to stay within
 * Vercel's 1024 MB memory limit. Tracks elapsed time and stops
 * before hitting the 5-minute function timeout.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const MAX_SONGS = 3;
  const SAFETY_MARGIN_MS = 30_000; // Stop 30s before timeout to allow cleanup
  const MAX_TIME_MS = (maxDuration * 1000) - SAFETY_MARGIN_MS;

  // ── Auth check ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Config check ──
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Airtable is not configured' },
      { status: 503 }
    );
  }

  console.log(`[Cron] Neural Beat batch processing started (max ${MAX_SONGS} songs)`);

  // ── Get unpublished songs ──
  const unpublished = await getSongsWithoutYouTube();
  const withAudio = unpublished.filter((s) => s.audioUrl);

  if (withAudio.length === 0) {
    console.log('[Cron] No unpublished songs with audio available');
    return NextResponse.json({
      message: 'No unpublished songs with audio available',
      processed: 0,
      remaining: 0,
    });
  }

  const toProcess = withAudio.slice(0, MAX_SONGS);
  console.log(`[Cron] Found ${withAudio.length} unpublished songs, processing ${toProcess.length}`);

  const results: Array<{
    recordId: string;
    title: string;
    status: 'completed' | 'failed' | 'skipped';
    youtubeUrl?: string;
    error?: string;
    durationSeconds: number;
  }> = [];

  // ── Process songs sequentially ──
  const songsTable = process.env.AIRTABLE_SONGS_TABLE || 'Songs';

  for (let i = 0; i < toProcess.length; i++) {
    const song = toProcess[i];
    const songStartTime = Date.now();

    // Check if we have enough time for another song
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_TIME_MS) {
      console.log(`[Cron] Time limit approaching (${(elapsed / 1000).toFixed(0)}s elapsed), stopping`);
      results.push({
        recordId: song.id,
        title: song.title,
        status: 'skipped',
        error: 'Skipped due to time limit',
        durationSeconds: 0,
      });
      continue;
    }

    console.log(`[Cron] Processing song ${i + 1}/${toProcess.length}: "${song.title}" (${song.id})`);

    try {
      // Fetch fresh record from Airtable
      const rawRecord = await getRecord(songsTable, song.id);
      const songRecord = mapRawRecordToSong(rawRecord);

      // Execute pipeline
      const pipeline = new NeuralBeatPipeline();
      const pipelineRun = await pipeline.execute(songRecord);

      const durationSeconds = (Date.now() - songStartTime) / 1000;

      if (pipelineRun.status === 'completed') {
        const youtubeUrl = pipelineRun.output?.youtubeUrl;
        console.log(`[Cron] Song "${song.title}" completed in ${durationSeconds.toFixed(0)}s → ${youtubeUrl}`);
        results.push({
          recordId: song.id,
          title: song.title,
          status: 'completed',
          youtubeUrl,
          durationSeconds,
        });
      } else {
        console.error(`[Cron] Song "${song.title}" failed: ${pipelineRun.error}`);
        results.push({
          recordId: song.id,
          title: song.title,
          status: 'failed',
          error: pipelineRun.error || 'Unknown pipeline error',
          durationSeconds,
        });
      }
    } catch (err) {
      const durationSeconds = (Date.now() - songStartTime) / 1000;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Song "${song.title}" crashed: ${errorMsg}`);
      results.push({
        recordId: song.id,
        title: song.title,
        status: 'failed',
        error: errorMsg,
        durationSeconds,
      });
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(0);
  const completed = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(`[Cron] Batch complete: ${completed} completed, ${failed} failed, ${skipped} skipped in ${totalDuration}s`);

  return NextResponse.json({
    processed: results.length,
    completed,
    failed,
    skipped,
    remaining: withAudio.length - toProcess.length,
    totalDurationSeconds: Number(totalDuration),
    results,
  });
}
