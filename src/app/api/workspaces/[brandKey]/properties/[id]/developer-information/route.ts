import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };
const MAX_LENGTH = 12000;

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authorizedProperty(
  request: NextRequest,
  brandKey: string,
  propertyId: string,
) {
  if (!validId(propertyId)) {
    return { access: null, response: NextResponse.json({ ok: false, error: { code: "INVALID_PROPERTY" } }, { status: 400, headers: noStore }) };
  }
  // Only content editors for an independently verified brand workspace may read
  // or change internal developer information. Owner preview stays read-only.
  const scope = await requireBrandWorkspace(request, brandKey, "content.edit");
  if (!scope.value) return { access: null, response: scope.response };

  const { data, error } = await scope.value.supabase
    .from("property_brand_visibility")
    .select("property_id")
    .eq("property_id", propertyId)
    .eq("brand_id", brandKey)
    .eq("visible", true)
    .maybeSingle();

  if (error) {
    return { access: null, response: NextResponse.json({ ok: false, error: { code: "PROPERTY_UNAVAILABLE" } }, { status: 503, headers: noStore }) };
  }
  if (!data) {
    return { access: null, response: NextResponse.json({ ok: false, error: { code: "PROPERTY_NOT_IN_BRAND" } }, { status: 404, headers: noStore }) };
  }
  return { access: scope.value, response: null };
}

export async function GET(request: NextRequest, { params }: { params: { brandKey: string; id: string } }) {
  const scoped = await authorizedProperty(request, params.brandKey, params.id);
  if (!scoped.access) return scoped.response;

  const { data, error } = await scoped.access.supabase
    .from("properties")
    .select("id,additional_information")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: { code: "PROPERTY_UNAVAILABLE" } }, { status: 503, headers: noStore });
  if (!data) return NextResponse.json({ ok: false, error: { code: "PROPERTY_NOT_FOUND" } }, { status: 404, headers: noStore });

  return NextResponse.json({ ok: true, additional_information: data.additional_information || "" }, { headers: noStore });
}

export async function PATCH(request: NextRequest, { params }: { params: { brandKey: string; id: string } }) {
  const scoped = await authorizedProperty(request, params.brandKey, params.id);
  if (!scoped.access) return scoped.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    typeof body.additional_information !== "string" ||
    body.additional_information.length > MAX_LENGTH ||
    Object.keys(body).some((key) => key !== "additional_information")) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_INFORMATION" } }, { status: 400, headers: noStore });
  }
  const { data, error } = await scoped.access.supabase
    .from("properties")
    .update({ additional_information: body.additional_information.trim() })
    .eq("id", params.id)
    .select("id,additional_information")
    .single();
  if (error) return NextResponse.json({ ok: false, error: { code: "SAVE_FAILED" } }, { status: 503, headers: noStore });

  return NextResponse.json({ ok: true, additional_information: data.additional_information || "" }, { headers: noStore });
}
