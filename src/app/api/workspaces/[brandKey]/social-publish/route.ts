import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getWorkspaceSocialPublishRuntime } from "@/lib/workspaces/social-publish-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type SupportedPlatform = "facebook" | "instagram";
type SafeChannel = { platform: SupportedPlatform; displayName: string };
type PreparedChannel = SafeChannel & { id: string };
type SafePublishResult = {
  platform: SupportedPlatform;
  success: boolean;
  postUrl?: string;
  error?: string;
  channelName?: string;
};

const platforms = new Set<SupportedPlatform>(["facebook", "instagram"]);

function fail(status: number, code: string, message?: string) {
  return NextResponse.json(
    { ok: false, error: { code, ...(message ? { message } : {}) } },
    { status, headers: noStore },
  );
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function safeChannel(value: any): SafeChannel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.platform !== "string" || !platforms.has(value.platform as SupportedPlatform)) return null;
  if (typeof value.displayName !== "string" || !value.displayName.trim()) return null;
  return { platform: value.platform as SupportedPlatform, displayName: value.displayName.trim().slice(0, 160) };
}

function safePreparedChannel(value: any): PreparedChannel | null {
  const channel = safeChannel(value);
  if (!channel || typeof value?.id !== "string" || !uuid.test(value.id)) return null;
  return { ...channel, id: value.id };
}

function safePublication(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.id !== "string" || !uuid.test(value.id)) return null;
  const plannedPlatforms = Array.isArray(value.plannedPlatforms)
    ? value.plannedPlatforms.filter((item: unknown): item is string =>
        typeof item === "string" && platforms.has(item as SupportedPlatform)).slice(0, 2)
    : [];
  return { id: value.id, hasImage: value.hasImage === true, plannedPlatforms };
}

function safeResult(result: any): SafePublishResult | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  if (typeof result.platform !== "string" || !platforms.has(result.platform as SupportedPlatform)) return null;
  return {
    platform: result.platform as SupportedPlatform,
    success: result.success === true,
    ...(typeof result.postUrl === "string" && /^https:\/\//i.test(result.postUrl)
      ? { postUrl: result.postUrl.slice(0, 1000) } : {}),
    ...(typeof result.error === "string" && result.error.trim()
      ? { error: result.error.trim().slice(0, 1000) } : {}),
    ...(result.resolved && typeof result.resolved.displayName === "string"
      ? { channelName: result.resolved.displayName.trim().slice(0, 160) } : {}),
  };
}

async function finalize(
  supabase: any,
  args: {
    brandKey: string;
    userId: string;
    email: string;
    attemptId: string;
    success: boolean;
    result: unknown[];
    error?: string | null;
  },
) {
  return supabase.rpc("workspace_brand_social_publish_finalize", {
    p_brand_key: args.brandKey,
    p_user_id: args.userId,
    p_email: args.email,
    p_attempt_id: args.attemptId,
    p_success: args.success,
    p_result: args.result,
    p_error: args.error || null,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.publish");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const { data, error } = await access.value.supabase.rpc("workspace_brand_social_publish_snapshot", {
    p_brand_key: params.brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
  });
  if (error || !data) return fail(503, "SOCIAL_PUBLISH_UNAVAILABLE");

  const channels = Array.isArray(data.channels)
    ? data.channels.flatMap((item: unknown) => {
        const safe = safeChannel(item);
        return safe ? [safe] : [];
      })
    : [];
  const publications = Array.isArray(data.publications)
    ? data.publications.flatMap((item: unknown) => {
        const safe = safePublication(item);
        return safe ? [safe] : [];
      })
    : [];

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    channels,
    publications,
    supportedPlatforms: ["facebook", "instagram"],
  }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.publish");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "INVALID_PUBLISH_REQUEST");
  const publicationId = typeof body.publicationId === "string" ? body.publicationId.trim() : "";
  const requestedPlatforms: string[] = Array.isArray(body.platforms)
    ? body.platforms.map((item: unknown) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (!uuid.test(publicationId) || requestedPlatforms.length < 1 || requestedPlatforms.length > 2 ||
      new Set(requestedPlatforms).size !== requestedPlatforms.length ||
      requestedPlatforms.some(platform => !platforms.has(platform as SupportedPlatform))) {
    return fail(400, "INVALID_PUBLISH_REQUEST");
  }

  const { data: prepared, error: prepareError } = await access.value.supabase.rpc(
    "workspace_brand_social_publish_prepare",
    {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_publication_id: publicationId,
      p_platforms: requestedPlatforms,
    },
  );
  if (prepareError || !prepared) return fail(503, "SOCIAL_PUBLISH_PREPARE_FAILED");
  if (prepared.ok !== true) {
    const code = typeof prepared.error === "string" ? prepared.error : "SOCIAL_PUBLISH_PREPARE_FAILED";
    const messages: Record<string, string> = {
      PUBLICATION_NOT_PUBLISHABLE: "Dette innholdet kan ikke publiseres fra medarbeiderflaten.",
      CHANNEL_SCOPE_INVALID: "En valgt kanal tilhører ikke denne merkevaren eller er ikke aktiv.",
      CHANNEL_AMBIGUOUS: "Merkevaren har mer enn én aktiv konto for en valgt plattform. Eier må rydde kanalbindingen før publisering.",
      PLATFORM_NOT_PLANNED_FOR_DRAFT: "Valgt plattform var ikke valgt som målkanal da utkastet ble lagret.",
      INSTAGRAM_IMAGE_REQUIRED: "Instagram krever at utkastet allerede har et bilde.",
      PUBLISH_ATTEMPT_REQUIRES_REVIEW: "En tidligere publisering av dette utkastet må gjennomgås før nytt forsøk.",
      ACCESS_DENIED: "Publiseringstilgangen er ikke lenger aktiv.",
    };
    return fail(code === "ACCESS_DENIED" ? 403 : 409, code, messages[code]);
  }

  const attemptId = typeof prepared.attemptId === "string" ? prepared.attemptId : "";
  const content = typeof prepared.content === "string" ? prepared.content.trim() : "";
  const imageUrl = typeof prepared.imageUrl === "string" ? prepared.imageUrl.trim() : undefined;
  const channels: PreparedChannel[] = Array.isArray(prepared.channels)
    ? prepared.channels.flatMap((item: unknown) => {
        const safe = safePreparedChannel(item);
        return safe ? [safe] : [];
      })
    : [];
  if (!uuid.test(attemptId) || !content || channels.length !== requestedPlatforms.length ||
      channels.some(channel => !requestedPlatforms.includes(channel.platform))) {
    if (uuid.test(attemptId)) {
      await finalize(access.value.supabase, {
        brandKey: params.brandKey,
        userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail,
        attemptId,
        success: false,
        result: [],
        error: "Forberedelsen returnerte et ugyldig publiseringsgrunnlag.",
      });
    }
    return fail(503, "SOCIAL_PUBLISH_PREPARE_FAILED");
  }

  // Revalidate exact current user + brand + marketing.publish immediately
  // before the irreversible external Meta API call.
  const recheck = await requireBrandWorkspace(request, params.brandKey, "marketing.publish");
  if (!recheck.value || recheck.value.verifiedUserId !== access.value.verifiedUserId) {
    await finalize(access.value.supabase, {
      brandKey: params.brandKey,
      userId: access.value.verifiedUserId,
      email: access.value.verifiedEmail,
      attemptId,
      success: false,
      result: [],
      error: "Publiseringstilgangen ble endret før ekstern publisering.",
    });
    return recheck.response || fail(403, "ACCESS_DENIED");
  }

  const socialChannelIds: Record<string, string> = {};
  for (const channel of channels) socialChannelIds[channel.platform] = channel.id;

  let outcome;
  try {
    outcome = await getWorkspaceSocialPublishRuntime().publish({
      draftId: publicationId,
      platforms: channels.map(channel => channel.platform),
      content,
      brandId: params.brandKey,
      imageUrl,
      socialChannelIds,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Ukjent publiseringsfeil";
    await finalize(access.value.supabase, {
      brandKey: params.brandKey,
      userId: access.value.verifiedUserId,
      email: access.value.verifiedEmail,
      attemptId,
      success: false,
      result: [],
      error: message,
    });
    return fail(502, "SOCIAL_PUBLISH_FAILED", "Publiseringen feilet før en kanal bekreftet innlegget.");
  }

  const results: SafePublishResult[] = Array.isArray(outcome.results)
    ? outcome.results.flatMap(item => {
        const safe = safeResult(item);
        return safe ? [safe] : [];
      })
    : [];
  const success = outcome.anySuccess === true;
  const errors = results.filter(item => !item.success && item.error).map(item => item.error).join("; ");
  const { error: finalizeError } = await finalize(access.value.supabase, {
    brandKey: params.brandKey,
    userId: access.value.verifiedUserId,
    email: access.value.verifiedEmail,
    attemptId,
    success,
    result: results,
    error: success ? null : errors || "Ingen kanal bekreftet publisering.",
  });

  return NextResponse.json({
    ok: success,
    published: success,
    partial: success && results.some(item => !item.success),
    results,
    auditFinalized: !finalizeError,
    ...(finalizeError ? {
      warning: "Innlegget kan være publisert, men revisjonsloggen kunne ikke ferdigstilles. Ikke prøv på nytt før administrator har kontrollert status.",
    } : {}),
  }, { status: success ? 200 : 502, headers: noStore });
}
