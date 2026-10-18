import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const kinds = ["NOT_STARTED_15M", "NOT_STARTED_24H", "IN_PROGRESS_48H"];
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

// Human-only, live brand-scoped access. Owner preview MUST NOT acknowledge
// on behalf of another person. Neither proxied service credentials nor legacy
// global roles are valid employee/operator inbox sessions.
async function operator(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return { response: reply({ ok: false, error: "AUTH_REQUIRED" }, 401) };
  if (!(context.source === "owner-session" && context.role === "OWNER") &&
      !(context.source === "role-profile" && context.role === "WORKSPACE_MEMBER"))
    return { response: reply({ ok: false, error: "HUMAN_SESSION_REQUIRED" }, 403) };
  const access = await requireBrandWorkspace(request, "altovena", "crm.read");
  if (!access.value) return { response: access.response };
  const scope = access.value;
  if (scope.verifiedEmail.trim().toLowerCase() !== context.email.trim().toLowerCase())
    return { response: reply({ ok: false, error: "INVALID_OPERATOR_SESSION" }, 403) };

  const secret = process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY;
  if (!secret || secret.length < 32)
    return { response: reply({ ok: false, error: "ALERT_RECEIPTS_NOT_CONFIGURED" }, 503) };
  if (context.role !== "OWNER" && !scope.verifiedUserId)
    return { response: reply({ ok: false, error: "INVALID_OPERATOR_SESSION" }, 403) };
  const principal = context.role === "OWNER"
    ? "owner:" + scope.verifiedEmail.trim().toLowerCase()
    : "member:" + scope.verifiedUserId;
  const key = createHmac("sha256", secret).update("altovena:inbox:v1:" + principal).digest("hex");
  return { scope, key };
}

export async function GET(request: NextRequest) {
  const resolved = await operator(request);
  if (resolved.response) return resolved.response;
  if (process.env.ALTOVENA_ALERT_INBOX_ENABLED !== "true")
    return reply({ ok: true, brand: "altovena", enabled: false, alerts: [],
      totalPending: 0, unreadTotal: 0, externalDelivery: false });

  const { data, error } = await resolved.scope!.supabase.rpc("altovena_operator_alert_inbox", {
    p_operator_key: resolved.key!, p_limit: 20,
  });
  if (error || data?.ok !== true || data?.brand !== "altovena" ||
      data.externalDelivery !== false || data.emailSent !== false ||
      !Number.isSafeInteger(data.totalPending) || data.totalPending < 0 ||
      !Number.isSafeInteger(data.unreadTotal) || data.unreadTotal < 0 ||
      data.unreadTotal > data.totalPending || !Array.isArray(data.alerts) ||
      data.alerts.length > 20 || data.alerts.length > data.totalPending)
    return reply({ ok: false, error: "ALERT_INBOX_UNAVAILABLE" }, 503);

  const alerts = [];
  for (const entry of data.alerts) {
    if (!entry || typeof entry.id !== "string" || !uuid.test(entry.id) ||
        !kinds.includes(entry.kind) || typeof entry.createdAt !== "string" ||
        !Number.isFinite(Date.parse(entry.createdAt)) ||
        (entry.readAt !== null &&
          (typeof entry.readAt !== "string" || !Number.isFinite(Date.parse(entry.readAt)))) ||
        (entry.contactId !== null &&
          (typeof entry.contactId !== "string" || !uuid.test(entry.contactId))))
      return reply({ ok: false, error: "ALERT_INBOX_UNAVAILABLE" }, 503);
    alerts.push({
      id: entry.id, kind: entry.kind, createdAt: entry.createdAt,
      readAt: entry.readAt, contactId: entry.contactId,
    });
  }
  return reply({ ok: true, brand: "altovena", enabled: true, alerts,
    totalPending: data.totalPending, unreadTotal: data.unreadTotal,
    externalDelivery: false });
}

export async function POST(request: NextRequest) {
  const resolved = await operator(request);
  if (resolved.response) return resolved.response;
  if (process.env.ALTOVENA_ALERT_INBOX_ENABLED !== "true")
    return reply({ ok: false, error: "ALERT_INBOX_DISABLED" }, 403);

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return reply({ ok: false, error: "INVALID_REQUEST_ORIGIN" }, 403);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, "id") ||
      typeof (body as {id?:unknown}).id !== "string" ||
      !uuid.test((body as {id:string}).id))
    return reply({ ok: false, error: "INVALID_ALERT" }, 400);
  const id = (body as {id:string}).id;
  const { data, error } = await resolved.scope!.supabase.rpc("altovena_ack_operator_alert", {
    p_alert_id: id, p_operator_key: resolved.key!,
  });
  if (error) return reply({ ok: false, error: "ALERT_ACK_FAILED" }, 503);
  if (data?.ok !== true || data?.brand !== "altovena" || data?.id !== id ||
      data?.externalDelivery !== false || data?.emailSent !== false ||
      typeof data?.readAt !== "string" || !Number.isFinite(Date.parse(data.readAt)))
    return reply({ ok: false, error: "ALERT_NOT_PENDING_OR_NOT_FOUND" }, 404);
  return reply({ ok: true, brand: "altovena", id, readAt: data.readAt,
    externalDelivery: false });
}
