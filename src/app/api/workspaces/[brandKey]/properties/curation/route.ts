import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req: NextRequest, { params }: { params: { brandKey: string } }) {
  const scope = await requireBrandWorkspace(req, params.brandKey, "properties.catalog.read");
  if (!scope.value) return scope.response;
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId || !UUID.test(propertyId)) return NextResponse.json({ error: "Invalid propertyId" }, { status: 400, headers });
  const { data, error } = await scope.value.supabase.from("property_brand_curations")
    .select("recommended,editor_description,expected_completion_manual,updated_at")
    .eq("brand_key", params.brandKey).eq("property_id", propertyId).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load notes" }, { status: 503, headers });
  return NextResponse.json({ ok: true, curation: data || { recommended: false, editor_description: "", expected_completion_manual: "" } }, { headers });
}
export async function PATCH(req: NextRequest, { params }: { params: { brandKey: string } }) {
  const scope = await requireBrandWorkspace(req, params.brandKey, "content.edit");
  if (!scope.value) return scope.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !UUID.test(String(body.propertyId || ""))
    || typeof body.recommended !== "boolean"
    || typeof body.editorDescription !== "string" || body.editorDescription.length > 8000
    || typeof body.expectedCompletion !== "string" || body.expectedCompletion.length > 200) {
    return NextResponse.json({ error: "Invalid fields" }, { status: 400, headers });
  }
  // Never allow employee edits to an arbitrary unpublished or other-brand listing.
  const { data: property, error: propertyError } = await scope.value.supabase.from("properties")
    .select("id,show_on_website,website_visible").eq("id", body.propertyId).maybeSingle();
  if (propertyError || !property || !property.show_on_website || !property.website_visible) {
    return NextResponse.json({ error: "Property unavailable" }, { status: 404, headers });
  }
  const { data: visible, error: brandError } = await scope.value.supabase.from("property_brand_visibility")
    .select("visible").eq("property_id", body.propertyId).eq("brand_id", scope.value.brandId)
    .eq("visible", true).maybeSingle();
  if (brandError || !visible) return NextResponse.json({ error: "Property not available for brand" }, { status: 403, headers });
  const { error } = await scope.value.supabase.from("property_brand_curations").upsert({
    property_id: body.propertyId, brand_key: params.brandKey,
    recommended: body.recommended, editor_description: body.editorDescription.trim(),
    expected_completion_manual: body.expectedCompletion.trim(),
    updated_by: scope.value.verifiedEmail, updated_at: new Date().toISOString(),
  }, { onConflict: "property_id,brand_key" });
  if (error) return NextResponse.json({ error: "Save failed" }, { status: 503, headers });
  return NextResponse.json({ ok: true }, { headers });
}
