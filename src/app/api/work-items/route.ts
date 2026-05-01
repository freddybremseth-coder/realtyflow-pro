import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkItemStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "CANCELLED";
type WorkItemPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeStatus(status?: string): WorkItemStatus {
  const value = String(status || "TO_DO").toUpperCase();
  if (["TO_DO", "IN_PROGRESS", "REVIEW", "DONE", "CANCELLED"].includes(value)) return value as WorkItemStatus;
  return "TO_DO";
}

function normalizePriority(priority?: string): WorkItemPriority {
  const value = String(priority || "MEDIUM").toUpperCase();
  if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(value)) return value as WorkItemPriority;
  return "MEDIUM";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function scoreContact(contact: { interactions?: unknown[]; notes?: string | null; pipeline_status?: string | null; pipeline_value?: number | null }) {
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const haystack = `${contact.notes || ""} ${interactions.map((item: any) => item?.content || "").join(" ")}`.toLowerCase();
  let score = 20;
  if ((contact.pipeline_value || 0) > 0) score += 15;
  if (/kjøpssignal|oppdaterte ønsker|min side|favoritt|kalkulator|rapport|dokument|visning/.test(haystack)) score += 35;
  if (/klar nå|innen 3 mnd|reservasjon|budsjett til|book/.test(haystack)) score += 20;
  if (["VIEWING", "NEGOTIATION", "QUALIFIED"].includes(contact.pipeline_status || "")) score += 20;
  return Math.min(100, score);
}

async function synthesizedItems(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const [contactsRes, failedPubsRes, automationErrorsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id,name,email,pipeline_status,pipeline_value,interactions,notes,brand_id,brand,updated_at")
      .in("pipeline_status", ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION"])
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("content_publications")
      .select("id,title,brand_id,last_publish_error,publish_attempts,updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("automation_logs")
      .select("id,action,agent_name,details,created_at")
      .eq("status", "error")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const contactItems = (contactsRes.data || [])
    .map((contact) => ({ contact, score: scoreContact(contact) }))
    .filter((item) => item.score >= 70)
    .slice(0, 10)
    .map(({ contact, score }) => ({
      id: `crm-${contact.id}`,
      title: `Følg opp ${contact.name || contact.email || "varm lead"}`,
      description: `Kjøpssignal ${score}/100. Status: ${contact.pipeline_status || "ukjent"}.`,
      status: "TO_DO",
      priority: score >= 90 ? "CRITICAL" : "HIGH",
      due_date: todayDate(),
      brand_id: contact.brand_id || contact.brand || "zeneco",
      source_type: "crm",
      source_id: contact.id,
      assigned_agent: "sales",
      next_action: "Kontakt kunden og avklar budsjett, område og tidslinje.",
      ai_score: score,
      metadata: { synthetic: true, email: contact.email, pipeline_status: contact.pipeline_status },
      created_at: contact.updated_at,
      updated_at: contact.updated_at,
    }));

  const failedPublicationItems = (failedPubsRes.data || []).map((pub) => ({
    id: `content-${pub.id}`,
    title: `Publisering feilet: ${pub.title || "Uten tittel"}`,
    description: pub.last_publish_error || `${pub.publish_attempts || 0} forsøk feilet.`,
    status: "TO_DO",
    priority: "HIGH",
    due_date: todayDate(),
    brand_id: pub.brand_id,
    source_type: "content",
    source_id: pub.id,
    assigned_agent: "marketing",
    next_action: "Sjekk token/konto og prøv publisering på nytt.",
    ai_score: 82,
    metadata: { synthetic: true, publish_attempts: pub.publish_attempts },
    created_at: pub.updated_at,
    updated_at: pub.updated_at,
  }));

  const automationItems = (automationErrorsRes.data || []).map((log) => ({
    id: `automation-${log.id}`,
    title: `Automasjon feilet: ${log.action || "ukjent handling"}`,
    description: (log.details as any)?.error || (log.details as any)?.message || "Automasjon feilet og bør sjekkes.",
    status: "TO_DO",
    priority: "MEDIUM",
    due_date: todayDate(),
    brand_id: null,
    source_type: "automation",
    source_id: log.id,
    assigned_agent: log.agent_name || "victoria",
    next_action: "Les feilmelding, rett årsak og kjør på nytt.",
    ai_score: 70,
    metadata: { synthetic: true },
    created_at: log.created_at,
    updated_at: log.created_at,
  }));

  return [...contactItems, ...failedPublicationItems, ...automationItems]
    .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ work_items: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") || 100);

  let query = supabase
    .from("work_items")
    .select("*")
    .order("ai_score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    if (/work_items|schema cache|does not exist|relation/i.test(error.message)) {
      const items = await synthesizedItems(supabase);
      return NextResponse.json({ work_items: items.slice(0, limit), synthetic: true, tableNotReady: true });
    }
    return NextResponse.json({ error: error.message, work_items: [] }, { status: 500 });
  }

  const synthetic = await synthesizedItems(supabase);
  const existingKeys = new Set((data || []).map((item) => `${item.source_type}:${item.source_id}`));
  const merged = [
    ...(data || []),
    ...synthetic.filter((item) => !existingKeys.has(`${item.source_type}:${item.source_id}`)),
  ].slice(0, limit);

  return NextResponse.json({ work_items: merged, synthetic: synthetic.length > 0 });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const payload = {
    title,
    description: body.description ? String(body.description) : null,
    status: normalizeStatus(body.status),
    priority: normalizePriority(body.priority),
    due_date: body.due_date || body.dueDate || null,
    brand_id: body.brand_id || body.brand || null,
    source_type: body.source_type || "manual",
    source_id: body.source_id || null,
    assigned_agent: body.assigned_agent || body.platform || null,
    next_action: body.next_action || null,
    ai_score: Math.max(0, Math.min(100, Number(body.ai_score || 50))),
    metadata: body.metadata || { platform: body.platform || null },
  };

  const { data, error } = await supabase.from("work_items").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ work_item: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (id.includes("-") && !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Syntetiske oppgaver kan ikke oppdateres før work_items-tabellen er migrert." }, { status: 409 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) updates.status = normalizeStatus(body.status);
  if (body.priority) updates.priority = normalizePriority(body.priority);
  if (body.title) updates.title = String(body.title);
  if ("description" in body) updates.description = body.description;
  if ("due_date" in body || "dueDate" in body) updates.due_date = body.due_date || body.dueDate || null;
  if ("brand_id" in body || "brand" in body) updates.brand_id = body.brand_id || body.brand || null;
  if ("assigned_agent" in body || "platform" in body) updates.assigned_agent = body.assigned_agent || body.platform || null;
  if ("next_action" in body) updates.next_action = body.next_action || null;

  const { data, error } = await supabase.from("work_items").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ work_item: data });
}
