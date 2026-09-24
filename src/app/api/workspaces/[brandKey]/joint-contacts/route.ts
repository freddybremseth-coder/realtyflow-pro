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
    p_email: request.cookies.get("realtyflow_admin") ? undefined : undefined,
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
