import { NextRequest, NextResponse } from 'next/server';
import {
  getSongs,
  getSongsWithoutYouTube,
  isConfigured,
  getRecord,
  createRecord,
  clearSongFields,
} from '@/services/integrations/airtable-client';
import { deleteVideo, extractVideoId } from '@/services/integrations/youtube-client';
import { NeuralBeatPipeline } from '@/services/pipelines/neural-beat-pipeline';
import type { AirtableSongRecord, PipelineRun } from '@/lib/types';

// ─── Vercel serverless: allow up to 5 minutes for pipeline execution ──
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

export async function GET(request: NextRequest) {
  // List all songs (pipeline status is now streamed via POST SSE)
  try {
    if (isConfigured()) {
      const songs = await getSongs();
      return NextResponse.json({
        songs,
        total: songs.length,
        source: 'airtable',
      });
    }

    return NextResponse.json({
      songs: [],
      total: 0,
      source: 'not-configured',
      message: 'Airtable not configured. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID for live data.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        songs: [],
        total: 0,
        source: 'error',
        message: error instanceof Error ? error.message : 'Airtable error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/neural-beat
 * Register a new song after MP3 has been uploaded to Supabase Storage from the client.
 * Accepts JSON: { title, artist, audioUrl }
 * Creates an Airtable record with the audio URL.
 */
export async function PUT(request: NextRequest) {
  try {
    const { title, artist, audioUrl } = await request.json();

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
    }

    // Create Airtable record if configured
    let recordId: string | undefined;
    if (isConfigured()) {
      const songsTable = process.env.AIRTABLE_SONGS_TABLE || 'Songs';
      try {
        const record = await createRecord(songsTable, {
          [SONG_FIELD_MAP.trackName]: title || 'Untitled',
          [SONG_FIELD_MAP.audioFile]: [{ url: audioUrl }],
        });
        recordId = record.id;
      } catch (airtableErr) {
        console.warn('[NeuralBeat] Airtable create failed:', airtableErr);
      }
    }

    return NextResponse.json({
      success: true,
      song: {
        id: recordId || `local-${Date.now()}`,
        title,
        artist,
        audioUrl,
      },
      message: `MP3 lastet opp${recordId ? ' og Airtable-post opprettet' : ''}`,
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
    const { auto } = body;

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

    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Airtable is not configured. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID.' },
        { status: 503 }
      );
    }

    // Fetch the song record from Airtable
    const songsTable = process.env.AIRTABLE_SONGS_TABLE || 'Songs';
    const rawRecord = await getRecord(songsTable, recordId);
    const songRecord = mapRawRecordToSong(rawRecord);

    const pipelineId = `${Date.now()}_${recordId}`;

    // ─── SSE Streaming Response ──────────────────────────────────────
    // Stream pipeline progress as Server-Sent Events with keep-alive
    // heartbeats every 15s to prevent proxy/CDN timeout during long steps.
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

        // Keep-alive heartbeat: send actual data events every 10s to prevent
        // Vercel CDN/proxy from closing idle connections. Using real data: events
        // (not SSE comments) because CDN may buffer/ignore comment-only frames.
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
          } catch {
            clearInterval(heartbeat);
          }
        }, 10000);

        // Send initial status
        send({ id: pipelineId, recordId, status: 'running', steps: [] });

        // Create pipeline with progress streaming
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
          const pipelineRun = await pipeline.execute(songRecord);
          // Send final state
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
 * Delete a video from YouTube and clear Airtable fields.
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

    // 1. Extract video ID from YouTube URL
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: `Could not extract video ID from URL: ${youtubeUrl}` },
        { status: 400 }
      );
    }

    // 2. Delete from YouTube
    try {
      await deleteVideo(videoId);
    } catch (ytError) {
      const msg = ytError instanceof Error ? ytError.message : String(ytError);
      // If video already deleted (404), continue to clear Airtable
      if (!msg.includes('404') && !msg.includes('videoNotFound')) {
        throw new Error(`YouTube delete failed: ${msg}`);
      }
      console.warn(`[NeuralBeat] Video ${videoId} already deleted or not found, clearing Airtable anyway`);
    }

    // 3. Clear Airtable fields (YouTube URL, AI Metadata, Generated Image)
    await clearSongFields(recordId);

    return NextResponse.json({
      success: true,
      message: `Video ${videoId} deleted from YouTube and Airtable fields cleared.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete video' },
      { status: 500 }
    );
  }
}
