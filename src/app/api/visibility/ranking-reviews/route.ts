import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getGSCRankingInventory } from "@/services/agents/seo-search-console";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Explicit owner action, server-verified GSC row, PROPOSED investigation only. */
export async function POST(request: NextRequest) {
  const access = await getRequestAccessContext(request);
  if (access?.role !== "OWNER" || access.source !== "owner-session")
    return NextResponse.json({ error: "Owner session required" }, { status: 403 });
  const origin = request.headers.get("origin");
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const body = await request.json().catch(() => null) as { brandId?: unknown; query?: unknown; page?: unknown } | null;
  if (body?.brandId !== "zeneco" || typeof body.query !== "string" || typeof body.page !== "string" ||
      body.query.length > 150 || body.page.length > 2048)
    return NextResponse.json({ error: "Invalid ranking selection" }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const inventory = await getGSCRankingInventory("zeneco");
    if (!inventory || inventory.dataQuality.truncated)
      return NextResponse.json({ error: "Complete ranking evidence unavailable" }, { status: 409 });
    const row = inventory.rows.find(x => x.query === body.query && x.page === body.page);
    if (!row || row.impressions < 20 || row.position <= 0 ||
      !((row.position > 5 && row.position <= 20) || (row.position <= 10 && row.ctr < .02 && row.impressions >= 100)))
      return NextResponse.json({ error: "No eligible Google observation" }, { status: 409 });
    const findingId = "gsc-ranking:" + createHash("sha256").update("zeneco\u0000" + row.query + "\u0000" + row.page).digest("hex");
    const target = new URL(row.page, "https://www.zenecohomes.com").toString();
    const description = "Google Search Console " + inventory.period.start + "–" + inventory.period.end +
      ": søk «" + row.query + "», gjennomsnittlig posisjon " + row.position +
      ", visninger " + row.impressions + ", klikk " + row.clicks +
      ". Hypotese, ikke verifisert årsak. Undersøk søkeintensjon, konkurrenter, innhold, metadata og internlenker.";
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("enqueue_visibility_review", {
      p_brand_id: "zeneco", p_finding_id: findingId,
      p_title: "Google-rangering til undersøkelse: " + row.query.slice(0, 100),
      p_description: description,
      p_next_action: "Sam SEO: kontroller faktisk søkeresultat, intensjon og side før tiltak foreslås.",
      p_priority: row.position > 10 ? "HIGH" : "MEDIUM",
      p_evidence_at: inventory.collectedAt, p_evidence_age: "RECENT",
      p_category: "missing-data", p_target_url: target,
    });
    if (error || typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data))
      return NextResponse.json({ error: "Nexus could not register review" }, { status: 503 });
    return NextResponse.json({
      state: "PROPOSED", work_item_id: data, evidence_at: inventory.collectedAt,
      execution_started: false, publication_authorized: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Fresh Search Console evidence unavailable" }, { status: 503 });
  }
}
