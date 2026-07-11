import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminEmails, verifyAdminSession } from "@/lib/admin-auth";
import { hasPermission, type AccessRole } from "@/lib/access-control";
import { loadAccessSettings } from "@/lib/access-control-server";
import { buildTeamWorkload } from "@/lib/revenue/team-workload";
import {
  buildInternalAlertCenter,
  type InternalAlert,
  type InternalAlertAcknowledgement,
} from "@/lib/revenue/internal-alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALERT_SETTINGS_KEY = "internal-alerts:acknowledgements";
const ASSIGNMENT_SETTINGS_KEY = "team-workload:assignments";
const OPEN_TASK_STATUSES = ["TO_DO", "TODO", "OPEN", "IN_PROGRESS", "REVIEW", "PENDING"];
const ALERT_ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,300}$/;
const FINGERPRINT_PATTERN = /^[a-z0-9]{1,24}$/;

interface AssignmentEvent {
  resourceType: "CONTACT" | "TASK";
  resourceId: string;
  ownerEmail: string | null;
  ownerRole: AccessRole | null;
  ownerName: string | null;
  previousOwnerEmail: string | null;
  assignedAt: string;
  assignedBy: string;
  action: "ASSIGNED" | "UNASSIGNED";
  id: string;
}

interface AlertSettings {
  version: 1;
  events: InternalAlertAcknowledgement[];
  updatedAt: string | null;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

function normalizeEmail(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function safeIso(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function canAcknowledgeRole(role: AccessRole) {
  return role !== "VIEWER";
}

function parseAssignmentSettings(value: unknown) {
  if (!value || typeof value !== "object") return [] as AssignmentEvent[];
  const row = value as Record<string, unknown>;
  return (Array.isArray(row.events) ? row.events : [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item): AssignmentEvent | null => {
      const resourceType = String(item.resourceType || item.resource_type || "").toUpperCase();
      const resourceId = String(item.resourceId || item.resource_id || "").trim();
      const assignedAt = safeIso(item.assignedAt || item.assigned_at);
      const assignedBy = normalizeEmail(item.assignedBy || item.assigned_by);
      const action = String(item.action || "").toUpperCase();
      if (!["CONTACT", "TASK"].includes(resourceType) || !resourceId || !assignedAt || !assignedBy || !["ASSIGNED", "UNASSIGNED"].includes(action)) return null;
      return {
        id: String(item.id || `${resourceType}:${resourceId}:${assignedAt}`),
        resourceType: resourceType as AssignmentEvent["resourceType"],
        resourceId,
        ownerEmail: normalizeEmail(item.ownerEmail || item.owner_email) || null,
        ownerRole: (String(item.ownerRole || item.owner_role || "").toUpperCase() || null) as AccessRole | null,
        ownerName: String(item.ownerName || item.owner_name || "").trim() || null,
        previousOwnerEmail: normalizeEmail(item.previousOwnerEmail || item.previous_owner_email) || null,
        assignedAt,
        assignedBy,
        action: action as AssignmentEvent["action"],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.assignedAt.localeCompare(a!.assignedAt)) as AssignmentEvent[];
}

function parseAlertSettings(value: unknown): AlertSettings {
  if (!value || typeof value !== "object") return { version: 1, events: [], updatedAt: null };
  const row = value as Record<string, unknown>;
  const events = (Array.isArray(row.events) ? row.events : [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item): InternalAlertAcknowledgement | null => {
      const alertId = String(item.alertId || item.alert_id || "").trim();
      const fingerprint = String(item.fingerprint || "").trim().toLowerCase();
      const action = String(item.action || "").trim().toUpperCase();
      const at = safeIso(item.at || item.created_at);
      const actorEmail = normalizeEmail(item.actorEmail || item.actor_email);
      const note = String(item.note || "").trim().slice(0, 500) || null;
      if (!ALERT_ID_PATTERN.test(alertId) || !FINGERPRINT_PATTERN.test(fingerprint) || !["ACKNOWLEDGED", "REOPENED"].includes(action) || !at || !actorEmail) return null;
      return {
        id: String(item.id || `${alertId}:${at}:${action}`),
        alertId,
        fingerprint,
        action: action as InternalAlertAcknowledgement["action"],
        at,
        actorEmail,
        note,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.at.localeCompare(a!.at)) as InternalAlertAcknowledgement[];
  return {
    version: 1,
    events: events.slice(0, 2500),
    updatedAt: safeIso(row.updatedAt || row.updated_at),
  };
}

async function loadSettingsRow(supabase: any, key: string) {
  const result = await supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", key).maybeSingle();
  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data, error: null as string | null };
}

function latestAssignments(events: AssignmentEvent[]) {
  const map = new Map<string, AssignmentEvent>();
  for (const event of events) {
    const key = `${event.resourceType}:${event.resourceId}`;
    if (!map.has(key)) map.set(key, event);
  }
  return map;
}

function overlayAssignments(contacts: any[], workItems: any[], events: AssignmentEvent[]) {
  const map = latestAssignments(events);
  return {
    contacts: contacts.map((contact) => {
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
      const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
      return interactions.some((item: any) => item?.id === assignment.id) ? contact : { ...contact, interactions: [...interactions, interaction] };
    }),
    workItems: workItems.map((item) => {
      const assignment = map.get(`TASK:${item.id}`);
      return assignment ? { ...item, assigned_agent: assignment.action === "ASSIGNED" ? assignment.ownerEmail : null } : item;
    }),
  };
}

function canReadAlert(role: AccessRole, alert: InternalAlert) {
  if (role === "OWNER") return true;
  if (alert.category === "FINANCE") return hasPermission(role, "finance.read");
  if (alert.category === "CLOSING") return hasPermission(role, "closing.read");
  if (alert.category === "KEYHOLDING") return hasPermission(role, "keyholding.read");
  if (alert.category === "EXECUTION") return hasPermission(role, "execution.read");
  return hasPermission(role, "revenue.read");
}

function filterCenterForRole(center: ReturnType<typeof buildInternalAlertCenter>, role: AccessRole) {
  const alerts = center.alerts.filter((alert) => canReadAlert(role, alert));
  const active = alerts.filter((alert) => !alert.acknowledged);
  const acknowledged = alerts.filter((alert) => alert.acknowledged);
  const categories = ["TEAM", "CLOSING", "FINANCE", "KEYHOLDING", "EXECUTION"] as const;
  const generatedAt = new Date(center.generatedAt).getTime();
  return {
    ...center,
    alerts,
    active,
    acknowledged,
    summary: {
      total: alerts.length,
      active: active.length,
      acknowledged: acknowledged.length,
      critical: active.filter((alert) => alert.severity === "CRITICAL").length,
      high: active.filter((alert) => alert.severity === "HIGH").length,
      immediate: active.filter((alert) => alert.escalation === "IMMEDIATE").length,
      unassigned: active.filter((alert) => alert.ruleId === "UNASSIGNED_PRIORITY_WORK").length,
      overdue: active.filter((alert) => Boolean(alert.dueAt && new Date(alert.dueAt).getTime() < generatedAt)).length,
      byCategory: Object.fromEntries(categories.map((category) => [category, active.filter((alert) => alert.category === category).length])),
    },
  };
}

async function buildFreshCenter(request: NextRequest, supabase: any) {
  const tokenSession = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!tokenSession?.email || !tokenSession.role) return { error: "Unauthorized", status: 401, center: null, session: null, settings: null };
  const [contactsResult, workResult, accessResult, assignmentRow, alertRow] = await Promise.all([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(3000),
    supabase.from("work_items").select("*").in("status", OPEN_TASK_STATUSES).order("due_date", { ascending: true, nullsFirst: false }).limit(2000),
    loadAccessSettings(),
    loadSettingsRow(supabase, ASSIGNMENT_SETTINGS_KEY),
    loadSettingsRow(supabase, ALERT_SETTINGS_KEY),
  ]);
  if (contactsResult.error) return { error: contactsResult.error.message, status: 500, center: null, session: tokenSession, settings: null };
  if (accessResult.error && tokenSession.role !== "OWNER") return { error: `Access profile unavailable: ${accessResult.error}`, status: 503, center: null, session: null, settings: null };

  let effectiveRole = tokenSession.role;
  if (tokenSession.role !== "OWNER") {
    const profile = accessResult.settings.profiles.find((item) => item.email === tokenSession.email && item.active);
    if (!profile) return { error: "Access profile is inactive or missing", status: 401, center: null, session: null, settings: null };
    effectiveRole = profile.role;
  }
  const session = { email: tokenSession.email, role: effectiveRole };

  const warnings: string[] = [];
  let workItems: any[] = [];
  if (workResult.error) {
    if (!optionalTableError(workResult.error.message || "")) warnings.push(`work_items: ${workResult.error.message}`);
    else warnings.push("work_items-tabellen er ikke tilgjengelig; kundevarsler vises fortsatt.");
  } else workItems = workResult.data || [];
  if (assignmentRow.error) warnings.push(`team assignments: ${assignmentRow.error}`);
  if (alertRow.error) warnings.push(`alert acknowledgements: ${alertRow.error}`);

  const assignments = parseAssignmentSettings(assignmentRow.data?.settings);
  const alertSettings = parseAlertSettings(alertRow.data?.settings);
  alertSettings.updatedAt = alertSettings.updatedAt || safeIso(alertRow.data?.updated_at);
  const overlay = overlayAssignments(contactsResult.data || [], workItems, assignments);
  const team = buildTeamWorkload({
    contacts: overlay.contacts,
    workItems: overlay.workItems,
    ownerEmails: getAdminEmails(),
    profiles: accessResult.settings.profiles,
    warnings: [],
  });
  const center = buildInternalAlertCenter({
    contacts: overlay.contacts,
    team,
    acknowledgements: alertSettings.events,
    warnings: [...warnings, ...team.warnings],
  });
  return { error: null, status: 200, center: filterCenterForRole(center, session.role), session, settings: alertSettings };
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", center: null }, { status: 500 });
  const result = await buildFreshCenter(request, supabase);
  if (result.error || !result.center || !result.session) return NextResponse.json({ error: result.error || "Alerts unavailable", center: null }, { status: result.status });
  return NextResponse.json({
    center: result.center,
    user: { email: result.session.email, role: result.session.role },
    canAcknowledge: canAcknowledgeRole(result.session.role),
    acknowledgementHistoryCount: result.settings?.events.length || 0,
  });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim().toUpperCase();
  const alertId = String(body.alertId || "").trim();
  const requestedFingerprint = String(body.fingerprint || "").trim().toLowerCase();
  const note = String(body.note || "").trim();
  if (!["ACKNOWLEDGE", "REOPEN"].includes(action)) return NextResponse.json({ error: "Invalid alert action" }, { status: 400 });
  if (!ALERT_ID_PATTERN.test(alertId) || !FINGERPRINT_PATTERN.test(requestedFingerprint)) return NextResponse.json({ error: "Valid alertId and fingerprint are required" }, { status: 400 });
  if (note.length > 500) return NextResponse.json({ error: "Merknaden kan maksimalt være 500 tegn." }, { status: 400 });

  const fresh = await buildFreshCenter(request, supabase);
  if (fresh.error || !fresh.center || !fresh.session || !fresh.settings) return NextResponse.json({ error: fresh.error || "Alerts unavailable" }, { status: fresh.status });
  if (!canAcknowledgeRole(fresh.session.role)) return NextResponse.json({ error: "Read-only users cannot acknowledge alerts" }, { status: 403 });
  const alert = fresh.center.alerts.find((item) => item.id === alertId);
  if (!alert) return NextResponse.json({ error: "Current alert not found or not visible for this role" }, { status: 404 });
  if (alert.fingerprint !== requestedFingerprint) return NextResponse.json({ error: "Alert condition changed. Refresh before acknowledging." }, { status: 409 });
  if (action === "ACKNOWLEDGE" && alert.acknowledged) return NextResponse.json({ ok: true, unchanged: true, alert });
  if (action === "REOPEN" && !alert.acknowledged) return NextResponse.json({ ok: true, unchanged: true, alert });

  const at = new Date().toISOString();
  const event: InternalAlertAcknowledgement = {
    id: crypto.randomUUID(),
    alertId,
    fingerprint: alert.fingerprint,
    action: action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "REOPENED",
    at,
    actorEmail: fresh.session.email,
    note: note || null,
  };
  const settings: AlertSettings = {
    version: 1,
    events: [event, ...fresh.settings.events].slice(0, 2500),
    updatedAt: at,
  };
  const save = await supabase.from("brand_settings").upsert({ brand_id: ALERT_SETTINGS_KEY, settings, updated_at: at }, { onConflict: "brand_id" });
  if (save.error) return NextResponse.json({ error: save.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event });
}
