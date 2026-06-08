import { NextRequest } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/observability";
import {
  assertRemasterJob,
  assertSafeJobId,
  getRouteContext,
  jsonError,
  jsonOk,
  parseEventsQuery,
  toEventDtos,
} from "@/services/pipelines/remaster-job-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    assertSafeJobId(params.id);
    const { repository } = await getRouteContext(request, "events");
    assertRemasterJob(await repository.getJob(params.id));
    const query = parseEventsQuery(request.nextUrl.searchParams);
    const events = await repository.listEvents({
      jobId: params.id,
      limit: query.limit,
      afterSequence: query.afterSequence,
    });

    return jsonOk(
      {
        events: toEventDtos(events),
        limit: query.limit || 100,
      },
      200,
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
