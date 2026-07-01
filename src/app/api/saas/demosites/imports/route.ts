import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { sanitizeImportReviewEditableFieldsForStorage } from "@/lib/demosites-import-review-versions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FormattedApiError = { error: string; details?: string; hint?: string; code?: string };

const IMPORT_HISTORY_INACTIVE_WARNING = "Importhistorikk er ikke aktivert ennå.";
const ALLOWED_IMPORT_STATUSES = new Set(["analyzed", "created_demo", "applied_to_demo", "discarded"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function formatApiError(error: unknown, fallback: string): FormattedApiError {
  if (error instanceof Error) return { error: error.message || fallback };
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof record.message === "string" && record.message.trim() ? record.message.trim() : fallback;
    return {
      error: message,
      details: typeof record.details === "string" && record.details.trim() ? record.details.trim() : undefined,
      hint: typeof record.hint === "string" && record.hint.trim() ? record.hint.trim() : undefined,
      code: typeof record.code === "string" && record.code.trim() ? record.code.trim() : undefined,
    };
  }
  return { error: fallback };
}

function isMissingImportHistory(error: unknown) {
  const formatted = formatApiError(error, "");
  const text = `${formatted.code || ""} ${formatted.error || ""} ${formatted.details || ""} ${formatted.hint || ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("demo_site_imports") || text.includes("schema cache") || text.includes("could not find");
}

function logApiError(context: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(context, { ...formatApiError(error, "Unknown DemoSites import history API error"), ...extra });
}

function asPositiveLimit(value: string | null) {
  const parsed = Number(value || 25);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(Math.floor(parsed), 50);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function stringArrayOrError(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) return { error: `${fieldName} must be an array` };
  return { value: value.map((item) => String(item || "").trim()).filter(Boolean) };
}

function numberOrNull(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === "") return { value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return { error: `${fieldName} must be a number` };
  return { value: Math.max(0, Math.min(100, parsed)) };
}

async function requireAdmin(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  return Boolean(session);
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ imports: [], warning: "Supabase server key is not configured." });

  try {
    const limit = asPositiveLimit(request.nextUrl.searchParams.get("limit"));
    const { data, error } = await supabase
      .from("demo_site_imports")
      .select("id, website_url, company_name, detected_industry, recommended_template_slug, confidence_score, profile, editable_fields, warnings, source_pages, created_order_id, applied_order_id, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingImportHistory(error)) return NextResponse.json({ imports: [], warning: IMPORT_HISTORY_INACTIVE_WARNING });
      logApiError("DemoSites import history GET failed", error);
      return NextResponse.json(formatApiError(error, "Could not fetch DemoSites import history"), { status: 500 });
    }

    return NextResponse.json({ imports: data || [] });
  } catch (error) {
    logApiError("DemoSites import history GET failed", error);
    return NextResponse.json(formatApiError(error, "Could not fetch DemoSites import history"), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body.id || body.import_id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.created_order_id !== undefined) patch.created_order_id = body.created_order_id || null;
    if (body.applied_order_id !== undefined) patch.applied_order_id = body.applied_order_id || null;
    if (body.status !== undefined) {
      const status = String(body.status || "").trim();
      if (!ALLOWED_IMPORT_STATUSES.has(status)) return NextResponse.json({ error: "Unsupported import status" }, { status: 400 });
      patch.status = status;
    }
    if (body.company_name !== undefined) patch.company_name = stringOrNull(body.company_name);
    if (body.detected_industry !== undefined) patch.detected_industry = stringOrNull(body.detected_industry);
    if (body.recommended_template_slug !== undefined) patch.recommended_template_slug = stringOrNull(body.recommended_template_slug);
    if (body.confidence_score !== undefined) {
      const parsed = numberOrNull(body.confidence_score, "confidence_score");
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      patch.confidence_score = parsed.value;
    }
    if (body.profile !== undefined) {
      if (!isPlainRecord(body.profile)) return NextResponse.json({ error: "profile must be an object" }, { status: 400 });
      patch.profile = body.profile;
    }
    if (body.editable_fields !== undefined) {
      const parsed = sanitizeImportReviewEditableFieldsForStorage(body.editable_fields);
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      patch.editable_fields = parsed.value;
    }
    if (body.warnings !== undefined) {
      const parsed = stringArrayOrError(body.warnings, "warnings");
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      patch.warnings = parsed.value;
    }
    if (body.source_pages !== undefined) {
      const parsed = stringArrayOrError(body.source_pages, "source_pages");
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      patch.source_pages = parsed.value;
    }

    const { data, error } = await supabase.from("demo_site_imports").update(patch).eq("id", id).select("*").single();
    if (error) {
      if (isMissingImportHistory(error)) return NextResponse.json({ import: null, warning: IMPORT_HISTORY_INACTIVE_WARNING });
      logApiError("DemoSites import history PATCH failed", error, { import_id: id });
      return NextResponse.json(formatApiError(error, "Could not update DemoSites import history"), { status: 500 });
    }

    return NextResponse.json({ import: data });
  } catch (error) {
    logApiError("DemoSites import history PATCH failed", error);
    return NextResponse.json(formatApiError(error, "Could not update DemoSites import history"), { status: 500 });
  }
}
