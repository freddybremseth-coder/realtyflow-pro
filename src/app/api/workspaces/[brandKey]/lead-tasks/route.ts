import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

// The Altovena intake creates one high-priority, brand-scoped task per enquiry.
// This endpoint never reads the global task feed or returns notes, messages, or other brands.
export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const allowedStatuses = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (params.brandKey !== "altovena") return NextResponse.json(
    { ok: false, error: { code: "WORKSPACE_NOT_FOUND" } },
    { status: 404, headers: noStore },
  );
  const access = await requireBrandWorkspace(request, "altovena", "crm.read");
  if (!access.value) return access.response;

  const { data, error } = await access.value.supabase
    .from("work_items")
    .select("id,title,brand_id,source_type,source_id,status,priority,created_at,due_date,next_action")
    .eq("brand_id", "altovena")
    .eq("source_type", "website_lead")
    .in("status", allowedStatuses)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !Array.isArray(data)) return NextResponse.json(
    { ok: false, error: { code: "LEAD_TASKS_UNAVAILABLE" } },
    { status: 503, headers: noStore },
  );
  const tasks = data.flatMap(row => {
    if (!row || row.brand_id !== "altovena" || row.source_type !== "website_lead" ||
        !allowedStatuses.includes(row.status) || typeof row.id !== "string" || !uuid.test(row.id)) return [];
    return [{
      id: row.id,
      title: typeof row.title === "string" ? row.title.slice(0, 180) : "Ny Altovena-henvendelse",
      status: row.status,
      priority: row.priority === "HIGH" || row.priority === "CRITICAL" ? row.priority : "MEDIUM",
      contactId: typeof row.source_id === "string" && uuid.test(row.source_id) ? row.source_id : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      dueDate: typeof row.due_date === "string" ? row.due_date : null,
      nextAction: typeof row.next_action === "string" ? row.next_action.slice(0, 220) : null,
    }];
  });
  return NextResponse.json({ ok: true, brand: "altovena", tasks, capped: data.length === 40 }, { headers: noStore });
}


type UpdateRequest = { id?: unknown; status?: unknown };
/**
 * Explicit, human-initiated task status changes only; never modifies the contact
 * or sends email. Brand, source type, current status and verified crm.write access
 * are checked again in the single SQL update.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (params.brandKey !== "altovena") return NextResponse.json(
    { ok: false, error: { code: "WORKSPACE_NOT_FOUND" } },
    { status: 404, headers: noStore },
  );
  const access = await requireBrandWorkspace(request, "altovena", "crm.write");
  if (!access.value) return access.response;

  const origin = request.headers.get("origin");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
      !origin || origin !== new URL(request.url).origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST_ORIGIN" } },
      { status: 403, headers: noStore });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["id", "status"].includes(key))) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_TASK" } },
      { status: 400, headers: noStore });
  }
  const { id, status } = body as UpdateRequest;
  // Only human-selected transitions. Cancellation/administrative mutations
  // are not available from the quick action.
  if (typeof id !== "string" || !uuid.test(id) ||
      typeof status !== "string" || !["IN_PROGRESS", "DONE"].includes(status)) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_STATUS" } },
      { status: 400, headers: noStore });
  }
  // A single verified service-role RPC performs the status change and an
  // append-only actor/timestamp audit; nothing is updated without crm.write.
  const { data, error } = await access.value.supabase.rpc("altovena_mark_lead_task", {
    p_task_id: id,
    p_status: status,
    p_actor_email: access.value.verifiedEmail,
  });
  if (error) return NextResponse.json({ ok: false, error: { code: "TASK_UPDATE_FAILED" } },
    { status: 503, headers: noStore });
  if (data?.ok !== true || data?.brand !== "altovena" ||
      data?.task?.id !== id || data?.task?.status !== status) {
    return NextResponse.json({ ok: false, error: { code: "TASK_NOT_FOUND_OR_ALREADY_HANDLED" } },
      { status: 404, headers: noStore });
  }
  return NextResponse.json({ ok: true, brand: "altovena", task: { id, status } }, { headers: noStore });
}
