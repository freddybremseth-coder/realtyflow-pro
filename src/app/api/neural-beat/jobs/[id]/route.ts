import { NextRequest } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/observability";
import {
  assertRemasterJob,
  assertSafeJobId,
  getRouteContext,
  jsonError,
  jsonOk,
  toJobDto,
} from "@/services/pipelines/remaster-job-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    assertSafeJobId(params.id);
    const { repository } = await getRouteContext(request, "get");
    const job = assertRemasterJob(await repository.getJob(params.id));

    return jsonOk({ job: toJobDto(job) }, 200, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
