import { NextRequest } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/observability";
import {
  assertCanManualRetry,
  assertRemasterJob,
  assertSafeJobId,
  getRouteContext,
  jsonError,
  jsonOk,
  toJobDto,
} from "@/services/pipelines/remaster-job-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    assertSafeJobId(params.id);
    const { repository, correlationUuid } = await getRouteContext(request, "retry", 10);
    const existing = assertRemasterJob(await repository.getJob(params.id));
    assertCanManualRetry(existing);
    const job = assertRemasterJob(await repository.manualRetry({
      jobId: params.id,
      correlationId: correlationUuid,
    }));

    return jsonOk({ job: toJobDto(job), retried: true }, 200, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
