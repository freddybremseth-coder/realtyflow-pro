import { NextRequest } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/observability";
import {
  assertRemasterJob,
  assertSafeJobId,
  classifyCancelResponse,
  getRouteContext,
  jsonError,
  jsonOk,
  RemasterJobApiError,
  readJsonBody,
  toJobDto,
} from "@/services/pipelines/remaster-job-api";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    assertSafeJobId(params.id);
    const { repository, correlationUuid } = await getRouteContext(request, "cancel", 10, correlationId);
    assertRemasterJob(await repository.getJob(params.id));
    const body = await readJsonBody(request, correlationId);
    const parsed = cancelBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new RemasterJobApiError("VALIDATION_FAILED", "Invalid cancellation payload", 400);
    }
    const reason = parsed.data.reason || "Cancellation requested from Re-Master";
    const job = assertRemasterJob(await repository.requestCancel(params.id, reason, correlationUuid));

    return jsonOk(
      {
        job: toJobDto(job),
        result: classifyCancelResponse(job),
      },
      200,
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
