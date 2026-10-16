import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/platform/request";

/**
 * Owner-session-only internal bridge to Altovena in RealtyflowPRO.
 * Existing RealtyFlow signed cookie is verified by requirePlatformOwner.
 * The Supabase service key stays server-side and can execute only narrow RPCs.
 * Actual external agent execution is intentionally unavailable.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const makeError = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: NO_STORE });

async function ownerContext(request: NextRequest) {
  const { value, response } = await requirePlatformOwner(request);
  if (response || !value) return { value: null, response };
  // Do not allow owner-preview impersonation or remaster migration-proxy context.
  if (value.context.source !== "owner-session") {
    return { value: null, response: makeError("owner_session_required", 403) };
  }
  return { value, response: null };
}

export async function GET(request: NextRequest) {
  const access = await ownerContext(request);
  if (access.response) return access.response;
  const supabase = access.value!.supabase;
  const { data, error } = await supabase.rpc("altovena_internal_command_list", { p_limit: 50 });
  if (error || !Array.isArray(data)) {
    return makeError("altovena_gateway_unavailable", 503);
  }
  return NextResponse.json({ missions: data, mode: "OWNER_INTERNAL_READ" }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const access = await ownerContext(request);
  if (access.response) return access.response;

  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return makeError("origin_mismatch", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return makeError("json_required", 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 10_000) {
    return makeError("request_too_large", 413);
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > 10_000) return makeError("request_too_large", 413);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return makeError("invalid_json", 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return makeError("invalid_draft", 400);
  }
  const body = payload as Record<string, unknown>;
  if (typeof body.goal !== "string" ||
      body.goal.trim().length < 1 || body.goal.trim().length > 4000) {
    return makeError("invalid_goal", 400);
  }
  if (typeof body.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId)) {
    return makeError("invalid_request_id", 400);
  }
  if (Object.keys(body).some(key => !["goal", "requestId"].includes(key))) {
    return makeError("unexpected_parameters", 400);
  }

  const { data, error } = await access.value!.supabase.rpc(
    "altovena_internal_command_create_draft",
    {
      p_actor_email: access.value!.context.email,
      p_goal: body.goal.trim(),
      p_request_id: body.requestId,
    },
  );
  if (error || !Array.isArray(data) || data.length !== 1) {
    // Do not expose provider SQL or identity details to the client.
    return makeError("altovena_draft_creation_failed", 503);
  }
  return NextResponse.json({ mission: data[0], mode: "DRAFT_ONLY" }, {
    status: 201, headers: NO_STORE,
  });
}
