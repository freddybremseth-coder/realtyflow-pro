import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { requireAdminApi } from "@/lib/api-admin";
import { getAdminEmails, verifyAdminSession } from "@/lib/admin-auth";
import { hasPermission, type AccessRole } from "@/lib/access-control";
import { loadAccessSettings } from "@/lib/access-control-server";
import { buildRevenueCommandCenter } from "@/lib/revenue/command";
import {
  buildRevenueGoalScorecard,
  emptyRevenueGoalConfig,
  revenueGoalStorageKey,
  type RevenueGoalConfig,
  type RevenueGoalScope,
} from "@/lib/revenue/goals";
import { buildExecutionWorkspace } from "@/lib/revenue/execution";
import { buildTeamWorkload } from "@/lib/revenue/team-workload";
import { buildInternalAlertCenter, type InternalAlertAcknowledgement } from "@/lib/revenue/internal-alerts";
import { buildExecutiveBriefing, type BriefingCalendarEvent } from "@/lib/revenue/executive-briefing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ASSIGNMENT_SETTINGS_KEY = "team-workload:assignments";
const ALERT_SETTINGS_KEY = "internal-alerts:acknowledgements";
const OPEN_TASK_STATUSES = ["TO_DO", "TODO", "OPEN", "IN_PROGRESS", "REVIEW", "PENDING"];

interface AssignmentEvent {
  id: string;
  resourceType: "CONTACT" | "TASK";
  resourceId: string;
  ownerEmail: string | null;
  ownerRole: AccessRole | null;
  ownerName: string | null;
  assignedAt: string;
  assignedBy: string;
  action: "ASSIGNED" | "UNASSIGNED";
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

function safeIso(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function email(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function currentMonth(now: Date) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function goalScope(role: AccessRole): RevenueGoalScope {
  return role === "KEYHOLDING" ? "keyholding" : "all";
}

function goalConfig(row: any, scope: RevenueGoalScope, month: string): RevenueGoalConfig {
  const empty = emptyRevenueGoalConfig(scope, month);
  const settings = row?.settings && typeof row.settings === "object" ? row.settings : {};
  const targets = settings.targets && typeof settings.targets === "object" ? settings.targets : settings;
  return {
    ...empty,
    commissionTargetEur: numberOrNull(targets.commissionTargetEur),
    closedDealsTarget: numberOrNull(targets.closedDealsTarget),
    keyholdingMrrTargetEur: numberOrNull(targets.keyholdingMrrTargetEur),
    keyholdingContractsTarget: numberOrNull(targets.keyholdingContractsTarget),
    recoveredLeadsTarget: numberOrNull(targets.recoveredLeadsTarget),
    notes: String(settings.notes || "").trim() || null,
    updatedAt: row?.updated_at || settings.updatedAt || null,
  };
}

function rows(result: PromiseSettledResult<any>, table: string, warnings: string[], optional = true) {
  if (result.status === "rejected") {
    warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return [];
  }
  if (result.value?.error) {
    if (!optional || !optionalTableError(result.value.error.message || "")) warnings.push(`${table}: ${result.value.error.message}`);
    return [];
  }
  return result.value?.data || [];
}

function single(result: PromiseSettledResult<any>, table: string, warnings: string[]) {
  if (result.status === "rejected") {
    warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return null;
  }
  if (result.value?.error) {
    warnings.push(`${table}: ${result.value.error.message}`);
    return null;
  }
  return result.value?.data || null;
}

function parseAssignments(value: unknown): AssignmentEvent[] {
  if (!value || typeof value !== "object") return [];
  const settings = value as Record<string, unknown>;
  return (Array.isArray(settings.events) ? settings.events : [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item): AssignmentEvent | null => {
      const resourceType = String(item.resourceType || item.resource_type || "").toUpperCase();
      const resourceId = String(item.resourceId || item.resource_id || "").trim();
      const assignedAt = safeIso(item.assignedAt || item.assigned_at);
      const assignedBy = email(item.assignedBy || item.assigned_by);
      const action = String(item.action || "").toUpperCase();
      if (!["CONTACT", "TASK"].includes(resourceType) || !resourceId || !assignedAt || !assignedBy || !["ASSIGNED", "UNASSIGNED"].includes(action)) return null;
      return {
        id: String(item.id || `${resourceType}:${resourceId}:${assignedAt}`),
        resourceType: resourceType as AssignmentEvent["resourceType"],
        resourceId,
        ownerEmail: email(item.ownerEmail || item.owner_email) || null,
        ownerRole: (String(item.ownerRole || item.owner_role || "").toUpperCase() || null) as AccessRole | null,
        ownerName: String(item.ownerName || item.owner_name || "").trim() || null,
        assignedAt,
        assignedBy,
        action: action as AssignmentEvent["action"],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.assignedAt.localeCompare(a!.assignedAt)) as AssignmentEvent[];
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
  const assignments = latestAssignments(events);
  const contactRows = contacts.map((contact) => {
    const assignment = assignments.get(`CONTACT:${contact.id}`);
    if (!assignment) return contact;
    const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
    if (interactions.some((item: any) => item?.id === assignment.id)) return contact;
    return {
      ...contact,
      interactions: [...interactions, {
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
          performed_by: assignment.assignedBy,
          no_customer_contact: true,
        },
      }],
    };
  });
  const taskRows = workItems.map((item) => {
    const assignment = assignments.get(`TASK:${item.id}`);
    if (!assignment) return item;
    return { ...item, assigned_agent: assignment.action === "ASSIGNED" ? assignment.ownerEmail : null };
  });
  return { contacts: contactRows, workItems: taskRows };
}

function parseAcknowledgements(value: unknown): InternalAlertAcknowledgement[] {
  if (!value || typeof value !== "object") return [];
  const settings = value as Record<string, unknown>;
  return (Array.isArray(settings.events) ? settings.events : [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item): InternalAlertAcknowledgement | null => {
      const alertId = String(item.alertId || item.alert_id || "").trim();
      const fingerprint = String(item.fingerprint || "").trim().toLowerCase();
      const action = String(item.action || "").trim().toUpperCase();
      const at = safeIso(item.at || item.created_at);
      const actorEmail = email(item.actorEmail || item.actor_email);
      if (!alertId || !fingerprint || !["ACKNOWLEDGED", "REOPENED"].includes(action) || !at || !actorEmail) return null;
      return {
        id: String(item.id || `${alertId}:${at}:${action}`),
        alertId,
        fingerprint,
        action: action as InternalAlertAcknowledgement["action"],
        at,
        actorEmail,
        note: String(item.note || "").trim().slice(0, 500) || null,
      };
    })
    .filter(Boolean) as InternalAlertAcknowledgement[];
}

async function calendarEvents(role: AccessRole, now: Date) {
  if (role !== "OWNER" && !hasPermission(role, "execution.read")) {
    return { configured: false, events: [] as BriefingCalendarEvent[], warning: null as string | null };
  }
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return { configured: false, events: [] as BriefingCalendarEvent[], warning: "Google Calendar er ikke konfigurert. Resten av briefingen er fortsatt tilgjengelig." };
  }
  try {
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oauth });
    const calendarList = await calendar.calendarList.list();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 86_400_000);
    const events: BriefingCalendarEvent[] = [];
    for (const item of (calendarList.data.items || []).filter((row) => row.id && row.accessRole !== "freeBusyReader").slice(0, 20)) {
      try {
        const response = await calendar.events.list({
          calendarId: item.id!,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 50,
        });
        for (const event of response.data.items || []) {
          const eventStart = event.start?.dateTime || event.start?.date || "";
          if (!event.id || !eventStart || event.status === "cancelled") continue;
          events.push({
            id: `${item.id}:${event.id}`,
            title: event.summary || "(Uten tittel)",
            start: eventStart,
            end: event.end?.dateTime || event.end?.date || null,
            allDay: !event.start?.dateTime,
            location: event.location || null,
            href: event.htmlLink || null,
          });
        }
      } catch {
        // A single inaccessible calendar must not block the daily briefing.
      }
    }
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return { configured: true, events, warning: null as string | null };
  } catch (error) {
    return {
      configured: false,
      events: [] as BriefingCalendarEvent[],
      warning: `Google Calendar kunne ikke leses: ${error instanceof Error ? error.message : "ukjent feil"}. Resten av briefingen er fortsatt tilgjengelig.`,
    };
  }
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { briefing: null });
  if (denied) return denied;
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session?.email || !session.role) return NextResponse.json({ error: "Unauthorized", briefing: null }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", briefing: null }, { status: 500 });
  const now = new Date();
  const scope = goalScope(session.role);
  const month = currentMonth(now);
  const goalKey = revenueGoalStorageKey(scope, `${month}-01`);

  const results = await Promise.allSettled([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(3000),
    supabase.from("work_items").select("*").in("status", OPEN_TASK_STATUSES).order("due_date", { ascending: true, nullsFirst: false }).limit(2000),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,purchase_readiness,budget_amount,budget_currency,summary,created_at,updated_at").limit(500),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").limit(500),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,created_at,updated_at").limit(500),
    supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,language,created_at,updated_at").limit(500),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", goalKey).maybeSingle(),
    supabase.from("brand_settings").select("settings").eq("brand_id", ASSIGNMENT_SETTINGS_KEY).maybeSingle(),
    supabase.from("brand_settings").select("settings").eq("brand_id", ALERT_SETTINGS_KEY).maybeSingle(),
    loadAccessSettings(),
    calendarEvents(session.role, now),
  ]);

  if (results[0].status === "rejected" || results[0].value?.error) {
    const message = results[0].status === "rejected"
      ? results[0].reason instanceof Error ? results[0].reason.message : "Kunne ikke hente CRM-data"
      : results[0].value?.error?.message || "Kunne ikke hente CRM-data";
    return NextResponse.json({ error: message, briefing: null }, { status: 500 });
  }

  const warnings: string[] = [];
  const contacts = results[0].value?.data || [];
  const workItems = rows(results[1], "work_items", warnings);
  const profiles = rows(results[2], "buyer_profiles", warnings);
  const shortlists = rows(results[3], "lead_property_shortlists", warnings);
  const presentations = rows(results[4], "lead_customer_presentations", warnings);
  const messageDrafts = rows(results[5], "lead_customer_message_drafts", warnings);
  const goalRow = single(results[6], "revenue goals", warnings);
  const assignmentRow = single(results[7], "team assignments", warnings);
  const acknowledgementRow = single(results[8], "alert acknowledgements", warnings);
  const access = results[9].status === "fulfilled" ? results[9].value : null;
  if (!access || access.error) warnings.push(`access-control: ${access?.error || "kunne ikke leses"}`);
  const calendar = results[10].status === "fulfilled"
    ? results[10].value
    : { configured: false, events: [] as BriefingCalendarEvent[], warning: "Google Calendar kunne ikke leses." };

  const overlay = overlayAssignments(contacts, workItems, parseAssignments(assignmentRow?.settings));
  const accessProfiles = access?.settings.profiles || [];
  const team = buildTeamWorkload({
    contacts: overlay.contacts,
    workItems: overlay.workItems,
    ownerEmails: getAdminEmails(),
    profiles: accessProfiles,
    warnings: [],
    now,
  });
  const alerts = buildInternalAlertCenter({
    contacts: overlay.contacts,
    team,
    acknowledgements: parseAcknowledgements(acknowledgementRow?.settings),
    warnings: [],
    now,
  });
  const command = buildRevenueCommandCenter({ contacts: overlay.contacts, profiles, shortlists, presentations, messageDrafts, warnings: [] }, now);
  const goals = buildRevenueGoalScorecard({
    contacts: overlay.contacts,
    config: goalConfig(goalRow, scope, month),
    profiles,
    shortlists,
    presentations,
    messageDrafts,
    warnings: [],
  }, now);
  const execution = buildExecutionWorkspace({ contacts: overlay.contacts, workItems: overlay.workItems, warnings: [], now });
  const briefing = buildExecutiveBriefing({
    role: session.role,
    userEmail: session.email,
    command,
    goals,
    alerts,
    execution,
    team,
    calendarEvents: calendar.events,
    calendarConfigured: calendar.configured,
    calendarWarning: calendar.warning,
    warnings,
    now,
  });

  return NextResponse.json({ briefing });
}
