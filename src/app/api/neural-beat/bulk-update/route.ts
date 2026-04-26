import { NextRequest, NextResponse } from 'next/server';
import { listVideos, updateVideoMetadata } from '@/services/integrations/youtube-client';

export const maxDuration = 300;

const REPLACEMENTS: [RegExp, string][] = [
  [/Neural\s*Beat/gi, 'Re-Master Freddy'],
  [/Neuro\s*Beat/gi, 'Re-Master Freddy'],
  [/#NeuralBeat/gi, '#ReMasterFreddy'],
  [/#NeuroBeat/gi, '#ReMasterFreddy'],
  [/#neuralbeat/gi, '#ReMasterFreddy'],
];

function applyReplacements(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * POST /api/neural-beat/bulk-update
 * Updates all YouTube video titles/descriptions to use "Re-Master Freddy" branding.
 * Streams progress via SSE.
 */
export async function POST(request: NextRequest) {
  try {
    const videos = await listVideos(50, "neuralbeat");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        send({ type: 'start', total: videos.length });

        let updated = 0;
        let skipped = 0;
        const results: { id: string; title: string; changed: boolean }[] = [];

        for (const video of videos) {
          const newTitle = applyReplacements(video.title);
          const newDescription = applyReplacements(video.description);
          const titleChanged = newTitle !== video.title;
          const descChanged = newDescription !== video.description;

          if (!titleChanged && !descChanged) {
            skipped++;
            results.push({ id: video.id, title: video.title, changed: false });
            send({ type: 'skip', videoId: video.id, title: video.title, progress: updated + skipped, total: videos.length });
            continue;
          }

          try {
            await updateVideoMetadata(video.id, {
              title: newTitle,
              description: newDescription,
            });
            updated++;
            results.push({ id: video.id, title: newTitle, changed: true });
            send({
              type: 'updated',
              videoId: video.id,
              oldTitle: video.title,
              newTitle,
              titleChanged,
              descChanged,
              progress: updated + skipped,
              total: videos.length,
            });
          } catch (err) {
            results.push({ id: video.id, title: video.title, changed: false });
            send({
              type: 'error',
              videoId: video.id,
              title: video.title,
              error: err instanceof Error ? err.message : 'Update failed',
              progress: updated + skipped,
              total: videos.length,
            });
            skipped++;
          }

          // Small delay to avoid rate limiting
          await new Promise((r) => setTimeout(r, 500));
        }

        send({ type: 'done', updated, skipped, total: videos.length, results });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk update failed' },
      { status: 500 }
    );
  }
}
