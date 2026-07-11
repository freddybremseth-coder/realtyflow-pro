import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildAuditTrail, type AuditCategory, type AuditTrailEvent } from "@/lib/access-control";
import { loadAccessSettings } from "@/lib/access-control-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEAM_ASSIGNMENTS_KEY = "team-workload:assignments";
const ALERT_ACKNOWLEDGEMENTS_KEY = "internal-alerts:acknowledgements";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function teamAuditEvents(value: unknown): AuditTrailEvent[] {
  if (!value || typeof value !== "object") return [];
  const settings = value as Record<string, unknown>;
  const rows = Array.isArray(settings.events) ? settings.events : [];
  return rows.flatMap((item): AuditTrailEvent[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const at = String(row.assignedAt || row.assigned_at || "").trim();
    const actor = String(row.assignedBy || row.assigned_by || "").trim();
    const resourceType = String(row.resourceType || row.resource_type || "").trim().toLowerCase();
    const resourceId = String(row.resourceId || row.resource_id || "").trim();
    const action = String(row.action || "").toUpperCase();
    const ownerEmail = String(row.ownerEmail || row.owner_email || "").trim() || null;
    const previousOwnerEmail = String(row.previousOwnerEmail || row.previous_owner_email || "").trim() || null;
    if (!id || !at || !resourceId || !["contact", "task"].includes(resourceType) || !["ASSIGNED", "UNASSIGNED"].includes(action)) return [];
    return [{
      id,
      at,
      actor: actor || "Ukjent / eldre hendelse",
      action: action === "ASSIGNED" ? "team_owner_assigned" : "team_owner_unassigned",
      category: "EXECUTION",
      resourceType,
      resourceId,
      resourceName: resourceType === "contact" ? "Kundeansvar" : "Oppgaveansvar",
      source: "team-workload",
      field: "owner_email",
      before: previousOwnerEmail,
      after: ownerEmail,
      details: {
        owner_role: row.ownerRole || row.owner_role || null,
        owner_name: row.ownerName || row.owner_name || null,
        no_customer_contact: true,
      },
      actorKnown: Boolean(actor),
    }];
  });
}

function alertCategory(alertId: string): AuditCategory {
  if (alertId.startsWith("finance-alert:")) return "FINANCE";
  if (alertId.startsWith("closing-risk:")) return "CLOSING";
  if (alertId.startsWith("keyholding-alert:")) return "KEYHOLDING";
  if (alertId.startsWith("execution-overdue:") || alertId.startsWith("team-")) return "EXECUTION";
  return "SYSTEM";
}

function alertAuditEvents(value: unknown): AuditTrailEvent[] {
  if (!value || typeof value !== "object") return [];
  const settings = value as Record<string, unknown>;
  const rows = Array.isArray(settings.events) ? settings.events : [];
  return rows.flatMap((item): AuditTrailEvent[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const at = String(row.at || row.created_at || "").trim();
    const actor = String(row.actorEmail || row.actor_email || "").trim();
    const alertId = String(row.alertId || row.alert_id || "").trim();
    const fingerprint = String(row.fingerprint || "").trim();
    const action = String(row.action || "").toUpperCase();
    const note = String(row.note || "").trim() || null;
    if (!id || !at || !actor || !alertId || !fingerprint || !["ACKNOWLEDGED", "REOPENED"].includes(action)) return [];
    return [{
      id,
      at,
      actor,
      action: action === "ACKNOWLEDGED" ? "internal_alert_acknowledged" : "internal_alert_reopened",
      category: alertCategory(alertId),
      resourceType: "internal-alert",
      resourceId: alertId,
      resourceName: "Internt varsel",
      source: "internal-alerts",
      field: "acknowledgement",
      before: action === "ACKNOWLEDGED" ? "ACTIVE" : "ACKNOWLEDGED",
      after: action === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "ACTIVE",
      details: { fingerprint, note, no_customer_contact: true },
      actorKnown: true,
    }];
  });
}

function mergeTrail(base: ReturnType<typeof buildAuditTrail>, extra: AuditTrailEvent[], limit: number) {
  const deduped = new Map<string, AuditTrailEvent>();
  [...base.events, ...extra].forEach((event) => deduped.set(event.id, event));
  const all = [...deduped.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const unknownActor = all.filter((event) => !event.actorKnown).length;
  const warnings = [...base.warnings];
  const teamCount = extra.filter((event) => event.source === "team-workload").length;
  const alertCount = extra.filter((event) => event.source === "internal-alerts").length;
  if (teamCount && !warnings.some((warning) => warning.includes("teamtildeling"))) warnings.push(`${teamCount} teamtildelingshendelser er inkludert fra sentral ansvarshistorikk.`);
  if (alertCount && !warnings.some((warning) => warning.includes("varselkvittering"))) warnings.push(`${alertCount} varselkvitteringer er inkludert fra Internal Alerts.`);
  return {
    ...base,
    generatedAt: new Date().toISOString(),
    events: all,
    warnings,
    summary: {
      total: all.length,
      last7Days: all.filter((event) => new Date(event.at).getTime() >= sevenDaysAgo).length,
      accessChanges: all.filter((event) => event.category === "ACCESS").length,
      customerEvents: all.filter((event) => event.resourceType === "contact").length,
      unknownActor,
      actorCoveragePercent: all.length ? Math.round(((all.length - unknownActor) / all.length) * 100) : 100,
    },
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { trail: null });
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", trail: null }, { status: 500 });

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 500);
  const limit = Number.isFinite(requestedLimit) ? Math.max(50, Math.min(2000, Math.floor(requestedLimit))) : 500;
  const [contactsResult, accessResult, teamResult, alertResult] = await Promise.allSettled([
    supabase.from("contacts").select("id,name,email,interactions,updated_at").order("updated_at", { ascending: false }).limit(2500),
    loadAccessSettings(),
    supabase.from("brand_settings").select("settings").eq("brand_id", TEAM_ASSIGNMENTS_KEY).maybeSingle(),
    supabase.from("brand_settings").select("settings").eq("brand_id", ALERT_ACKNOWLEDGEMENTS_KEY).maybeSingle(),
  ]);

  if (contactsResult.status === "rejected" || contactsResult.value?.error) {
    const message = contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error ? contactsResult.reason.message : "Kunne ikke hente kundehistorikk"
      : contactsResult.value?.error?.message || "Kunne ikke hente kundehistorikk";
    return NextResponse.json({ error: message, trail: null }, { status: 500 });
  }

  const warnings: string[] = [];
  let accessAudit: any[] = [];
  if (accessResult.status === "rejected") warnings.push(`Tilgangsaudit kunne ikke hentes: ${accessResult.reason instanceof Error ? accessResult.reason.message : "ukjent feil"}`);
  else if (accessResult.value.error) warnings.push(`Tilgangsaudit kunne ikke hentes: ${accessResult.value.error}`);
  else accessAudit = accessResult.value.settings.audit;

  let teamEvents: AuditTrailEvent[] = [];
  if (teamResult.status === "rejected") warnings.push(`Team-audit kunne ikke hentes: ${teamResult.reason instanceof Error ? teamResult.reason.message : "ukjent feil"}`);
  else if (teamResult.value.error) warnings.push(`Team-audit kunne ikke hentes: ${teamResult.value.error.message}`);
  else teamEvents = teamAuditEvents(teamResult.value.data?.settings);

  let alertEvents: AuditTrailEvent[] = [];
  if (alertResult.status === "rejected") warnings.push(`Varselaudit kunne ikke hentes: ${alertResult.reason instanceof Error ? alertResult.reason.message : "ukjent feil"}`);
  else if (alertResult.value.error) warnings.push(`Varselaudit kunne ikke hentes: ${alertResult.value.error.message}`);
  else alertEvents = alertAuditEvents(alertResult.value.data?.settings);

  const baseTrail = buildAuditTrail({
    contacts: contactsResult.value?.data || [],
    accessAudit,
    warnings,
    limit: 2000,
  });
  const trail = mergeTrail(baseTrail, [...teamEvents, ...alertEvents], limit);
  return NextResponse.json({
    trail,
    coverage: {
      contactInteractions: true,
      accessChanges: accessResult.status === "fulfilled" && !accessResult.value.error,
      teamAssignments: teamResult.status === "fulfilled" && !teamResult.value.error,
      alertAcknowledgements: alertResult.status === "fulfilled" && !alertResult.value.error,
      legacyActorMayBeMissing: true,
      workItemActorCoverage: false,
      calendarActorCoverage: false,
    },
  });
}
