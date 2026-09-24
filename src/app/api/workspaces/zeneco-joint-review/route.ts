import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store" };
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
const cutoff = Date.parse("2026-09-23T22:00:00.000Z");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function owner(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return { email: null, failure: reply({ error: "AUTH_REQUIRED" }, 401) };
  // Migration/Re-Master owner proxies cannot review real people or their leads.
  if (context.role !== "OWNER" || context.source !== "owner-session")
    return { email: null, failure: reply({ error: "OWNER_REQUIRED" }, 403) };
  return { email: context.email, failure: null };
}

/** Human owner review only; no staff can fetch even candidate customer identities. */
export async function GET(request: NextRequest) {
  const checked = await owner(request);
  if (checked.failure) return checked.failure;
  const db = getPlatformSupabase();
  if (!db) return reply({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  const { data, error } = await db.rpc("workspace_zeneco_review_candidates");
  if (error || !data || !Array.isArray(data.contacts) || typeof data.hasMore !== "boolean")
    return reply({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  // A failed view/RPC migration must not become an unfiltered contacts export.
  const safe = data.contacts.filter((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return row.brand_id === "zeneco" && row.brand === "zeneco" &&
      typeof row.id === "string" && uuid.test(row.id) &&
      typeof row.created_at === "string" && Date.parse(row.created_at) >= cutoff &&
      typeof row.name === "string" &&
      ["unreviewed", "pending", "approved", "excluded", "revoked"].includes(String(row.status));
  }).slice(0, 25).map((row: Record<string, unknown>) => ({
    id: row.id, name: row.name,
    email: typeof row.email === "string" ? row.email : null,
    created_at: row.created_at,
    source: typeof row.source === "string" ? row.source : "",
    status: row.status,
  }));
  return reply({ ok: true, contacts: safe, hasMore: data.hasMore, activationAvailable: false });
}

/**
 * Only a signed owner session may record a human-reviewed decision.
 * The SQL RPC re-checks both Zen brand labels + old-lead cutoff while holding
 * the CRM row lock, and appends an audit entry. No employee access is granted.
 */
export async function POST(request: NextRequest) {
  const checked = await owner(request);
  if (checked.failure) return checked.failure;
  const origin = request.headers.get("origin");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site")
    return reply({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return reply({ error: "INVALID_REVIEW" }, 400);
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some(key =>
    !["contactId", "action", "firstGenuineEnquiryAt", "receivedSource", "evidenceReference", "reviewReason"].includes(key)))
    return reply({ error: "INVALID_REVIEW_FIELDS" }, 400);
  const contactId = body.contactId;
  const action = body.action;
  const first = body.firstGenuineEnquiryAt;
  const source = body.receivedSource;
  const evidence = body.evidenceReference;
  const reason = body.reviewReason;
  if (typeof contactId !== "string" || !uuid.test(contactId) ||
      !["APPROVE", "EXCLUDE", "REVOKE"].includes(String(action)) ||
      typeof reason !== "string" || reason.trim().length < 8 || reason.length > 1000)
    return reply({ error: "INVALID_REVIEW" }, 400);
  let firstTimestamp: string | null = null;
  if (action === "APPROVE") {
    if (typeof first !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(first) ||
      !Number.isFinite(Date.parse(first)) || Date.parse(first) < cutoff ||
      Date.parse(first) > Date.now() ||
      typeof source !== "string" || source.trim().length < 3 || source.length > 200 ||
      typeof evidence !== "string" || evidence.trim().length < 8 || evidence.length > 256)
      return reply({ error: "SOURCE_EVIDENCE_REQUIRED" }, 400);
    firstTimestamp = new Date(first).toISOString();
  } else if (first !== undefined || source !== undefined || evidence !== undefined) {
    return reply({ error: "UNEXPECTED_EVIDENCE_FOR_ACTION" }, 400);
  }
  const db = getPlatformSupabase();
  if (!db) return reply({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  const { data, error } = await db.rpc("workspace_zeneco_review_lead", {
    p_contact_id: contactId,
    p_action: action,
    p_first_genuine_enquiry_at: firstTimestamp,
    p_received_source: action === "APPROVE" ? (source as string).trim() : null,
    p_evidence_reference: action === "APPROVE" ? (evidence as string).trim() : null,
    p_review_reason: reason.trim(),
    p_actor_email: checked.email,
  });
  if (error) return reply({ error: "REVIEW_UNAVAILABLE" }, 503);
  if (data !== true) return reply({ error: "REVIEW_REJECTED_OR_CONTACT_INELIGIBLE" }, 409);
  return reply({ ok: true, status: action === "APPROVE" ? "approved" :
    action === "REVOKE" ? "revoked" : "excluded", employeeAccessActivated: false });
}
