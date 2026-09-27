import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };

const KIND_PERMISSION: Record<string, WorkspacePermission> = {
  corporate: "corporate.plan",
  seo: "visibility.plan",
  geo: "visibility.plan",
  aeo: "visibility.plan",
  keywords: "visibility.plan",
  content: "visibility.plan",
  ads: "ads.draft",
  video: "events.plan",
  info_meeting: "events.plan",
};

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

async function growthReadAccess(request: NextRequest, brandKey: string) {
  for (const permission of ["corporate.read", "visibility.read", "ads.read", "events.plan"] as WorkspacePermission[]) {
    const access = await requireBrandWorkspace(request, brandKey, permission);
    if (access.value) return access;
    if (access.response.status === 401 || access.response.status === 503) return access;
  }
  return { value: null, response: fail(403, "ACCESS_DENIED") };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await growthReadAccess(request, params.brandKey);
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const { data, error } = await access.value.supabase.rpc("workspace_brand_growth_snapshot", {
    p_brand_key: params.brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fail(503, "GROWTH_WORKSPACE_UNAVAILABLE");
  }
  return NextResponse.json({ ok: true, brand: params.brandKey, ...data }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_WORK_ITEM");
  const body = input as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  const permission = KIND_PERMISSION[kind];
  if (!permission) return fail(400, "INVALID_WORK_KIND");

  const access = await requireBrandWorkspace(request, params.brandKey, permission);
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const priority = typeof body.priority === "string" ? body.priority.trim().toUpperCase() : "MEDIUM";
  const dueDate = typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
    ? body.dueDate : null;

  if (title.length < 2 || title.length > 180 || description.length > 4000 ||
      nextAction.length > 1000 || sourceId.length > 200 ||
      !["CRITICAL","HIGH","MEDIUM","LOW"].includes(priority) ||
      (body.dueDate != null && dueDate === null)) {
    return fail(400, "INVALID_WORK_ITEM");
  }

  const { data, error } = await access.value.supabase.rpc("workspace_brand_growth_work_create", {
    p_brand_key: params.brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
    p_kind: kind,
    p_title: title,
    p_description: description,
    p_next_action: nextAction,
    p_due_date: dueDate,
    p_priority: priority,
    p_source_id: sourceId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fail(503, "GROWTH_WORK_CREATE_FAILED");
  }

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    workItem: data,
    externalAction: false,
    published: false,
    adSpendStarted: false,
    invitationSent: false,
  }, { status: 201, headers: noStore });
}
