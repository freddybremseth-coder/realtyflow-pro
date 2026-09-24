import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 50;
const SAFE_CONTACT_COLUMNS = "id,name,email,phone,brand_id,pipeline_status,source,updated_at";

/** Only brand-assigned contacts. No cross-brand fallbacks, duplicate search or inferred sharing. */
export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const { brandKey } = params;
  const access = await requireBrandWorkspace(request, brandKey, "crm.read");
  if (!access.value) return access.response;

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const raw = searchParams.get("q") || "";
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 || raw.length > 80) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_SEARCH" } }, {
      status: 400, headers: noStore,
    });
  }
  // Characters used to construct the PostgREST OR syntax are never accepted
  // from the request. Keep the search inside the same brand-filtered DB query.
  const term = raw.trim().replace(/[^\p{L}\p{N}\s@.+_-]/gu, " ").replace(/\s+/g, " ").trim();
  // Keep the dot in a normal email address while stripping syntax-like dots
  // from general text searches. Parentheses and commas are always removed.
  const safeTerm = term.includes("@") ? term : term.replace(/[.,()]/g, " ").trim();
  let query = access.value.supabase.from("contacts").select(SAFE_CONTACT_COLUMNS).eq("brand_id", brandKey);
  if (safeTerm) {
    query = query.or(`name.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`);
  }
  const { data, error } = await query.order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (error) return NextResponse.json({ ok: false, error: { code: "CRM_UNAVAILABLE" } }, {
    status: 503, headers: noStore,
  });
  const rows = data || [];
  return NextResponse.json({
    ok: true, brand: brandKey, contacts: rows.slice(0, PAGE_SIZE),
    page, pageSize: PAGE_SIZE, hasMore: rows.length > PAGE_SIZE,
  }, { headers: noStore });
}


type AllowedContactInput = { name?: string; email?: string | null; phone?: string | null };

function validateContactInput(value: unknown, updating: boolean):
  | { value: AllowedContactInput; error: null }
  | { value: null; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value: null, error: "INVALID_CONTACT" };
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some(key => !["name", "email", "phone"].includes(key)))
    return { value: null, error: "INVALID_CONTACT_FIELDS" };
  const input: AllowedContactInput = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 140)
      return { value: null, error: "INVALID_NAME" };
    input.name = body.name.trim();
  } else if (!updating) return { value: null, error: "INVALID_NAME" };
  for (const field of ["email", "phone"] as const) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw !== null && typeof raw !== "string") return { value: null, error: "INVALID_CONTACT_FIELDS" };
    const text = typeof raw === "string" ? raw.trim() : "";
    if (field === "email") {
      if (text && (text.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(text)))
        return { value: null, error: "INVALID_EMAIL" };
      input.email = text ? text.toLowerCase() : null;
    } else {
      if (text.length > 60) return { value: null, error: "INVALID_PHONE" };
      input.phone = text || null;
    }
  }
  return { value: input, error: null };
}

function writeRequestIsSafe(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function failWrite(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

/** New scoped contacts never use the legacy upsert/duplicate finder: it can leak cross-brand PII. */
export async function POST(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const { brandKey } = params;
  const access = await requireBrandWorkspace(request, brandKey, "crm.write");
  if (!access.value) return access.response;
  if (!writeRequestIsSafe(request)) return failWrite(403, "INVALID_REQUEST_ORIGIN");
  const input = validateContactInput(await request.json().catch(() => null), false);
  if (!input.value) return failWrite(400, input.error);
  const { data, error } = await access.value.supabase.from("contacts")
    .insert({ ...input.value, brand_id: brandKey, pipeline_status: "NEW" })
    .select(SAFE_CONTACT_COLUMNS).single();
  if (error || !data || data.brand_id !== brandKey) return failWrite(503, "CRM_WRITE_UNAVAILABLE");
  return NextResponse.json({ ok: true, brand: brandKey, contact: data }, { status: 201, headers: noStore });
}

/**
 * Row mutation checks both ID and exact brand in the database operation;
 * it never looks up an arbitrary contact first and never accepts a client
 * supplied brand/status/commission/notes/interaction field.
 */
export async function PATCH(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const { brandKey } = params;
  const access = await requireBrandWorkspace(request, brandKey, "crm.write");
  if (!access.value) return access.response;
  if (!writeRequestIsSafe(request)) return failWrite(403, "INVALID_REQUEST_ORIGIN");
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return failWrite(400, "INVALID_CONTACT");
  const { id, ...fields } = body as Record<string, unknown>;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    return failWrite(400, "INVALID_CONTACT_ID");
  const input = validateContactInput(fields, true);
  if (!input.value) return failWrite(400, input.error);
  const { data, error } = await access.value.supabase.from("contacts")
    .update({ ...input.value, updated_at: new Date().toISOString() })
    .eq("id", id).eq("brand_id", brandKey)
    .select(SAFE_CONTACT_COLUMNS).maybeSingle();
  if (error) return failWrite(503, "CRM_WRITE_UNAVAILABLE");
  if (!data) return failWrite(404, "CONTACT_NOT_FOUND");
  if (data.brand_id !== brandKey) return failWrite(503, "CRM_WRITE_UNAVAILABLE");
  return NextResponse.json({ ok: true, brand: brandKey, contact: data }, { headers: noStore });
}
