import { NextRequest, NextResponse } from 'next/server';
import {
  getSongs,
  getSongsWithoutYouTube,
  getSongById,
  createSong,
  clearSongFields,
  isConfigured,
} from '@/services/integrations/airtable-client';
import { deleteVideo, extractVideoId } from '@/services/integrations/youtube-client';
import { NeuralBeatPipeline } from '@/services/pipelines/neural-beat-pipeline';
import type { SongRecord, PipelineRun } from '@/lib/types';

// ─── Vercel serverless: allow up to 5 minutes for pipeline execution ──
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({
        songs: [],
        total: 0,
        source: 'not-configured',
        message: 'Supabase not configured.',
      });
    }

    const songs = await getSongs();
    return NextResponse.json({
      songs,
      total: songs.length,
      source: 'supabase',
    });
  } catch (error) {
    return NextResponse.json(
      {
        songs: [],
        total: 0,
        source: 'error',
        message: error instanceof Error ? error.message : 'Database error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/neural-beat
 * Register a new song after MP3 has been uploaded to Supabase Storage.
 * Accepts JSON: { title, artist, audioUrl }
 */
export async function PUT(request: NextRequest) {
  try {
    const { title, artist, audioUrl } = await request.json();

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const song = await createSong({
      title: title || 'Untitled',
      artist: artist || 'Re-Master Freddy',
      audioUrl,
    });

    return NextResponse.json({
      success: true,
      song,
      message: 'MP3 lastet opp og sang registrert i databasen',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { recordId } = body;
    const {
      auto,
      customImageUrls,
      logoUrl,
      customThumbnailUrl,
      autoSchedule,
      customPublishAt,
      multilingualDescription,
    } = body;

    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Supabase not configured.' },
        { status: 503 }
      );
    }

    // Auto-mode: pick the next unpublished song automatically
    if (auto && !recordId) {
      const unpublished = await getSongsWithoutYouTube();
      const withAudio = unpublished.filter((s) => s.audioUrl);
      if (withAudio.length === 0) {
        return NextResponse.json(
          { message: 'No unpublished songs with audio available', status: 'idle' },
          { status: 200 }
        );
      }
      recordId = withAudio[0].id;
    }

    if (!recordId) {
      return NextResponse.json(
        { error: 'recordId is required (or use { auto: true })' },
        { status: 400 }
      );
    }

    // Fetch the song record from Supabase
    const songRecord = await getSongById(recordId);
    const pipelineId = `${Date.now()}_${recordId}`;

    // ─── SSE Streaming Response ──────────────────────────────────────
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream might be closed by client
          }
        };

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
          } catch {
            clearInterval(heartbeat);
          }
        }, 10000);

        send({ id: pipelineId, recordId, status: 'running', steps: [] });

        const pipeline = new NeuralBeatPipeline();
        pipeline.onProgress = (run) => {
          send({
            id: pipelineId,
            recordId,
            status: run.status,
            steps: run.steps,
            output: run.output,
            error: run.error,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
          });
        };

        try {
          const pipelineRun = await pipeline.execute(songRecord, {
            customImageUrls: customImageUrls || [],
            logoUrl: logoUrl || undefined,
            customThumbnailUrl: customThumbnailUrl || undefined,
            autoSchedule: !!autoSchedule,
            customPublishAt: customPublishAt || undefined,
            multilingualDescription: !!multilingualDescription,
          });
          send({
            id: pipelineId,
            recordId,
            status: pipelineRun.status,
            steps: pipelineRun.steps,
            output: pipelineRun.output,
            error: pipelineRun.error,
            startedAt: pipelineRun.startedAt,
            completedAt: pipelineRun.completedAt,
          });
        } catch (err) {
          send({
            id: pipelineId,
            recordId,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Pipeline crashed',
          });
        }

        clearInterval(heartbeat);
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger Neural Beat processing' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/neural-beat
 * Delete a video from YouTube and clear database fields.
 * Body: { recordId: string, youtubeUrl: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { recordId, youtubeUrl } = body;

    if (!recordId || !youtubeUrl) {
      return NextResponse.json(
        { error: 'recordId and youtubeUrl are required' },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: `Could not extract video ID from URL: ${youtubeUrl}` },
        { status: 400 }
      );
    }

    // Delete from YouTube
    try {
      await deleteVideo(videoId);
    } catch (ytError) {
      const msg = ytError instanceof Error ? ytError.message : String(ytError);
      if (!msg.includes('404') && !msg.includes('videoNotFound')) {
        throw new Error(`YouTube delete failed: ${msg}`);
      }
      console.warn(`[NeuralBeat] Video ${videoId} already deleted or not found, clearing DB anyway`);
    }

    // Clear database fields
    await clearSongFields(recordId);

    return NextResponse.json({
      success: true,
      message: `Video ${videoId} deleted from YouTube and database fields cleared.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete video' },
      { status: 500 }
    );
  }
}
