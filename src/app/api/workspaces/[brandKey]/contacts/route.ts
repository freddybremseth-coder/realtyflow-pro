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
