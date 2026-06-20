import { NextRequest, NextResponse } from "next/server";
import {
  CORRELATION_ID_HEADER,
  createErrorEnvelope,
  getOrCreateCorrelationId,
} from "@/lib/observability";
import { verifyAdminSession } from "@/lib/admin-auth";
import { assertLeadIntelligenceRateLimit } from "@/services/lead-intelligence/api-guards";
import { isLeadIntelligenceRealEstateBrand } from "@/services/lead-intelligence/brand-allowlist";
import { LEAD_INTELLIGENCE_LIMITS } from "@/services/lead-intelligence/contracts";
import {
  LEAD_INTELLIGENCE_MAX_REQUEST_BYTES,
  LeadIntelligenceAnalyzeRequestSchema,
  LeadIntelligenceError,
  analyzeLeadIntake,
  byteLength,
} from "@/services/lead-intelligence/extraction";
import { isLeadIntelligenceEnabled } from "@/services/lead-intelligence/feature-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function responseHeaders(correlationId: string) {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    "cache-control": "no-store",
  };
}

function jsonError(error: unknown, correlationId: string) {
  const typed =
    error instanceof LeadIntelligenceError
      ? error
      : new LeadIntelligenceError("INTERNAL_ERROR", "Internal server error", 500);
  const safeMessage = typed.code === "AI_INVALID_OUTPUT"
    ? "AI returned invalid structured output"
    : typed.status >= 500 && typed.code !== "AI_TIMEOUT"
      ? "Internal server error"
      : typed.message;

  return NextResponse.json(
    createErrorEnvelope({
      correlationId,
      code: typed.code,
      message: safeMessage,
      status: typed.status,
      details: typed.details,
      retryable: typed.status >= 500 || typed.status === 429 ? "retryable" : "not_retryable",
    }),
    {
      status: typed.status,
      headers: responseHeaders(correlationId),
    },
  );
}

async function authorizeRequest(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session?.email) {
    throw new LeadIntelligenceError("AUTH_REQUIRED", "Authentication required", 401);
  }
  return session.email.toLowerCase();
}

async function readJsonBody(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > LEAD_INTELLIGENCE_MAX_REQUEST_BYTES) {
    throw new LeadIntelligenceError("INPUT_TOO_LONG", "Request body is too large", 413);
  }

  const text = await request.text();
  if (byteLength(text) > LEAD_INTELLIGENCE_MAX_REQUEST_BYTES) {
    throw new LeadIntelligenceError("INPUT_TOO_LONG", "Request body is too large", 413);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid JSON body", 400);
  }
}

function parseBody(body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { rawText?: unknown }).rawText === "string" &&
    (body as { rawText: string }).rawText.length > LEAD_INTELLIGENCE_LIMITS.bodyText
  ) {
    throw new LeadIntelligenceError("INPUT_TOO_LONG", "Henvendelsen er for lang", 413);
  }

  const parsed = LeadIntelligenceAnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid lead intelligence request", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (!isLeadIntelligenceRealEstateBrand(parsed.data.brand)) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Lead Intelligence brand is not allowed", 400, {
      field: "brand",
    });
  }

  return parsed.data;
}

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    const identity = await authorizeRequest(request);

    if (!isLeadIntelligenceEnabled()) {
      throw new LeadIntelligenceError(
        "LEAD_INTELLIGENCE_DISABLED",
        "Lead Intelligence preview is disabled",
        403,
      );
    }

    assertLeadIntelligenceRateLimit(identity);
    const body = await readJsonBody(request);
    const input = parseBody(body);
    const analysis = await analyzeLeadIntake(input, {
      correlationId,
      logger: console,
    });

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        ...analysis,
      },
      {
        status: 200,
        headers: responseHeaders(correlationId),
      },
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
