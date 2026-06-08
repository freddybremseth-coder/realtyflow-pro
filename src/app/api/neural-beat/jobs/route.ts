import { NextRequest } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/observability";
import {
  assertRemasterJob,
  createJobResultResponse,
  getRouteContext,
  jsonError,
  jsonOk,
  parseCreateJobBody,
  parseListQuery,
  readJsonBody,
  toJobDto,
} from "@/services/pipelines/remaster-job-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    const { repository } = await getRouteContext(request, "list", 30, correlationId);
    const query = parseListQuery(request.nextUrl.searchParams);
    const jobs = await repository.listJobs({
      brand: "remasterfreddy",
      songId: query.songId,
      status: query.status,
      limit: query.limit,
    });

    return jsonOk(
      {
        jobs: jobs.map((job) => toJobDto(assertRemasterJob(job))),
        limit: query.limit || 50,
      },
      200,
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    const { repository } = await getRouteContext(request, "create", 20, correlationId);
    const body = await readJsonBody(request, correlationId);
    const input = parseCreateJobBody(body);
    const result = await repository.createJob(input);
    return createJobResultResponse(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
