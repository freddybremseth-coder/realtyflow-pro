export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  getSongsWithoutYouTube,
  getSongById,
  isConfigured,
} from '@/services/integrations/airtable-client';
import { NeuralBeatPipeline } from '@/services/pipelines/neural-beat-pipeline';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';

// ─── Vercel serverless: allow up to 5 minutes for batch processing ──
export const maxDuration = 300;

/**
 * GET /api/neural-beat/cron
 *
 * Automatic daily batch processing: processes up to 3 unpublished songs.
 * Designed for Vercel Cron Jobs — runs once per day.
 *
 * Security: requires CRON_SECRET in Authorization header.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const MAX_SONGS = 3;
  const SAFETY_MARGIN_MS = 30_000;
  const MAX_TIME_MS = (maxDuration * 1000) - SAFETY_MARGIN_MS;

  // ── Auth check ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const safeMode = await evaluateCronSafeMode('/api/neural-beat/cron');
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
    });
  }

  // ── Config check ──
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Supabase is not configured' },
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
      // Fetch fresh record
      const songRecord = await getSongById(song.id);

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
