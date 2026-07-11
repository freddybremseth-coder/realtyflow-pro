import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { verifyAdminSession, getAdminEmails } from "@/lib/admin-auth";
import { loadAccessSettings } from "@/lib/access-control-server";
import { buildTeamWorkload, type TeamResourceType } from "@/lib/revenue/team-workload";
import type { AccessRole } from "@/lib/access-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ASSIGNMENT_SETTINGS_KEY = "team-workload:assignments";
const OPEN_TASK_STATUSES = ["TO_DO", "TODO", "OPEN", "IN_PROGRESS", "REVIEW", "PENDING"];
const RESOURCE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/;

interface AssignmentEvent {
  id: string;
  resourceType: TeamResourceType;
  resourceId: string;
  ownerEmail: string | null;
  ownerRole: AccessRole | null;
  ownerName: string | null;
  previousOwnerEmail: string | null;
  assignedAt: string;
  assignedBy: string;
  action: "ASSIGNED" | "UNASSIGNED";
}

interface AssignmentSettings {
  version: 1;
  events: AssignmentEvent[];
  updatedAt: string | null;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function normalizeResourceType(value: unknown): TeamResourceType | null {
  const type = String(value || "").trim().toUpperCase();
  return type === "CONTACT" || type === "TASK" ? type : null;
}

function parseSettings(value: unknown): AssignmentSettings {
  if (!value || typeof value !== "object") return { version: 1, events: [], updatedAt: null };
  const row = value as Record<string, unknown>;
  const events = (Array.isArray(row.events) ? row.events : [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item): AssignmentEvent | null => {
      const resourceType = normalizeResourceType(item.resourceType || item.resource_type);
      const resourceId = String(item.resourceId || item.resource_id || "").trim();
      const assignedAt = String(item.assignedAt || item.assigned_at || "").trim();
      const assignedBy = normalizeEmail(item.assignedBy || item.assigned_by);
      const action = String(item.action || "").toUpperCase();
      const ownerEmail = normalizeEmail(item.ownerEmail || item.owner_email) || null;
      if (!resourceType || !RESOURCE_ID_PATTERN.test(resourceId) || !assignedAt || !assignedBy || !["ASSIGNED", "UNASSIGNED"].includes(action)) return null;
      return {
        id: String(item.id || `${resourceType}:${resourceId}:${assignedAt}`),
        resourceType,
        resourceId,
        ownerEmail,
        ownerRole: (String(item.ownerRole || item.owner_role || "").toUpperCase() || null) as AccessRole | null,
        ownerName: String(item.ownerName || item.owner_name || "").trim() || null,
        previousOwnerEmail: normalizeEmail(item.previousOwnerEmail || item.previous_owner_email) || null,
        assignedAt,
        assignedBy,
        action: action as AssignmentEvent["action"],
      };
    })
    .filter(Boolean) as AssignmentEvent[];
  events.sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  return { version: 1, events: events.slice(0, 2000), updatedAt: String(row.updatedAt || row.updated_at || "").trim() || null };
}

async function loadAssignmentSettings(supabase: any) {
  const result = await supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", ASSIGNMENT_SETTINGS_KEY).maybeSingle();
  if (result.error) return { settings: parseSettings(null), error: result.error.message };
  const settings = parseSettings(result.data?.settings);
  settings.updatedAt = settings.updatedAt || result.data?.updated_at || null;
  return { settings, error: null as string | null };
}

function latestAssignmentMap(events: AssignmentEvent[]) {
  const map = new Map<string, AssignmentEvent>();
  for (const event of events) {
    const key = `${event.resourceType}:${event.resourceId}`;
    if (!map.has(key)) map.set(key, event);
  }
  return map;
}

function overlayAssignments(contacts: any[], workItems: any[], events: AssignmentEvent[]) {
  const map = latestAssignmentMap(events);
  const contactRows = contacts.map((contact) => {
    const assignment = map.get(`CONTACT:${contact.id}`);
    if (!assignment) return contact;
    const interaction = {
      id: assignment.id,
      type: "internal",
      action: assignment.action === "ASSIGNED" ? "team_owner_assigned" : "team_owner_unassigned",
      content: assignment.action === "ASSIGNED" ? `Teamansvar satt til ${assignment.ownerName || assignment.ownerEmail}.` : "Teamansvar fjernet.",
      date: assignment.assignedAt,
      direction: "internal",
      metadata: {
        source: "team-workload",
        owner_email: assignment.ownerEmail,
        owner_role: assignment.ownerRole,
        previous_owner_email: assignment.previousOwnerEmail,
        performed_by: assignment.assignedBy,
        no_customer_contact: true,
      },
    };
    return { ...contact, interactions: [...(Array.isArray(contact.interactions) ? contact.interactions : []), interaction] };
  });
  const taskRows = workItems.map((item) => {
    const assignment = map.get(`TASK:${item.id}`);
    return assignment ? { ...item, assigned_agent: assignment.ownerEmail } : item;
  });
  return { contacts: contactRows, workItems: taskRows };
}

async function actorSession(request: NextRequest) {
  return verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
}

async function appendContactTimeline(supabase: any, contact: any, event: AssignmentEvent) {
  const interaction = {
    id: event.id,
    type: "internal",
    action: event.action === "ASSIGNED" ? "team_owner_assigned" : "team_owner_unassigned",
    content: event.action === "ASSIGNED" ? `Teamansvar satt til ${event.ownerName || event.ownerEmail}.` : "Teamansvar fjernet.",
    date: event.assignedAt,
    direction: "internal",
    metadata: {
      source: "team-workload",
      owner_email: event.ownerEmail,
      owner_role: event.ownerRole,
      previous_owner_email: event.previousOwnerEmail,
      before: event.previousOwnerEmail,
      after: event.ownerEmail,
      performed_by: event.assignedBy,
      no_customer_contact: true,
    },
  };
  const interactions = [...(Array.isArray(contact.interactions) ? contact.interactions : []), interaction];
  const result = await supabase.from("contacts").update({ interactions, updated_at: event.assignedAt }).eq("id", contact.id);
  return result.error?.message || null;
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminApi(request, { workspace: null });
  if (authError) return authError;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", workspace: null }, { status: 500 });

  const [contactsResult, workResult, accessResult, assignmentsResult] = await Promise.all([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(2500),
    supabase.from("work_items").select("*").in("status", OPEN_TASK_STATUSES).order("due_date", { ascending: true, nullsFirst: false }).limit(1500),
    loadAccessSettings(),
    loadAssignmentSettings(supabase),
  ]);
  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message, workspace: null }, { status: 500 });

  const warnings: string[] = [];
  if (workResult.error) warnings.push(`work_items: ${workResult.error.message}`);
  if (accessResult.error) warnings.push(`access-control: ${accessResult.error}`);
  if (assignmentsResult.error) warnings.push(`team assignments: ${assignmentsResult.error}`);
  const overlay = overlayAssignments(contactsResult.data || [], workResult.data || [], assignmentsResult.settings.events);
  const workspace = buildTeamWorkload({
    contacts: overlay.contacts,
    workItems: overlay.workItems,
    ownerEmails: getAdminEmails(),
    profiles: accessResult.settings.profiles,
    warnings,
  });
  const session = await actorSession(request);
  return NextResponse.json({
    workspace,
    canManageAssignments: session?.role === "OWNER",
    assignmentHistoryCount: assignmentsResult.settings.events.length,
  });
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;
  const session = await actorSession(request);
  if (!session?.email || session.role !== "OWNER") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const resourceType = normalizeResourceType(body.resourceType);
  const resourceId = String(body.resourceId || "").trim();
  const requestedOwnerEmail = normalizeEmail(body.ownerEmail) || null;
  if (!resourceType || !RESOURCE_ID_PATTERN.test(resourceId)) return NextResponse.json({ error: "Valid resourceType and resourceId are required" }, { status: 400 });

  const access = await loadAccessSettings();
  if (access.error) return NextResponse.json({ error: access.error }, { status: 500 });
  const owners = getAdminEmails().map((email) => ({ email: email.toLowerCase(), displayName: email.split("@")[0], role: "OWNER" as AccessRole, active: true }));
  const team = [...owners, ...access.settings.profiles.filter((profile) => profile.active)];
  const target = requestedOwnerEmail ? team.find((member) => member.email.toLowerCase() === requestedOwnerEmail) || null : null;
  if (requestedOwnerEmail && !target) return NextResponse.json({ error: "Owner must be an active RealtyFlow team member" }, { status: 400 });

  let resource: any = null;
  if (resourceType === "CONTACT") {
    const result = await supabase.from("contacts").select("*").eq("id", resourceId).maybeSingle();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    resource = result.data;
  } else {
    const result = await supabase.from("work_items").select("*").eq("id", resourceId).maybeSingle();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    resource = result.data;
  }
  if (!resource) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  const current = await loadAssignmentSettings(supabase);
  if (current.error) return NextResponse.json({ error: current.error }, { status: 500 });
  const previous = latestAssignmentMap(current.settings.events).get(`${resourceType}:${resourceId}`) || null;
  if ((previous?.ownerEmail || null) === requestedOwnerEmail) return NextResponse.json({ ok: true, unchanged: true, assignment: previous });

  const now = new Date().toISOString();
  const event: AssignmentEvent = {
    id: crypto.randomUUID(),
    resourceType,
    resourceId,
    ownerEmail: requestedOwnerEmail,
    ownerRole: target?.role || null,
    ownerName: target ? ("displayName" in target ? target.displayName || target.email : target.email) : null,
    previousOwnerEmail: previous?.ownerEmail || null,
    assignedAt: now,
    assignedBy: session.email,
    action: requestedOwnerEmail ? "ASSIGNED" : "UNASSIGNED",
  };
  const settings: AssignmentSettings = {
    version: 1,
    events: [event, ...current.settings.events].slice(0, 2000),
    updatedAt: now,
  };
  const save = await supabase.from("brand_settings").upsert({ brand_id: ASSIGNMENT_SETTINGS_KEY, settings, updated_at: now }, { onConflict: "brand_id" });
  if (save.error) return NextResponse.json({ error: save.error.message }, { status: 500 });

  let mirrorWarning: string | null = null;
  if (resourceType === "CONTACT") {
    mirrorWarning = await appendContactTimeline(supabase, resource, event);
  } else {
    const mirror = await supabase.from("work_items").update({ assigned_agent: requestedOwnerEmail, updated_at: now }).eq("id", resourceId);
    mirrorWarning = mirror.error?.message || null;
  }
  return NextResponse.json({ ok: true, assignment: event, mirrorWarning });
}
