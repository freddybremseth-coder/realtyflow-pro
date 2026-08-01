import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import {
  CORRELATION_ID_HEADER,
  createErrorEnvelope,
  getOrCreateCorrelationId,
} from "@/lib/observability";
import {
  SocialIntelligenceActionSchema,
  SocialAnalyzeRequestSchema,
} from "@/services/social-intelligence/contracts";
import {
  analyzeAndPersistProfile,
  compactAnalysisForClient,
  acceptProfileSection,
  getSocialRouteContext,
  linkSocialEntity,
  loadSocialDashboard,
  saveBrandProfile,
  savePostMetrics,
  saveSocialPost,
  summarizeSafeError,
  updateRecommendationStatus,
} from "@/services/social-intelligence/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BODY_BYTES = 512 * 1024;
const MAX_ANALYSIS_TEXT_CHARS = 12_000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

type ErrorContext = {
  action?: string;
  organizationId?: string;
  userEmail?: string;
};

function headers(correlationId: string) {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    "cache-control": "no-store",
  };
}

function redactEmail(value?: string) {
  if (!value) return undefined;
  const [name, domain] = value.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 2)}***@${domain}`;
}

function getErrorField(error: unknown, key: string) {
  if (!error || typeof error !== "object" || !(key in error)) return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function isZodLikeError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ((error as { name?: unknown }).name === "ZodError" || Array.isArray((error as { issues?: unknown }).issues)),
  );
}

function zodMessage(error: unknown) {
  if (!error || typeof error !== "object" || !Array.isArray((error as { issues?: unknown }).issues)) {
    return "Ugyldig forespørsel.";
  }
  const issues = (error as { issues: Array<{ path?: unknown[]; message?: string }> }).issues;
  const first = issues[0];
  const path = Array.isArray(first?.path) ? first.path.join(".") : "input";
  return `${path || "input"}: ${first?.message || "ugyldig verdi"}`;
}

function compactLongProfileText(value: string) {
  if (value.length <= MAX_ANALYSIS_TEXT_CHARS) {
    return { text: value, truncated: false, originalLength: value.length };
  }

  const marker = "\n\n[... RealtyFlow forkortet midtdelen av en lang profiltekst for analyse ...]\n\n";
  const headLength = 8_000;
  const tailLength = Math.max(1_000, MAX_ANALYSIS_TEXT_CHARS - headLength - marker.length);
  return {
    text: `${value.slice(0, headLength)}${marker}${value.slice(-tailLength)}`,
    truncated: true,
    originalLength: value.length,
  };
}

function normalizeLargeAnalysisRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { body, warning: null as null | Record<string, unknown> };
  }

  const record = body as Record<string, unknown>;
  if (record.action !== "analyze_profile") {
    return { body, warning: null as null | Record<string, unknown> };
  }

  const payload = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { body, warning: null as null | Record<string, unknown> };
  }

  const importValue = (payload as Record<string, unknown>).import;
  if (!importValue || typeof importValue !== "object" || Array.isArray(importValue)) {
    return { body, warning: null as null | Record<string, unknown> };
  }

  const reviewedText = (importValue as Record<string, unknown>).reviewedText;
  if (typeof reviewedText !== "string") {
    return { body, warning: null as null | Record<string, unknown> };
  }

  const compacted = compactLongProfileText(reviewedText);
  if (!compacted.truncated) {
    return { body, warning: null as null | Record<string, unknown> };
  }

  return {
    body: {
      ...record,
      payload: {
        ...(payload as Record<string, unknown>),
        import: {
          ...(importValue as Record<string, unknown>),
          reviewedText: compacted.text,
        },
      },
    },
    warning: {
      code: "PROFILE_TEXT_COMPACTED",
      message: "Profilteksten var svært lang. RealtyFlow analyserte starten og slutten av dokumentet.",
      originalLength: compacted.originalLength,
      analyzedLength: compacted.text.length,
    },
  };
}

async function requireSocialAccess(request: NextRequest, mode: "read" | "write") {
  const context = await getRequestAccessContext(request);
  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        { ok: false, error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
        { status: 401 },
      ),
    };
  }
  const permission = mode === "write" ? "marketing.write" : "marketing.read";
  if (context.role !== "OWNER" && !hasPermission(context.role, permission)) {
    return {
      context: null,
      response: NextResponse.json(
        { ok: false, error: { code: "ACCESS_DENIED", message: "Access permission required", requiredPermission: permission } },
        { status: 403 },
      ),
    };
  }
  return { context, response: null };
}

function assertRateLimit(identity: string, weight = 1, now = Date.now()) {
  const current = rateLimits.get(identity);
  if (!current || current.resetAt <= now) {
    rateLimits.set(identity, { count: weight, resetAt: now + 60_000 });
    return;
  }
  if (current.count + weight > 12) {
    throw Object.assign(new Error("For mange Social Intelligence-handlinger på kort tid."), {
      code: "RATE_LIMITED",
      status: 429,
    });
  }
  current.count += weight;
}

async function readJsonBody(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw Object.assign(
      new Error("Profilinnholdet er for stort. Maksimal størrelse er 512 KB."),
      { code: "INPUT_TOO_LONG", status: 413 },
    );
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw Object.assign(
      new Error("Profilinnholdet er for stort. Maksimal størrelse er 512 KB."),
      { code: "INPUT_TOO_LONG", status: 413 },
    );
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { code: "INVALID_REQUEST", status: 400 });
  }
}

function logRouteError(error: unknown, correlationId: string, context: ErrorContext = {}) {
  const summarized = summarizeSafeError(error);
  console.error("[Social Intelligence]", {
    correlationId,
    action: context.action || "unknown",
    organizationId: context.organizationId,
    userEmail: redactEmail(context.userEmail),
    code: getErrorField(error, "code") || summarized.code,
    status: getErrorField(error, "status") || summarized.status,
    message: summarized.message,
    errorName: error instanceof Error ? error.name : typeof error,
    stack: error instanceof Error ? error.stack : undefined,
    supabaseCode: getErrorField(error, "supabaseCode"),
    supabaseDetails: getErrorField(error, "supabaseDetails"),
    supabaseHint: getErrorField(error, "supabaseHint"),
    operation: getErrorField(error, "operation"),
    table: getErrorField(error, "table"),
  });
}

function errorResponse(error: unknown, correlationId: string, context: ErrorContext = {}) {
  const summarized = summarizeSafeError(error);
  const validationError = isZodLikeError(error);
  const code = validationError
    ? "INVALID_REQUEST"
    : error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : summarized.code;
  const status = validationError
    ? 400
    : error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? Number((error as { status: number }).status)
      : summarized.status;
  const safeMessage = validationError ? zodMessage(error) : summarized.message;
  const message = status >= 500 && code !== "SCHEMA_NOT_READY"
    ? "Social Intelligence-handlingen feilet."
    : safeMessage;

  logRouteError(error, correlationId, context);

  const payload = createErrorEnvelope({
    correlationId,
    code,
    message,
    status,
    retryable: status >= 500 || status === 429 ? "retryable" : "not_retryable",
  });

  return NextResponse.json(payload, { status, headers: headers(correlationId) });
}

export async function GET(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  let errorContext: ErrorContext = { action: "load_dashboard" };
  try {
    const access = await requireSocialAccess(request, "read");
    if (access.response || !access.context) return access.response;
    const context = getSocialRouteContext(access.context);
    errorContext = {
      action: "load_dashboard",
      organizationId: context.organizationId,
      userEmail: context.userEmail,
    };
    const dashboard = await loadSocialDashboard(context);
    return NextResponse.json({ ok: true, correlationId, dashboard }, { headers: headers(correlationId) });
  } catch (error) {
    return errorResponse(error, correlationId, errorContext);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  let errorContext: ErrorContext = { action: "unknown" };
  try {
    const access = await requireSocialAccess(request, "write");
    if (access.response || !access.context) return access.response;
    const context = getSocialRouteContext(access.context);
    errorContext = {
      organizationId: context.organizationId,
      userEmail: context.userEmail,
    };
    assertRateLimit(`${context.organizationId}:${context.userEmail}`, 1);
    const rawBody = await readJsonBody(request);
    const normalized = normalizeLargeAnalysisRequest(rawBody);
    const body = normalized.body;
    if (body && typeof body === "object" && "action" in body) {
      errorContext.action = String((body as { action?: unknown }).action || "unknown");
    }
    const parsed = SocialIntelligenceActionSchema.parse(body);

    if (parsed.action === "save_profile") {
      const profile = await saveBrandProfile(context, parsed.profile);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, profile, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "analyze_profile") {
      assertRateLimit(`${context.organizationId}:${context.userEmail}:analyze`, 3);
      const payload = SocialAnalyzeRequestSchema.parse(parsed.payload);
      const analysis = await analyzeAndPersistProfile(context, payload);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json(
        {
          ok: true,
          correlationId,
          analysis: compactAnalysisForClient(analysis),
          dashboard,
          warning: normalized.warning,
        },
        { headers: headers(correlationId) },
      );
    }

    if (parsed.action === "accept_section") {
      const section = await acceptProfileSection(context, parsed.section);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, section, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "save_post") {
      const result = await saveSocialPost(context, parsed.post);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, ...result, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "save_metrics") {
      const metrics = await savePostMetrics(context, parsed.metrics);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, metrics, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "link_entity") {
      const link = await linkSocialEntity(context, parsed.link);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, link, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "update_recommendation") {
      const recommendation = await updateRecommendationStatus(context, parsed.recommendation);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, recommendation, dashboard }, { headers: headers(correlationId) });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400, headers: headers(correlationId) });
  } catch (error) {
    return errorResponse(error, correlationId, errorContext);
  }
}
