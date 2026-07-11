import type { AccessProfile, AccessRole } from "@/lib/access-control";

export const TEAM_REVENUE_BRANDS = ["zeneco", "soleada", "pinosoecolife", "keyholding"] as const;
export type TeamRevenueBrand = (typeof TEAM_REVENUE_BRANDS)[number];
export type TeamResourceType = "CONTACT" | "TASK";

export interface TeamMember {
  email: string;
  displayName: string;
  role: AccessRole;
  active: boolean;
  isOwner: boolean;
}

export interface TeamWorkloadItem {
  id: string;
  resourceType: TeamResourceType;
  resourceId: string;
  contactId: string | null;
  title: string;
  detail: string;
  brandId: string;
  stage: string | null;
  dueDate: string | null;
  overdue: boolean;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerRole: AccessRole | null;
  recommendedRoles: AccessRole[];
  assignmentSource: "TIMELINE" | "WORK_ITEM" | "UNASSIGNED" | "LEGACY";
  href: string;
}

export interface TeamMemberWorkload extends TeamMember {
  contacts: number;
  tasks: number;
  overdue: number;
  critical: number;
  totalScore: number;
  load: "HIGH" | "BALANCED" | "LIGHT" | "EMPTY";
}

export interface TeamWorkloadWorkspace {
  generatedAt: string;
  members: TeamMemberWorkload[];
  items: TeamWorkloadItem[];
  unassigned: TeamWorkloadItem[];
  summary: {
    members: number;
    assignedContacts: number;
    assignedTasks: number;
    unassignedContacts: number;
    unassignedTasks: number;
    overdue: number;
    critical: number;
  };
  warnings: string[];
}

const OPEN_TASK_STATUSES = new Set(["TO_DO", "TODO", "OPEN", "IN_PROGRESS", "REVIEW", "PENDING"]);

function text(value: unknown) {
  return String(value || "").trim();
}

function email(value: unknown) {
  const normalized = text(value).toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function date(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBrand(row: Record<string, unknown>) {
  const raw = text(row.brand_id || row.brand).toLowerCase();
  if (raw === "zen eco homes" || raw === "zenecohomes") return "zeneco";
  if (raw === "soleada.no") return "soleada";
  if (raw === "pinoso ecolife" || raw === "pinosoecolife.com") return "pinosoecolife";
  if (raw.includes("keyholding")) return "keyholding";
  return raw || "unknown";
}

function normalizeStage(value: unknown) {
  const stage = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (["VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CUSTOMER", "KUNDE", "VIP"].includes(stage)) return "WON";
  if (["TAPT", "CLOSED_LOST"].includes(stage)) return "LOST";
  if (["PA_VENT", "ONHOLD"].includes(stage)) return "ON_HOLD";
  return stage || "NEW";
}

function contactDueDate(row: Record<string, unknown>) {
  return text(row.next_followup || row.next_follow_up || row.follow_up_date) || null;
}

function latestOwnerEvent(contact: Record<string, unknown>) {
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const matches = interactions
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter((item) => {
      const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {};
      const action = text(item.action || metadata.action).toLowerCase();
      return action === "team_owner_assigned" || action === "team_owner_unassigned";
    })
    .sort((a, b) => {
      const aMeta = a.metadata && typeof a.metadata === "object" ? a.metadata as Record<string, unknown> : {};
      const bMeta = b.metadata && typeof b.metadata === "object" ? b.metadata as Record<string, unknown> : {};
      return (date(b.date || b.created_at || bMeta.at)?.getTime() || 0) - (date(a.date || a.created_at || aMeta.at)?.getTime() || 0);
    });
  const latest = matches[0];
  if (!latest) return { ownerEmail: null as string | null, source: "UNASSIGNED" as const };
  const metadata = latest.metadata && typeof latest.metadata === "object" ? latest.metadata as Record<string, unknown> : {};
  const action = text(latest.action || metadata.action).toLowerCase();
  if (action === "team_owner_unassigned") return { ownerEmail: null as string | null, source: "TIMELINE" as const };
  return { ownerEmail: email(metadata.owner_email || metadata.assigned_to) || null, source: "TIMELINE" as const };
}

function recommendedRoles(stage: string, brandId: string, kind: TeamResourceType, title = ""): AccessRole[] {
  const combined = `${stage} ${brandId} ${title}`.toLowerCase();
  if (brandId === "keyholding" || /keyholding|inspection|property care|tilsyn/.test(combined)) return ["KEYHOLDING", "OWNER"];
  if (/invoice|commission|payment|faktura|provisjon|betaling/.test(combined)) return ["FINANCE", "OWNER"];
  if (["NEGOTIATION", "WON"].includes(stage) || /closing|notary|document|reservation|overtak/.test(combined)) return ["CLOSING", "OWNER"];
  if (kind === "TASK" && /campaign|marketing|source|utm|content/.test(combined)) return ["MARKETING", "OWNER"];
  return ["SALES", "OWNER"];
}

function priority(score: number): TeamWorkloadItem["priority"] {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function contactScore(row: Record<string, unknown>, stage: string, overdue: boolean) {
  const stageScore: Record<string, number> = { NEGOTIATION: 75, VIEWING: 60, QUALIFIED: 50, CONTACT: 35, NEW: 25, WON: 45, ON_HOLD: 30, LOST: 15 };
  const value = number(row.pipeline_value || row.sale_price || row.property_value || row.budget_max);
  return Math.min(100, (stageScore[stage] || 20) + (overdue ? 25 : 0) + (value >= 500_000 ? 10 : value >= 250_000 ? 5 : 0));
}

function taskScore(row: Record<string, unknown>, overdue: boolean) {
  const rawPriority = text(row.priority).toUpperCase();
  const base = rawPriority === "CRITICAL" ? 90 : rawPriority === "HIGH" ? 70 : rawPriority === "MEDIUM" ? 45 : 25;
  return Math.min(100, base + (overdue ? 20 : 0) + Math.min(10, Math.round(number(row.ai_score) / 10)));
}

function roster(ownerEmails: string[], profiles: AccessProfile[]): TeamMember[] {
  const owners = ownerEmails.map((ownerEmail) => ({
    email: ownerEmail.toLowerCase(),
    displayName: ownerEmail.split("@")[0],
    role: "OWNER" as AccessRole,
    active: true,
    isOwner: true,
  }));
  const members = profiles.filter((profile) => profile.active).map((profile) => ({
    email: profile.email.toLowerCase(),
    displayName: profile.displayName || profile.email.split("@")[0],
    role: profile.role,
    active: profile.active,
    isOwner: false,
  }));
  const unique = new Map<string, TeamMember>();
  [...owners, ...members].forEach((member) => unique.set(member.email, member));
  return [...unique.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function buildTeamWorkload(params: {
  contacts?: Array<Record<string, unknown>>;
  workItems?: Array<Record<string, unknown>>;
  ownerEmails?: string[];
  profiles?: AccessProfile[];
  now?: Date;
  warnings?: string[];
}): TeamWorkloadWorkspace {
  const now = params.now || new Date();
  const members = roster(params.ownerEmails || [], params.profiles || []);
  const memberMap = new Map(members.map((member) => [member.email, member]));
  const items: TeamWorkloadItem[] = [];

  for (const row of params.contacts || []) {
    const resourceId = text(row.id);
    if (!resourceId) continue;
    const brandId = normalizeBrand(row);
    if (brandId !== "unknown" && !TEAM_REVENUE_BRANDS.includes(brandId as TeamRevenueBrand)) continue;
    const stage = normalizeStage(row.pipeline_status || row.status || row.stage);
    const dueDate = contactDueDate(row);
    const due = date(dueDate);
    const overdue = Boolean(due && due.getTime() < now.getTime());
    const assignment = latestOwnerEvent(row);
    const owner = assignment.ownerEmail ? memberMap.get(assignment.ownerEmail) || null : null;
    const score = contactScore(row, stage, overdue);
    items.push({
      id: `contact:${resourceId}`,
      resourceType: "CONTACT",
      resourceId,
      contactId: resourceId,
      title: text(row.name || row.email || "Ukjent kunde"),
      detail: `${stage}${dueDate ? ` · oppfølging ${dueDate}` : " · ingen oppfølgingsdato"}`,
      brandId,
      stage,
      dueDate,
      overdue,
      priority: priority(score),
      score,
      ownerEmail: owner?.email || null,
      ownerName: owner?.displayName || null,
      ownerRole: owner?.role || null,
      recommendedRoles: recommendedRoles(stage, brandId, "CONTACT"),
      assignmentSource: assignment.ownerEmail && !owner ? "LEGACY" : assignment.source,
      href: `/customers/${resourceId}`,
    });
  }

  for (const row of params.workItems || []) {
    const resourceId = text(row.id);
    if (!resourceId || !OPEN_TASK_STATUSES.has(text(row.status).toUpperCase())) continue;
    const brandId = normalizeBrand(row);
    const dueDate = text(row.due_date) || null;
    const due = date(dueDate);
    const overdue = Boolean(due && due.getTime() < now.getTime());
    const assigned = email(row.assigned_agent || row.assigned_to || row.owner_email);
    const owner = assigned ? memberMap.get(assigned) || null : null;
    const stage = normalizeStage(row.pipeline_status || row.stage || "");
    const score = taskScore(row, overdue);
    const contactId = text(row.source_type).toLowerCase() === "crm" ? text(row.source_id) || null : text((row.metadata as Record<string, unknown> | undefined)?.contact_id) || null;
    items.push({
      id: `task:${resourceId}`,
      resourceType: "TASK",
      resourceId,
      contactId,
      title: text(row.title || "Oppgave"),
      detail: text(row.description || row.next_action || "Intern oppgave"),
      brandId,
      stage: stage || null,
      dueDate,
      overdue,
      priority: priority(score),
      score,
      ownerEmail: owner?.email || null,
      ownerName: owner?.displayName || null,
      ownerRole: owner?.role || null,
      recommendedRoles: recommendedRoles(stage, brandId, "TASK", text(row.title)),
      assignmentSource: assigned ? owner ? "WORK_ITEM" : "LEGACY" : "UNASSIGNED",
      href: contactId ? `/customers/${contactId}` : "/execution",
    });
  }

  items.sort((a, b) => b.score - a.score || Number(b.overdue) - Number(a.overdue) || a.title.localeCompare(b.title));
  const workloads: TeamMemberWorkload[] = members.map((member) => {
    const owned = items.filter((item) => item.ownerEmail === member.email);
    const totalScore = owned.reduce((sum, item) => sum + item.score, 0);
    const load: TeamMemberWorkload["load"] = owned.length === 0 ? "EMPTY" : totalScore >= 350 || owned.length >= 8 ? "HIGH" : totalScore >= 120 || owned.length >= 3 ? "BALANCED" : "LIGHT";
    return {
      ...member,
      contacts: owned.filter((item) => item.resourceType === "CONTACT").length,
      tasks: owned.filter((item) => item.resourceType === "TASK").length,
      overdue: owned.filter((item) => item.overdue).length,
      critical: owned.filter((item) => item.priority === "CRITICAL").length,
      totalScore,
      load,
    };
  }).sort((a, b) => b.totalScore - a.totalScore || a.displayName.localeCompare(b.displayName));
  const unassigned = items.filter((item) => !item.ownerEmail);
  const warnings = [...(params.warnings || [])];
  const legacy = items.filter((item) => item.assignmentSource === "LEGACY").length;
  if (legacy) warnings.push(`${legacy} eksisterende tildelinger matcher ikke en aktiv tilgangsprofil og behandles som ufordelte.`);
  if (!members.length) warnings.push("Ingen aktive teamprofiler er konfigurert.");

  return {
    generatedAt: now.toISOString(),
    members: workloads,
    items,
    unassigned,
    summary: {
      members: members.length,
      assignedContacts: items.filter((item) => item.resourceType === "CONTACT" && item.ownerEmail).length,
      assignedTasks: items.filter((item) => item.resourceType === "TASK" && item.ownerEmail).length,
      unassignedContacts: unassigned.filter((item) => item.resourceType === "CONTACT").length,
      unassignedTasks: unassigned.filter((item) => item.resourceType === "TASK").length,
      overdue: items.filter((item) => item.overdue).length,
      critical: items.filter((item) => item.priority === "CRITICAL").length,
    },
    warnings,
  };
}
