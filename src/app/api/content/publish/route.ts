import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-admin';

export const maxDuration = 300;

/**
 * POST /api/content/publish
 * Start a content publishing pipeline with SSE streaming.
 * Body: { brandId, contentType, platforms[], title, description, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { brandId, contentType, platforms, title } = body;

    if (!brandId || !contentType || !platforms?.length) {
      return NextResponse.json(
        { error: 'brandId, contentType, and platforms are required' },
        { status: 400 }
      );
    }

    const { ContentPublishingPipeline } = await import('@/services/pipelines/content-pipeline');
    const pipelineId = `pub_${Date.now()}_${brandId}`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
          } catch { clearInterval(heartbeat); }
        }, 10000);

        send({ id: pipelineId, status: 'running', steps: [] });

        const pipeline = new ContentPublishingPipeline();
        pipeline.onProgress = (run) => {
          send({
            id: pipelineId,
            status: run.status,
            steps: run.steps,
            output: run.output,
            error: run.error,
          });
        };

        try {
          const result = await pipeline.execute({
            brandId,
            contentType,
            platforms,
            title: title || 'Untitled',
            description: body.description,
            mediaUrls: body.mediaUrls,
            audioUrl: body.audioUrl,
            generateTitle: body.generateTitle,
            generateDescription: body.generateDescription,
            generateTags: body.generateTags,
            generateImage: body.generateImage,
            generateVideo: body.generateVideo,
            brandTone: body.brandTone,
            targetAudience: body.targetAudience,
            language: body.language || 'no',
            privacyStatus: body.privacyStatus || 'public',
          });

          send({
            id: pipelineId,
            status: result.status,
            steps: result.steps,
            output: result.output,
            error: result.error,
          });
        } catch (err) {
          send({
            id: pipelineId,
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
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start publishing' },
      { status: 500 }
    );
  }
}
