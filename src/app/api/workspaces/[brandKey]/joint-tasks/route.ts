import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: noStore });
const fail = (status: number, code: string) => reply({ ok: false, error: { code } }, status);
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const cutoff = Date.parse("2026-09-23T22:00:00.000Z");
const allowedKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const safeWrite = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
};
const validDate = (value: unknown) => value === null ||
  (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value);

function safeTask(row: unknown, contactId: string) {
  if (!row || typeof row !== "object") return null;
  const task = row as Record<string, unknown>;
  if (task.contact_id !== contactId || typeof task.id !== "string" || !uuid.test(task.id) ||
    typeof task.title !== "string" || task.title.trim().length < 3 ||
    task.title.length > 160 || !["open", "done"].includes(String(task.status)) ||
    typeof task.created_at !== "string" || !(Date.parse(task.created_at) >= cutoff) ||
    !validDate(task.due_on ?? null)) return null;
  return {
    id: task.id, contact_id: contactId, title: task.title,
    due_on: task.due_on ?? null, status: task.status,
    created_at: task.created_at, updated_at: typeof task.updated_at === "string" ? task.updated_at : null,
    created_by_email: typeof task.created_by_email === "string" ? task.created_by_email : null,
    finished_at: typeof task.finished_at === "string" ? task.finished_at : null,
    finished_by_email: typeof task.finished_by_email === "string" ? task.finished_by_email : null,
  };
}

/** Only newly CREATED joint tasks for an individually approved new Zen lead. */
export async function GET(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (params.brandKey !== "zeneco") return fail(404, "WORKSPACE_NOT_FOUND");
  const access = await requireBrandWorkspace(request, "zeneco", "tasks.joint.read");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
  const contactId = new URL(request.url).searchParams.get("contactId");
  if (!contactId || !uuid.test(contactId)) return fail(400, "INVALID_CONTACT_ID");
  const { data, error } = await access.value.supabase.rpc("workspace_zeneco_joint_tasks", {
    p_user_id: access.value.verifiedUserId, p_email: access.value.verifiedEmail,
    p_contact_id: contactId,
  });
  if (error || !data || !Array.isArray(data.tasks) || typeof data.hasMore !== "boolean")
    return fail(503, "JOINT_TASKS_UNAVAILABLE");
  const tasks = data.tasks.map((task: unknown) => safeTask(task, contactId)).filter(Boolean).slice(0, 50);
  return reply({ ok: true, contactId, tasks, hasMore: data.hasMore });
}

/** Creates only a new scoped work item. No historical work_items or outreach. */
export async function POST(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (params.brandKey !== "zeneco") return fail(404, "WORKSPACE_NOT_FOUND");
  const access = await requireBrandWorkspace(request, "zeneco", "tasks.joint.write");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_TASK");
  const data = input as Record<string, unknown>;
  if (!allowedKeys(data, ["contactId", "title", "dueOn"]) || typeof data.contactId !== "string" ||
    !uuid.test(data.contactId) || typeof data.title !== "string" ||
    data.title.trim().length < 3 || data.title.trim().length > 160 ||
    /[\x00-\x1f\x7f]/.test(data.title) || !validDate(data.dueOn))
    return fail(400, "INVALID_TASK");
  const { data: created, error } = await access.value.supabase.rpc("workspace_zeneco_joint_task_create", {
    p_user_id: access.value.verifiedUserId, p_email: access.value.verifiedEmail,
    p_contact_id: data.contactId, p_title: data.title.trim(), p_due_on: data.dueOn,
  });
  if (error) return fail(503, "JOINT_TASKS_UNAVAILABLE");
  const task = safeTask(created, data.contactId);
  if (!task) return created ? fail(503, "JOINT_TASKS_UNAVAILABLE") : fail(404, "CONTACT_NOT_IN_JOINT_COHORT");
  return reply({ ok: true, task }, 201);
}

/** Status-only completion. No reopen, deletion, brand change or other writes. */
export async function PATCH(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (params.brandKey !== "zeneco") return fail(404, "WORKSPACE_NOT_FOUND");
  const access = await requireBrandWorkspace(request, "zeneco", "tasks.joint.write");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_TASK");
  const data = input as Record<string, unknown>;
  if (!allowedKeys(data, ["contactId", "taskId", "status"]) ||
    typeof data.contactId !== "string" || !uuid.test(data.contactId) ||
    typeof data.taskId !== "string" || !uuid.test(data.taskId) || data.status !== "done")
    return fail(400, "INVALID_TASK");
  const { data: updated, error } = await access.value.supabase.rpc("workspace_zeneco_joint_task_complete", {
    p_user_id: access.value.verifiedUserId, p_email: access.value.verifiedEmail,
    p_contact_id: data.contactId, p_task_id: data.taskId,
  });
  if (error) return fail(503, "JOINT_TASKS_UNAVAILABLE");
  const task = safeTask(updated, data.contactId);
  if (!task || task.id !== data.taskId || task.status !== "done")
    return updated ? fail(503, "JOINT_TASKS_UNAVAILABLE") : fail(404, "TASK_NOT_FOUND_OR_REVOKED");
  return reply({ ok: true, task });
}
