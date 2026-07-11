export const EXECUTION_BRANDS = ["zeneco", "soleada", "pinosoecolife", "keyholding"] as const;
export type ExecutionBrand = (typeof EXECUTION_BRANDS)[number];
export type ExecutionKind = "CONTACT_FOLLOWUP" | "VIEWING" | "CLOSING" | "AFTER_SALES" | "KEYHOLDING" | "WORK_ITEM";
export type ExecutionUrgency = "OVERDUE" | "TODAY" | "THIS_WEEK" | "LATER" | "UNSCHEDULED";
export type ExecutionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ExecutionInput {
  contacts: any[];
  workItems: any[];
  warnings?: string[];
  now?: Date;
}

export interface ExecutionItem {
  id: string;
  kind: ExecutionKind;
  sourceId: string;
  contactId: string | null;
  workItemId: string | null;
  brandId: ExecutionBrand | null;
  title: string;
  detail: string;
  dueDate: string | null;
  urgency: ExecutionUrgency;
  priority: ExecutionPriority;
  score: number;
  status: string;
  customerHref: string | null;
  workspaceHref: string;
  canCreateTask: boolean;
  canScheduleFollowup: boolean;
  canCompleteTask: boolean;
  calendar: {
    title: string;
    description: string;
    durationMinutes: number;
  };
}

export interface ExecutionWorkspace {
  generatedAt: string;
  summary: {
    total: number;
    overdue: number;
    today: number;
    thisWeek: number;
    unscheduled: number;
    critical: number;
    contacts: number;
    workItems: number;
  };
  days: Array<{ date: string; label: string; count: number; critical: number }>;
  items: ExecutionItem[];
  warnings: string[];
  safety: {
    automaticTaskCreation: false;
    automaticCalendarCreation: false;
    automaticCustomerContact: false;
    explicitConfirmationRequired: true;
  };
}

const ACTIVE_STATUSES = new Set(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "WON", "ON_HOLD"]);
const OPEN_WORK_STATUSES = new Set(["TO_DO", "IN_PROGRESS", "REVIEW"]);
const PRIORITY_WEIGHT: Record<ExecutionPriority, number> = { CRITICAL: 40, HIGH: 25, MEDIUM: 12, LOW: 4 };
const URGENCY_WEIGHT: Record<ExecutionUrgency, number> = { OVERDUE: 50, TODAY: 40, THIS_WEEK: 24, LATER: 8, UNSCHEDULED: 18 };

function clean(value: unknown) {
  return String(value || "").trim();
}

function token(value: unknown) {
  return clean(value)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeStatus(value: unknown) {
  const status = token(value);
  if (["VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CUSTOMER", "KUNDE", "VIP"].includes(status)) return "WON";
  if (["TAPT", "CLOSED_LOST"].includes(status)) return "LOST";
  if (["PA_VENT", "PAUSE", "PAUSED", "HOLD"].includes(status)) return "ON_HOLD";
  return status || "NEW";
}

function brand(value: unknown): ExecutionBrand | null {
  const normalized = token(value).replaceAll("_", "");
  if (normalized === "ZENECO" || normalized === "ZENECOHOMES") return "zeneco";
  if (normalized === "SOLEADA" || normalized === "SOLEADANO") return "soleada";
  if (normalized === "PINOSOECOLIFE" || normalized === "PINOSOECO") return "pinosoecolife";
  if (normalized === "KEYHOLDING" || normalized === "KEYHOLDINGCOSTABLANCA") return "keyholding";
  return null;
}

function validDate(value: unknown) {
  if (!value) return null;
  const raw = clean(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value: unknown) {
  const date = validDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function urgencyFor(dueDate: string | null, now: Date): ExecutionUrgency {
  if (!dueDate) return "UNSCHEDULED";
  const due = startOfDay(new Date(`${dueDate}T12:00:00.000Z`));
  const today = startOfDay(now);
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "OVERDUE";
  if (diff === 0) return "TODAY";
  if (diff <= 7) return "THIS_WEEK";
  return "LATER";
}

function contactKind(contact: any, status: string): ExecutionKind {
  const contactBrand = brand(contact.brand_id || contact.brand);
  const interactionText = Array.isArray(contact.interactions)
    ? contact.interactions.map((row: any) => `${row?.type || ""} ${row?.action || ""} ${row?.content || ""}`).join(" ").toLowerCase()
    : "";
  if (contactBrand === "keyholding" || /keyholding|nøkkelhold|nokkelhold/.test(interactionText)) return "KEYHOLDING";
  if (status === "NEGOTIATION") return "CLOSING";
  if (status === "VIEWING") return "VIEWING";
  if (status === "WON") return "AFTER_SALES";
  return "CONTACT_FOLLOWUP";
}

function workspaceHref(kind: ExecutionKind) {
  if (kind === "CLOSING") return "/closing";
  if (kind === "VIEWING" || kind === "CONTACT_FOLLOWUP") return "/today";
  if (kind === "AFTER_SALES") return "/after-sales";
  if (kind === "KEYHOLDING") return "/service-revenue";
  return "/marketing-tasks";
}

function priorityForContact(status: string, urgency: ExecutionUrgency, pipelineValue: number): ExecutionPriority {
  if (urgency === "OVERDUE" && ["VIEWING", "NEGOTIATION"].includes(status)) return "CRITICAL";
  if (urgency === "OVERDUE" || status === "NEGOTIATION") return "HIGH";
  if (status === "VIEWING" || pipelineValue >= 500_000) return "HIGH";
  if (["QUALIFIED", "WON"].includes(status)) return "MEDIUM";
  return "LOW";
}

function priorityFromWork(value: unknown): ExecutionPriority {
  const normalized = token(value) as ExecutionPriority;
  return ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(normalized) ? normalized : "MEDIUM";
}

function itemScore(priority: ExecutionPriority, urgency: ExecutionUrgency, extra = 0) {
  return PRIORITY_WEIGHT[priority] + URGENCY_WEIGHT[urgency] + extra;
}

function calendarDuration(kind: ExecutionKind) {
  if (kind === "CLOSING" || kind === "VIEWING") return 60;
  if (kind === "KEYHOLDING") return 45;
  return 30;
}

function contactTitle(kind: ExecutionKind, name: string) {
  if (kind === "CLOSING") return `Avklar closing med ${name}`;
  if (kind === "VIEWING") return `Følg opp visning med ${name}`;
  if (kind === "AFTER_SALES") return `Ettermarkedsoppfølging – ${name}`;
  if (kind === "KEYHOLDING") return `Keyholding-oppfølging – ${name}`;
  return `Følg opp ${name}`;
}

function dueFromContact(contact: any) {
  return dateOnly(contact.next_followup || contact.next_follow_up || contact.follow_up_date || contact.followup_date);
}

function openTaskContactId(workItem: any) {
  if (clean(workItem.source_type).toLowerCase() === "crm" && workItem.source_id) return clean(workItem.source_id);
  const metadata = workItem.metadata && typeof workItem.metadata === "object" ? workItem.metadata : {};
  return clean(metadata.contact_id || metadata.contactId) || null;
}

function shouldIncludeUnscheduled(status: string, updatedAt: unknown, pipelineValue: number, now: Date) {
  if (["VIEWING", "NEGOTIATION"].includes(status)) return true;
  if (pipelineValue >= 300_000) return true;
  const updated = validDate(updatedAt);
  return !updated || now.getTime() - updated.getTime() >= 3 * 86_400_000;
}

export function buildExecutionWorkspace(input: ExecutionInput): ExecutionWorkspace {
  const now = input.now || new Date();
  const openWorkItems = input.workItems.filter((row) => OPEN_WORK_STATUSES.has(normalizeStatus(row.status)));
  const taskByContact = new Map<string, any>();
  for (const task of openWorkItems) {
    const contactId = openTaskContactId(task);
    if (contactId && !taskByContact.has(contactId)) taskByContact.set(contactId, task);
  }

  const items: ExecutionItem[] = [];
  for (const contact of input.contacts) {
    const status = normalizeStatus(contact.pipeline_status || contact.status || contact.stage);
    const dueDate = dueFromContact(contact);
    const pipelineValue = Number(contact.pipeline_value || contact.sale_price || 0);
    if (!ACTIVE_STATUSES.has(status) && !dueDate) continue;
    if (!dueDate && !shouldIncludeUnscheduled(status, contact.updated_at, pipelineValue, now)) continue;

    const id = clean(contact.id);
    if (!id) continue;
    const kind = contactKind(contact, status);
    const urgency = urgencyFor(dueDate, now);
    const priority = priorityForContact(status, urgency, pipelineValue);
    const name = clean(contact.name || contact.email || contact.phone) || "kunde";
    const existingTask = taskByContact.get(id);
    const title = contactTitle(kind, name);
    const detailParts = [`Pipeline: ${status}`];
    if (pipelineValue > 0) detailParts.push(`Verdi: €${Math.round(pipelineValue).toLocaleString("nb-NO")}`);
    if (!dueDate) detailParts.push("Neste oppfølging mangler");
    if (existingTask) detailParts.push(`Åpen oppgave: ${clean(existingTask.title)}`);

    items.push({
      id: `contact:${id}`,
      kind,
      sourceId: id,
      contactId: id,
      workItemId: existingTask?.id ? clean(existingTask.id) : null,
      brandId: brand(contact.brand_id || contact.brand),
      title,
      detail: detailParts.join(" · "),
      dueDate,
      urgency,
      priority,
      score: itemScore(priority, urgency, status === "NEGOTIATION" ? 15 : status === "VIEWING" ? 10 : 0),
      status,
      customerHref: `/customers/${encodeURIComponent(id)}`,
      workspaceHref: workspaceHref(kind),
      canCreateTask: !existingTask,
      canScheduleFollowup: true,
      canCompleteTask: Boolean(existingTask?.id),
      calendar: {
        title,
        description: `RealtyFlow-oppfølging. ${detailParts.join(". ")}. Kunde-ID: ${id}`,
        durationMinutes: calendarDuration(kind),
      },
    });
  }

  const representedTasks = new Set(items.map((item) => item.workItemId).filter(Boolean));
  for (const task of openWorkItems) {
    const id = clean(task.id);
    if (!id || representedTasks.has(id)) continue;
    const dueDate = dateOnly(task.due_date || task.dueDate);
    const urgency = urgencyFor(dueDate, now);
    const priority = priorityFromWork(task.priority);
    const contactId = openTaskContactId(task);
    const title = clean(task.title) || "Oppgave";
    const detail = clean(task.next_action || task.description || "Intern oppgave");
    items.push({
      id: `task:${id}`,
      kind: "WORK_ITEM",
      sourceId: clean(task.source_id) || id,
      contactId,
      workItemId: id,
      brandId: brand(task.brand_id || task.brand),
      title,
      detail,
      dueDate,
      urgency,
      priority,
      score: itemScore(priority, urgency, Number(task.ai_score || 0) / 10),
      status: normalizeStatus(task.status),
      customerHref: contactId ? `/customers/${encodeURIComponent(contactId)}` : null,
      workspaceHref: "/marketing-tasks",
      canCreateTask: false,
      canScheduleFollowup: false,
      canCompleteTask: true,
      calendar: {
        title,
        description: `RealtyFlow-oppgave. ${detail}. Oppgave-ID: ${id}`,
        durationMinutes: 30,
      },
    });
  }

  const urgencyRank: Record<ExecutionUrgency, number> = { OVERDUE: 0, TODAY: 1, THIS_WEEK: 2, UNSCHEDULED: 3, LATER: 4 };
  items.sort((a, b) => b.score - a.score || urgencyRank[a.urgency] - urgencyRank[b.urgency] || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startOfDay(now), index).toISOString().slice(0, 10);
    const dayItems = items.filter((item) => item.dueDate === date);
    return {
      date,
      label: index === 0 ? "I dag" : new Date(`${date}T12:00:00.000Z`).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" }),
      count: dayItems.length,
      critical: dayItems.filter((item) => item.priority === "CRITICAL").length,
    };
  });

  return {
    generatedAt: now.toISOString(),
    summary: {
      total: items.length,
      overdue: items.filter((item) => item.urgency === "OVERDUE").length,
      today: items.filter((item) => item.urgency === "TODAY").length,
      thisWeek: items.filter((item) => item.urgency === "THIS_WEEK").length,
      unscheduled: items.filter((item) => item.urgency === "UNSCHEDULED").length,
      critical: items.filter((item) => item.priority === "CRITICAL").length,
      contacts: items.filter((item) => item.contactId).length,
      workItems: items.filter((item) => item.workItemId).length,
    },
    days,
    items,
    warnings: input.warnings || [],
    safety: {
      automaticTaskCreation: false,
      automaticCalendarCreation: false,
      automaticCustomerContact: false,
      explicitConfirmationRequired: true,
    },
  };
}
