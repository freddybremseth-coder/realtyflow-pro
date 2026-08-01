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
  decideProfileSuggestion,
  generateProfileSuggestions,
  getSocialRouteContext,
  importKnowledgeFile,
  linkSocialEntity,
  loadSocialDashboard,
  saveBrandProfile,
  saveProfileGoal,
  saveProfileVariant,
  savePostMetrics,
  saveSocialPost,
  saveTargetAudience,
  summarizeSafeError,
  updateKnowledgeItem,
  updateKnowledgeSource,
  updateRecommendationStatus,
} from "@/services/social-intelligence/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BODY_BYTES = 192 * 1024;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function headers(correlationId: string) {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    "cache-control": "no-store",
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
    throw Object.assign(new Error("Request body is too large"), { code: "INPUT_TOO_LONG", status: 413 });
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw Object.assign(new Error("Request body is too large"), { code: "INPUT_TOO_LONG", status: 413 });
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { code: "INVALID_REQUEST", status: 400 });
  }
}

function errorResponse(error: unknown, correlationId: string) {
  const summarized = summarizeSafeError(error);
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : summarized.code;
  const status =
    error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? Number((error as { status: number }).status)
      : summarized.status;
  const message = summarized.message || (error instanceof Error ? error.message : "Social Intelligence-handlingen feilet.");

  return NextResponse.json(
    createErrorEnvelope({
      correlationId,
      code,
      message: status >= 500 && code !== "SCHEMA_NOT_READY" ? "Social Intelligence-handlingen feilet." : message,
      status,
      retryable: status >= 500 || status === 429 ? "retryable" : "not_retryable",
    }),
    { status, headers: headers(correlationId) },
  );
}

export async function GET(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  try {
    const access = await requireSocialAccess(request, "read");
    if (access.response || !access.context) return access.response;
    const context = getSocialRouteContext(access.context);
    const dashboard = await loadSocialDashboard(context);
    return NextResponse.json({ ok: true, correlationId, dashboard }, { headers: headers(correlationId) });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  try {
    const access = await requireSocialAccess(request, "write");
    if (access.response || !access.context) return access.response;
    const context = getSocialRouteContext(access.context);
    assertRateLimit(`${context.organizationId}:${context.userEmail}`, 1);
    const body = await readJsonBody(request);
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
        { ok: true, correlationId, analysis: compactAnalysisForClient(analysis), dashboard },
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

    if (parsed.action === "import_knowledge_file") {
      assertRateLimit(`${context.organizationId}:${context.userEmail}:knowledge-import`, 3);
      const result = await importKnowledgeFile(context, parsed.import);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, ...result, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "update_knowledge_item") {
      const item = await updateKnowledgeItem(context, parsed.item);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, item, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "update_knowledge_source") {
      const source = await updateKnowledgeSource(context, parsed.source);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, source, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "save_profile_goal") {
      const goal = await saveProfileGoal(context, parsed.goal);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, goal, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "save_target_audience") {
      const audience = await saveTargetAudience(context, parsed.audience);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, audience, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "save_profile_variant") {
      const variant = await saveProfileVariant(context, parsed.variant);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, variant, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "generate_profile_suggestions") {
      assertRateLimit(`${context.organizationId}:${context.userEmail}:profile-builder`, 3);
      const result = await generateProfileSuggestions(context, parsed.payload);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, ...result, dashboard }, { headers: headers(correlationId) });
    }

    if (parsed.action === "decide_profile_suggestion") {
      const suggestion = await decideProfileSuggestion(context, parsed.decision);
      const dashboard = await loadSocialDashboard(context);
      return NextResponse.json({ ok: true, correlationId, suggestion, dashboard }, { headers: headers(correlationId) });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400, headers: headers(correlationId) });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
