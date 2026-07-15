import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDemoSitesSupabase } from "@/lib/demosites-api-supabase";
import { slugifyCompanyName } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_REALTYFLOW_URL || "https://realtyflow.chatgenius.pro";
// Each demo takes ~25-30s (crawl + AI copy + AI images) — 3 per call keeps
// the request comfortably inside the serverless limit; the button repeats.
const BATCH_SIZE = 3;

/**
 * POST /api/saas/demosites/leads/bulk-demos   Body: { lead_ids?: string[] }
 *
 * Top-of-funnel automation: qualified scanner leads get trial sites
 * generated in bulk so sellers show up with a finished site on their
 * phone. Uses the internal import e-mail alias so NO e-mail reaches the
 * prospect — the demo exists for the physical/1:1 sales moment.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getDemoSitesSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedIds = Array.isArray(body.lead_ids) ? body.lead_ids.map(String) : null;

  let query = supabase
    .from("demo_site_leads")
    .select("id, company_name, website_url, industry, contact_email, contact_phone, lead_status, demo_order_id")
    .is("demo_order_id", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (requestedIds?.length) {
    query = query.in("id", requestedIds.slice(0, BATCH_SIZE));
  } else {
    query = query.in("lead_status", ["qualified", "scanned"]);
  }

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads?.length) {
    return NextResponse.json({ ok: true, created: 0, remaining: 0, results: [], message: "Ingen leads klare for prøveside." });
  }

  const results: Array<{ lead_id: string; company: string; ok: boolean; preview_url?: string; error?: string }> = [];

  for (const lead of leads) {
    const companyName = String(lead.company_name || "").trim();
    if (!companyName) {
      results.push({ lead_id: lead.id, company: "(uten navn)", ok: false, error: "Mangler firmanavn" });
      continue;
    }

    try {
      // Reuse the full public creation pipeline (crawl → AI copy → AI
      // images) via an internal call. The import alias keeps the prospect
      // out of every automated e-mail flow.
      const res = await fetch(`${BASE_URL}/api/saas/demosites/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          customer_email: `demosites-import+${slugifyCompanyName(companyName) || lead.id.slice(0, 8)}@chatgenius.pro`,
          website_url: String(lead.website_url || "").trim() || undefined,
          industry: String(lead.industry || "").trim() || undefined,
          customer_phone: String(lead.contact_phone || "").trim() || undefined,
          package_id: "standard",
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const data = (await res.json()) as { order?: { id?: string }; previewUrl?: string; error?: string };
      if (!res.ok || !data.order?.id) throw new Error(data.error || `HTTP ${res.status}`);

      await supabase
        .from("demo_site_leads")
        .update({ lead_status: "demo_created", demo_order_id: data.order.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      results.push({ lead_id: lead.id, company: companyName, ok: true, preview_url: data.previewUrl });
    } catch (err) {
      results.push({ lead_id: lead.id, company: companyName, ok: false, error: err instanceof Error ? err.message : "Ukjent feil" });
    }
  }

  // How many are still waiting so the UI can offer "kjør neste batch".
  const { count } = await supabase
    .from("demo_site_leads")
    .select("id", { count: "exact", head: true })
    .is("demo_order_id", null)
    .in("lead_status", ["qualified", "scanned"]);

  return NextResponse.json({
    ok: true,
    created: results.filter((r) => r.ok).length,
    remaining: count || 0,
    results,
  });
}
