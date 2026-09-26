import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { rescoreCorporateProspect } from "@/lib/corporate-prospects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

const ALLOWED = new Set([
  "company_name",
  "organization_number",
  "domain",
  "organization_type",
  "country_code",
  "city",
  "industry",
  "employee_count",
  "employee_band",
  "member_count",
  "website_url",
  "linkedin_company_url",
  "status",
  "decision_roles",
  "source_type",
  "source_url",
  "evidence",
  "notes",
  "next_action",
  "next_followup",
]);

function cleanPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED.has(key)) continue;
    patch[key] = value === "" ? null : value;
  }
  if (typeof patch.status === "string") patch.status = patch.status.trim().toUpperCase().replace(/[ -]+/g, "_");
  if (typeof patch.country_code === "string") patch.country_code = patch.country_code.trim().toUpperCase().slice(0, 4);
  if (typeof patch.domain === "string") {
    patch.domain = patch.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
  if (Array.isArray(patch.decision_roles)) {
    patch.decision_roles = [...new Set(patch.decision_roles.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 20);
  }
  if (patch.employee_count !== undefined && patch.employee_count !== null) {
    const value = Number(patch.employee_count);
    patch.employee_count = Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (patch.member_count !== undefined && patch.member_count !== null) {
    const value = Number(patch.member_count);
    patch.member_count = Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof patch.next_followup === "string") {
    const parsed = Date.parse(patch.next_followup);
    patch.next_followup = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return patch;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { prospect: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const patch = cleanPatch(body && typeof body === "object" && !Array.isArray(body) ? body : {});

  const { data: existing, error: existingError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const merged = { ...existing, ...patch };
  const score = rescoreCorporateProspect(merged);
  const update = { ...patch, ...score, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("corporate_prospects")
    .update(update)
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}
