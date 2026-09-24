import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Deliberately read-only and limited to contacts explicitly assigned to this
 * canonical brand. Legacy null/unassigned brand rows require owner-led review
 * before sharing; no in-memory filtering of an all-brand service-role result.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandKey: string }> },
) {
  const { brandKey } = await params;
  const access = await requireBrandWorkspace(request, brandKey, "crm.read");
  if (!access.value) return access.response;
  const { supabase } = access.value;
  const { data, error } = await supabase.from("contacts")
    .select("id,name,email,phone,brand_id,pipeline_status,source,updated_at")
    .eq("brand_id", brandKey)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: { code: "CRM_UNAVAILABLE" } }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.json({ ok: true, brand: brandKey, contacts: data || [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
