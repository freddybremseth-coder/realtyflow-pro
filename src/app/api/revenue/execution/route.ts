import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildExecutionWorkspace, EXECUTION_BRANDS, type ExecutionBrand } from "@/lib/revenue/execution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN_WORK_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const ACTIONS = new Set(["create_task", "set_followup", "postpone_task", "complete_task"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

function validBrand(value: unknown): ExecutionBrand | null {
  const normalized = String(value || "").trim().toLowerCase() as ExecutionBrand;
  return EXECUTION_BRANDS.includes(normalized) ? normalized : null;
}

function validDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const min = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const max = new Date(Date.UTC(now.getUTCFullYear() + 5, 11, 31));
  return date >= min && date <= max ? raw : null;
}

function missingColumn(message = "") {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

async function updateFollowup(supabase: any, contact: any, dueDate: string, actor: string) {
  const event = {
    id: `execution-followup-${Date.now()}`,
    type: "internal",
    action: "execution_followup_scheduled",
    content: `Intern oppfølging satt til ${dueDate}.`,
    date: new Date().toISOString(),
    direction: "internal",
    metadata: {
      source: "execution-workspace",
      due_date: dueDate,
      no_customer_contact: true,
      actor,
    },
  };
  const interactions = Array.isArray(contact.interactions) ? [...contact.interactions, event] : [event];
  const dateFields = ["next_followup", "next_follow_up", "follow_up_date"];
  let lastError = "Ingen støttet oppfølgingskolonne ble funnet.";

  for (const field of dateFields) {
    let payload: Record<string, unknown> = { [field]: dueDate, interactions, updated_at: new Date().toISOString() };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await supabase.from("contacts").update(payload).eq("id", contact.id).select().single();
      if (!result.error) return result.data;
      lastError = result.error.message || lastError;
      const column = missingColumn(lastError);
      if (column === field) break;
      if (column === "interactions" && "interactions" in payload) {
        const { interactions: _ignored, ...withoutInteractions } = payload;
        payload = withoutInteractions;
        continue;
      }
      break;
    }
  }
  throw new Error(lastError);
}

async function getContact(supabase: any, contactId: string) {
  const result = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function getOpenTasksForContact(supabase: any, contactId: string) {
  const result = await supabase
    .from("work_items")
    .select("*")
    .eq("source_type", "crm")
    .eq("source_id", contactId)
    .in("status", OPEN_WORK_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (result.error) {
    if (optionalTableError(result.error.message || "")) return [];
    throw new Error(result.error.message);
  }
  return result.data || [];
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { workspace: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", workspace: null }, { status: 500 });

  const requestedBrand = new URL(request.url).searchParams.get("brand");
  const brandFilter = requestedBrand && requestedBrand !== "all" ? validBrand(requestedBrand) : null;
  if (requestedBrand && requestedBrand !== "all" && !brandFilter) {
    return NextResponse.json({ error: "Invalid execution brand", workspace: null }, { status: 400 });
  }

  let contactsQuery = supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(2000);
  if (brandFilter) contactsQuery = contactsQuery.or(`brand_id.eq.${brandFilter},brand.eq.${brandFilter}`);

  const [contactsResult, workResult] = await Promise.allSettled([
    contactsQuery,
    supabase.from("work_items").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(1000),
  ]);

  if (contactsResult.status === "rejected" || contactsResult.value?.error) {
    const message = contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error ? contactsResult.reason.message : "Kunne ikke hente kontakter"
      : contactsResult.value?.error?.message || "Kunne ikke hente kontakter";
    return NextResponse.json({ error: message, workspace: null }, { status: 500 });
  }

  const warnings: string[] = [];
  let workItems: any[] = [];
  if (workResult.status === "rejected") warnings.push(`work_items: ${workResult.reason instanceof Error ? workResult.reason.message : "ukjent feil"}`);
  else if (workResult.value?.error) {
    if (!optionalTableError(workResult.value.error.message || "")) warnings.push(`work_items: ${workResult.value.error.message}`);
    else warnings.push("work_items-tabellen er ikke tilgjengelig; CRM-oppfølging vises fortsatt, men oppgaver kan ikke lagres.");
  } else workItems = workResult.value?.data || [];

  if (brandFilter) {
    workItems = workItems.filter((row) => String(row.brand_id || "").toLowerCase() === brandFilter);
  }

  const workspace = buildExecutionWorkspace({
    contacts: contactsResult.value?.data || [],
    workItems,
    warnings,
  });
  return NextResponse.json({ workspace });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Invalid execution action" }, { status: 400 });

  const actor = "realtyflow-admin";

  try {
    if (action === "create_task") {
      const contactId = String(body.contactId || "").trim();
      if (!UUID_PATTERN.test(contactId)) return NextResponse.json({ error: "Valid contactId is required" }, { status: 400 });
      const contact = await getContact(supabase, contactId);
      if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      const existing = await getOpenTasksForContact(supabase, contactId);
      if (existing[0]) return NextResponse.json({ ok: true, duplicate: true, workItem: existing[0] });

      const workspace = buildExecutionWorkspace({ contacts: [contact], workItems: [], now: new Date() });
      const item = workspace.items.find((row) => row.contactId === contactId);
      if (!item) return NextResponse.json({ error: "Contact has no actionable execution item" }, { status: 409 });
      const dueDate = validDate(body.dueDate) || item.dueDate;
      const executionKey = `contact:${contactId}:${item.kind}`;
      const payload = {
        title: item.title,
        description: item.detail,
        status: "TO_DO",
        priority: item.priority,
        due_date: dueDate,
        brand_id: item.brandId,
        source_type: "crm",
        source_id: contactId,
        assigned_agent: "sales",
        next_action: item.calendar.description,
        ai_score: Math.max(0, Math.min(100, Math.round(item.score))),
        metadata: {
          execution_key: executionKey,
          contact_id: contactId,
          execution_kind: item.kind,
          created_from: "execution-workspace",
          no_customer_contact: true,
        },
      };
      const result = await supabase.from("work_items").insert(payload).select().single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      return NextResponse.json({ ok: true, duplicate: false, workItem: result.data }, { status: 201 });
    }

    if (action === "set_followup") {
      const contactId = String(body.contactId || "").trim();
      const dueDate = validDate(body.dueDate);
      if (!UUID_PATTERN.test(contactId)) return NextResponse.json({ error: "Valid contactId is required" }, { status: 400 });
      if (!dueDate) return NextResponse.json({ error: "Valid dueDate is required" }, { status: 400 });
      const contact = await getContact(supabase, contactId);
      if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      const updated = await updateFollowup(supabase, contact, dueDate, actor);
      return NextResponse.json({ ok: true, contact: updated });
    }

    const workItemId = String(body.workItemId || "").trim();
    if (!UUID_PATTERN.test(workItemId)) return NextResponse.json({ error: "Valid workItemId is required" }, { status: 400 });

    if (action === "complete_task") {
      const result = await supabase
        .from("work_items")
        .update({ status: "DONE", updated_at: new Date().toISOString() })
        .eq("id", workItemId)
        .in("status", OPEN_WORK_STATUSES)
        .select()
        .maybeSingle();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      if (!result.data) return NextResponse.json({ error: "Open work item not found" }, { status: 409 });
      return NextResponse.json({ ok: true, workItem: result.data });
    }

    const dueDate = validDate(body.dueDate);
    if (!dueDate) return NextResponse.json({ error: "Valid dueDate is required" }, { status: 400 });
    const result = await supabase
      .from("work_items")
      .update({ due_date: dueDate, updated_at: new Date().toISOString() })
      .eq("id", workItemId)
      .in("status", OPEN_WORK_STATUSES)
      .select()
      .maybeSingle();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    if (!result.data) return NextResponse.json({ error: "Open work item not found" }, { status: 409 });
    return NextResponse.json({ ok: true, workItem: result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution action failed" }, { status: 500 });
  }
}
