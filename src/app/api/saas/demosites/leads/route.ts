import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { DemoSiteLeadStatus, DemoSiteOutreachStatus } from "@/lib/demosites-leads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = Record<string, unknown>;

type SupabaseClientLike = any;

const LEAD_STATUSES: DemoSiteLeadStatus[] = ["new", "queued", "scanned", "qualified", "demo_created", "outreach_ready", "contacted", "responded", "converted", "not_fit", "opted_out", "archived"];
const OUTREACH_STATUSES: DemoSiteOutreachStatus[] = ["not_prepared", "drafted", "needs_review", "approved", "sent", "replied", "declined", "opted_out"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(body: RequestBody, snakeCase: string, camelCase = snakeCase) {
  const value = body[snakeCase] ?? body[camelCase];
  const output = String(value || "").trim();
  return output || null;
}

function normalizeUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function safeLeadStatus(value: unknown, fallback: DemoSiteLeadStatus): DemoSiteLeadStatus {
  return LEAD_STATUSES.includes(value as DemoSiteLeadStatus) ? (value as DemoSiteLeadStatus) : fallback;
}

function safeOutreachStatus(value: unknown, fallback: DemoSiteOutreachStatus): DemoSiteOutreachStatus {
  return OUTREACH_STATUSES.includes(value as DemoSiteOutreachStatus) ? (value as DemoSiteOutreachStatus) : fallback;
}

function safeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RequestBody : {};
}

async function insertLeadEvent(supabase: SupabaseClientLike, leadId: string, title: string, eventType: string, description?: string, metadata: RequestBody = {}) {
  await supabase.from("demo_site_lead_events").insert({
    lead_id: leadId,
    event_type: eventType,
    title,
    description,
    metadata,
  });
}

function buildSummary(leads: Array<{ lead_status?: string | null; outreach_status?: string | null }>) {
  return {
    total: leads.length,
    queued: leads.filter((lead) => lead.lead_status === "queued").length,
    qualified: leads.filter((lead) => lead.lead_status === "qualified").length,
    demoCreated: leads.filter((lead) => lead.lead_status === "demo_created").length,
    outreachReady: leads.filter((lead) => lead.lead_status === "outreach_ready" || lead.outreach_status === "approved").length,
    contacted: leads.filter((lead) => lead.lead_status === "contacted" || lead.outreach_status === "sent").length,
    converted: leads.filter((lead) => lead.lead_status === "converted").length,
  };
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured", leads: [], events: [], summary: buildSummary([]) }, { status: 503 });

  try {
    const [leadsResult, eventsResult] = await Promise.allSettled([
      supabase
        .from("demo_site_leads")
        .select("id, company_name, website_url, domain, contact_name, contact_email, contact_phone, country, city, industry, source, source_query, lead_status, outreach_status, demo_preview_url, demo_claim_url, demo_expires_at, last_scanned_at, notes, metadata, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("demo_site_lead_events")
        .select("id, lead_id, event_type, title, description, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    const leads = leadsResult.status === "fulfilled" && !leadsResult.value.error ? leadsResult.value.data || [] : [];
    const events = eventsResult.status === "fulfilled" && !eventsResult.value.error ? eventsResult.value.data || [] : [];

    return NextResponse.json({ leads, events, summary: buildSummary(leads) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load DemoSites leads", leads: [], events: [], summary: buildSummary([]) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const companyName = text(body, "company_name", "companyName");
    const websiteUrl = normalizeUrl(body.website_url ?? body.websiteUrl);

    if (!companyName) {
      return NextResponse.json({ error: "company_name is required" }, { status: 400 });
    }

    const domain = domainFromUrl(websiteUrl);
    const payload = {
      company_name: companyName,
      website_url: websiteUrl,
      domain,
      contact_name: text(body, "contact_name", "contactName"),
      contact_email: text(body, "contact_email", "contactEmail"),
      contact_phone: text(body, "contact_phone", "contactPhone"),
      country: text(body, "country", "country") || "ES",
      city: text(body, "city", "city"),
      industry: text(body, "industry", "industry"),
      source: text(body, "source", "source") || "manual",
      source_query: text(body, "source_query", "sourceQuery"),
      lead_status: safeLeadStatus(body.lead_status ?? body.leadStatus, websiteUrl ? "queued" : "new"),
      outreach_status: safeOutreachStatus(body.outreach_status ?? body.outreachStatus, "not_prepared"),
      demo_preview_url: text(body, "demo_preview_url", "demoPreviewUrl"),
      demo_claim_url: text(body, "demo_claim_url", "demoClaimUrl"),
      demo_expires_at: text(body, "demo_expires_at", "demoExpiresAt"),
      notes: text(body, "notes", "notes"),
      metadata: safeMetadata(body.metadata),
    };

    const { data, error } = await supabase.from("demo_site_leads").insert(payload).select("*").single();
    if (error) throw error;

    await insertLeadEvent(supabase, data.id, "Lead opprettet", "lead_created", `${companyName} ble lagt inn i DemoSites lead-pipeline.`, { website_url: websiteUrl, domain });

    return NextResponse.json({ lead: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create DemoSites lead" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const id = text(body, "id", "id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patch: RequestBody = { updated_at: new Date().toISOString() };
    if (body.lead_status || body.leadStatus) patch.lead_status = safeLeadStatus(body.lead_status ?? body.leadStatus, "new");
    if (body.outreach_status || body.outreachStatus) patch.outreach_status = safeOutreachStatus(body.outreach_status ?? body.outreachStatus, "not_prepared");
    if (body.demo_preview_url !== undefined || body.demoPreviewUrl !== undefined) patch.demo_preview_url = text(body, "demo_preview_url", "demoPreviewUrl");
    if (body.demo_claim_url !== undefined || body.demoClaimUrl !== undefined) patch.demo_claim_url = text(body, "demo_claim_url", "demoClaimUrl");
    if (body.demo_expires_at !== undefined || body.demoExpiresAt !== undefined) patch.demo_expires_at = text(body, "demo_expires_at", "demoExpiresAt");
    if (body.metadata !== undefined) {
      const existing = await supabase.from("demo_site_leads").select("metadata").eq("id", id).maybeSingle();
      if (existing.error) throw existing.error;
      patch.metadata = { ...safeMetadata(existing.data?.metadata), ...safeMetadata(body.metadata) };
    }
    if (body.notes !== undefined) patch.notes = text(body, "notes", "notes");

    const { data, error } = await supabase.from("demo_site_leads").update(patch).eq("id", id).select("*").single();
    if (error) throw error;

    await insertLeadEvent(supabase, id, "Lead oppdatert", "lead_updated", `${data.company_name} ble oppdatert.`, patch);

    return NextResponse.json({ lead: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update DemoSites lead" }, { status: 500 });
  }
}
