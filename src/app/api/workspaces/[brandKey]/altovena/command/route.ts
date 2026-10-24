import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const respond = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers });

async function collaborationAccess(request: NextRequest, brandKey: string) {
  // A verified, active Zen/Pinoso workspace membership is prerequisite,
  // but is NOT enough: the Altovena tenant has an independent member allowlist.
  const scope = await requireBrandWorkspace(request, brandKey, "nexus.read");
  if (scope.response) return { scope: null, denied: scope.response };
  if (scope.value.role === "OWNER") return { scope: scope.value, denied: null };
  if (!scope.value.verifiedUserId) return { scope: null, denied: respond(403, "COLLABORATION_ACCESS_DENIED") };
  const { data: member, error } = await scope.value.supabase.rpc(
    "altovena_collaboration_is_member", { p_user_id: scope.value.verifiedUserId },
  );
  if (error) return { scope: null, denied: respond(503, "COLLABORATION_UNAVAILABLE") };
  if (member !== true) return { scope: null, denied: respond(403, "COLLABORATION_ACCESS_DENIED") };
  return { scope: scope.value, denied: null };
}

export async function GET(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const access = await collaborationAccess(request, params.brandKey);
  if (access.denied) return access.denied;
  const { data, error } = await access.scope!.supabase.rpc(
    "altovena_collaboration_command_list", { p_limit: 50 },
  );
  if (error || !Array.isArray(data)) return respond(503, "COLLABORATION_UNAVAILABLE");
  return NextResponse.json({
    ok: true, mode: "collaboration_drafts_only", missions: data,
    products: [
      { name: "Command", status: "drafts_available" },
      { name: "Intelligence", status: "in_development" },
      { name: "Visibility", status: "in_development" },
    ],
  }, { headers });
}

export async function POST(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const access = await collaborationAccess(request, params.brandKey);
  if (access.denied) return access.denied;
  if (request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers.get("sec-fetch-site") === "cross-site") return respond(403, "ORIGIN_MISMATCH");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return respond(415, "JSON_REQUIRED");
  }
  if (Number(request.headers.get("content-length") || 0) > 10000) return respond(413, "REQUEST_TOO_LARGE");
  const raw = await request.text().catch(() => "");
  if (raw.length > 10000) return respond(413, "REQUEST_TOO_LARGE");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return respond(400, "INVALID_JSON"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return respond(400, "INVALID_DRAFT");
  const body = payload as Record<string, unknown>;
  if (typeof body.goal !== "string" ||
      body.goal.trim().length < 1 || body.goal.trim().length > 4000 ||
      typeof body.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
    return respond(400, "INVALID_DRAFT");
  }
  const { data, error } = await access.scope!.supabase.rpc(
    "altovena_collaboration_command_create_draft", {
      p_actor_email: access.scope!.verifiedEmail,
      p_goal: body.goal.trim(),
      p_request_id: body.requestId,
      p_verified_owner: access.scope!.role === "OWNER",
    },
  );
  if (error || !Array.isArray(data) || !data[0]) return respond(503, "DRAFT_CREATE_FAILED");
  // Draft creation never executes an agent or authorizes external actions.
  return NextResponse.json({ ok: true, mission: data[0], executed: false }, { status: 201, headers });
}
