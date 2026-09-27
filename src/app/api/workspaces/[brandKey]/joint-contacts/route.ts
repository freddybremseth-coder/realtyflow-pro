import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const cutoff = Date.parse("2026-09-23T22:00:00.000Z");
const fail = (status: number, code: string) =>
  NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });

/**
 * Only individually owner-approved NEW Zen Eco leads, never the historical
 * Zen brand-wide CRM. The reviewed SQL cohort + live staff grant are rechecked
 * at every request using the independently verified Supabase Auth user ID.
 */
export async function GET(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (params.brandKey !== "zeneco") return fail(404, "WORKSPACE_NOT_FOUND");
  const access = await requireBrandWorkspace(request, "zeneco", "crm.joint.read");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_COHORT_ONLY");

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || "1");
  const search = (url.searchParams.get("q") || "").trim();
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 || search.length > 80)
    return fail(400, "INVALID_SEARCH");
  const { data, error } = await access.value.supabase.rpc("workspace_zeneco_joint_contacts", {
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
    p_offset: (page - 1) * 50,
    p_search: search,
  });
  if (error || !data || !Array.isArray(data.contacts) || typeof data.hasMore !== "boolean")
    return fail(503, "JOINT_CRM_UNAVAILABLE");
  const visible = data.contacts.filter((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return row.brand_id === "zeneco" && row.brand === "zeneco" &&
      typeof row.id === "string" && typeof row.name === "string" &&
      typeof row.created_at === "string" && Date.parse(row.created_at) >= cutoff;
  }).slice(0, 50).map((row: Record<string, unknown>) => ({
    id: row.id, name: row.name, email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    pipeline_status: typeof row.pipeline_status === "string" ? row.pipeline_status : null,
    source: typeof row.source === "string" ? row.source : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  }));
  return NextResponse.json({
    ok: true, brand: "zeneco", contacts: visible,
    page, pageSize: 50, hasMore: data.hasMore,
  }, { headers: noStore });
}


/**
 * Edit only basic details of an already reviewed joint Zen contact.
 * No create/delete, brand transfer, status change, notes or financial fields.
 * SQL checks the current user grant AND the approved contact in one UPDATE,
 * then records who edited it without copying PII into a global audit table.
 */
export async function PATCH(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (params.brandKey !== "zeneco") return fail(404, "WORKSPACE_NOT_FOUND");
  const access = await requireBrandWorkspace(request, "zeneco", "crm.joint.write");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_COHORT_ONLY");
  const origin = request.headers.get("origin");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site")
    return fail(403, "INVALID_REQUEST_ORIGIN");
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return fail(400, "INVALID_CONTACT");
  const input = payload as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== 4 || keys.some(key => !["id", "name", "email", "phone"].includes(key)))
    return fail(400, "INVALID_CONTACT_FIELDS");
  if (typeof input.id !== "string" ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(input.id) ||
      typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 140 ||
      (input.email !== null && typeof input.email !== "string") ||
      (input.phone !== null && typeof input.phone !== "string"))
    return fail(400, "INVALID_CONTACT");
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || phone.length > 60)
    return fail(400, "INVALID_CONTACT_FIELDS");
  const { data, error } = await access.value.supabase.rpc("workspace_zeneco_joint_contact_update", {
    p_user_id: access.value.verifiedUserId,
    p_member_email: access.value.verifiedEmail,
    p_contact_id: input.id,
    p_name: input.name.trim(),
    p_contact_email: email,
    p_phone: phone,
  });
  if (error) return fail(503, "JOINT_CRM_UNAVAILABLE");
  if (!data) return fail(404, "JOINT_CONTACT_NOT_FOUND");
  if (data.id !== input.id || data.brand_id !== "zeneco" || data.brand !== "zeneco" ||
      typeof data.created_at !== "string" || Date.parse(data.created_at) < cutoff)
    return fail(503, "JOINT_CRM_UNAVAILABLE");
  return NextResponse.json({
    ok: true, brand: "zeneco",
    contact: { id: data.id, name: data.name, email: data.email, phone: data.phone,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : null },
  }, { headers: noStore });
}
