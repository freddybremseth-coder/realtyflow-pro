import { hasPermission, type AccessRole } from "@/lib/access-control";
import type { RevenueCommandCenter, CommandAction } from "@/lib/revenue/command";
import type { RevenueGoalScorecard, GoalMetric } from "@/lib/revenue/goals";
import type { InternalAlert, InternalAlertCenter } from "@/lib/revenue/internal-alerts";
import type { ExecutionItem, ExecutionWorkspace } from "@/lib/revenue/execution";
import type { TeamWorkloadWorkspace } from "@/lib/revenue/team-workload";

export type ExecutiveBriefingState = "CRITICAL" | "ATTENTION" | "ON_TRACK";
export type ExecutiveDecisionSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
export type ExecutiveDecisionSource =
  | "ALERTS"
  | "SALES"
  | "CLOSING"
  | "FINANCE"
  | "KEYHOLDING"
  | "EXECUTION"
  | "GOALS"
  | "TEAM";

export interface BriefingCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  href: string | null;
}

export interface ExecutiveDecision {
  id: string;
  source: ExecutiveDecisionSource;
  severity: ExecutiveDecisionSeverity;
  score: number;
  title: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  href: string;
  contactId: string | null;
  ownerEmail: string | null;
  dueAt: string | null;
  amountEur: number | null;
}

export interface ExecutiveBriefing {
  generatedAt: string;
  role: AccessRole;
  roleLabel: string;
  state: ExecutiveBriefingState;
  headline: string;
  summary: {
    activeAlerts: number;
    criticalAlerts: number;
    decisionsToday: number;
    overdueExecution: number;
    calendarToday: number;
    highRiskClosings: number | null;
    overdueCommission: number | null;
    keyholdingRenewals: number | null;
    goalsBehind: number;
    unassignedPriorityWork: number;
  };
  decisions: ExecutiveDecision[];
  agenda: BriefingCalendarEvent[];
  goals: GoalMetric[];
  team: {
    members: number;
    overloaded: number;
    unassigned: number;
    overdue: number;
  };
  dataSources: Array<{
    id: string;
    label: string;
    available: boolean;
    generatedAt: string | null;
    warning: string | null;
  }>;
  warnings: string[];
  safety: {
    readOnly: true;
    automaticSending: false;
    automaticTaskCreation: false;
    automaticCalendarChanges: false;
    automaticPipelineChanges: false;
  };
}

export interface ExecutiveBriefingInput {
  role: AccessRole;
  userEmail: string;
  command: RevenueCommandCenter;
  goals: RevenueGoalScorecard;
  alerts: InternalAlertCenter;
  execution: ExecutionWorkspace;
  team: TeamWorkloadWorkspace;
  calendarEvents?: BriefingCalendarEvent[];
  calendarConfigured?: boolean;
  calendarWarning?: string | null;
  warnings?: string[];
  now?: Date;
}

const ROLE_LABELS: Record<AccessRole, string> = {
  OWNER: "Owner",
  SALES: "Sales",
  CLOSING: "Closing",
  FINANCE: "Finance",
  MARKETING: "Marketing",
  KEYHOLDING: "Keyholding",
  VIEWER: "Read-only",
};

const SEVERITY_WEIGHT: Record<ExecutiveDecisionSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
};

function permission(role: AccessRole, value: Parameters<typeof hasPermission>[1]) {
  return role === "OWNER" || hasPermission(role, value);
}

function alertVisible(role: AccessRole, alert: InternalAlert) {
  if (alert.category === "FINANCE") return permission(role, "finance.read");
  if (alert.category === "CLOSING") return permission(role, "closing.read");
  if (alert.category === "KEYHOLDING") return permission(role, "keyholding.read");
  if (alert.category === "EXECUTION") return permission(role, "execution.read");
  return permission(role, "revenue.read");
}

function commandVisible(role: AccessRole, action: CommandAction) {
  if (action.source === "commissions") return permission(role, "finance.read");
  if (action.source === "closing") return permission(role, "closing.read");
  if (action.source === "service-revenue") return permission(role, "keyholding.read");
  if (action.source === "approvals") return permission(role, "revenue.read");
  return permission(role, "revenue.read");
}

function commandSource(action: CommandAction): ExecutiveDecisionSource {
  if (action.source === "commissions") return "FINANCE";
  if (action.source === "closing") return "CLOSING";
  if (action.source === "service-revenue") return "KEYHOLDING";
  return "SALES";
}

function alertSource(alert: InternalAlert): ExecutiveDecisionSource {
  if (alert.category === "FINANCE") return "FINANCE";
  if (alert.category === "CLOSING") return "CLOSING";
  if (alert.category === "KEYHOLDING") return "KEYHOLDING";
  if (alert.category === "TEAM") return "TEAM";
  return "EXECUTION";
}

function severityFromAlert(value: InternalAlert["severity"]): ExecutiveDecisionSeverity {
  if (value === "CRITICAL") return "CRITICAL";
  if (value === "HIGH") return "HIGH";
  return "MEDIUM";
}

function severityFromCommand(value: CommandAction["priority"]): ExecutiveDecisionSeverity {
  if (value === "CRITICAL") return "CRITICAL";
  if (value === "HIGH") return "HIGH";
  return "MEDIUM";
}

function executionSeverity(item: ExecutionItem): ExecutiveDecisionSeverity {
  if (item.priority === "CRITICAL" || (item.urgency === "OVERDUE" && item.priority === "HIGH")) return "CRITICAL";
  if (item.priority === "HIGH" || item.urgency === "OVERDUE") return "HIGH";
  return "MEDIUM";
}

function madridDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function goalVisible(role: AccessRole, metric: GoalMetric) {
  if (metric.id === "commission") return permission(role, "finance.read");
  if (metric.id === "keyholding-mrr" || metric.id === "keyholding-contracts") return permission(role, "keyholding.read");
  return permission(role, "revenue.read");
}

function goalDecision(metric: GoalMetric): ExecutiveDecision | null {
  if (metric.status !== "BEHIND" && metric.status !== "AT_RISK") return null;
  const severity: ExecutiveDecisionSeverity = metric.status === "BEHIND" ? "HIGH" : "MEDIUM";
  const href = metric.id === "commission" ? "/commissions" : metric.id.startsWith("keyholding") ? "/service-revenue" : metric.id === "recovery" ? "/recovery" : "/goals";
  const targetText = metric.target === null ? "mål ikke satt" : `${Math.round(metric.actual)} av ${Math.round(metric.target)}`;
  return {
    id: `goal:${metric.id}`,
    source: "GOALS",
    severity,
    score: metric.status === "BEHIND" ? 72 : 56,
    title: metric.status === "BEHIND" ? "Mål ligger bak plan" : "Mål krever oppmerksomhet",
    subject: metric.label,
    detail: `${targetText}. ${metric.detail}`,
    recommendedAction: "Åpne målbildet og velg ett konkret tiltak for resten av perioden.",
    href,
    contactId: null,
    ownerEmail: null,
    dueAt: null,
    amountEur: metric.unit === "EUR" && metric.gap !== null ? metric.gap : null,
  };
}

function decisionKey(item: ExecutiveDecision) {
  if (item.contactId) return `contact:${item.contactId}:${item.source}`;
  return item.id;
}

function dedupeAndSort(items: ExecutiveDecision[]) {
  const selected = new Map<string, ExecutiveDecision>();
  for (const item of items.sort((a, b) => {
    return SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.score - a.score || (b.amountEur || 0) - (a.amountEur || 0);
  })) {
    const key = decisionKey(item);
    if (!selected.has(key)) selected.set(key, item);
  }
  return [...selected.values()].slice(0, 8);
}

function roleHeadline(role: AccessRole, state: ExecutiveBriefingState, decisions: ExecutiveDecision[]) {
  const first = decisions[0];
  if (first) {
    if (state === "CRITICAL") return `Start med ${first.subject}: ${first.recommendedAction}`;
    if (state === "ATTENTION") return `${decisions.length} prioriterte beslutninger bør avklares i dagens gjennomgang.`;
  }
  if (role === "FINANCE") return "Økonomisk oppfølging er under kontroll. Kontroller neste faktura- og betalingsfrist.";
  if (role === "CLOSING") return "Closing-køen er under kontroll. Bekreft neste konkrete milepæl i hver aktiv handel.";
  if (role === "KEYHOLDING") return "Serviceporteføljen er under kontroll. Følg dagens leveranser og kommende fornyelser.";
  if (role === "MARKETING") return "Markedsføringsbildet er stabilt. Prioriter datakvalitet og kanaler med dokumentert effekt.";
  if (role === "SALES") return "Salgsdagen er under kontroll. Gjennomfør de viktigste kundeoppfølgingene først.";
  return "Revenue OS er under kontroll. Bruk briefingen til å bekrefte dagens viktigste beslutninger.";
}

export function buildExecutiveBriefing(input: ExecutiveBriefingInput): ExecutiveBriefing {
  const now = input.now || new Date();
  const visibleAlerts = input.alerts.active.filter((alert) => alertVisible(input.role, alert));
  const visibleCommandActions = input.command.topActions.filter((action) => commandVisible(input.role, action));
  const visibleGoals = input.goals.metrics.filter((metric) => goalVisible(input.role, metric));
  const canSeeExecution = permission(input.role, "execution.read");
  const todayKey = madridDateKey(now);
  const agenda = (canSeeExecution ? input.calendarEvents || [] : [])
    .filter((event) => madridDateKey(event.start) === todayKey)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 12);

  const decisions: ExecutiveDecision[] = [];
  for (const alert of visibleAlerts.slice(0, 12)) {
    decisions.push({
      id: `alert:${alert.id}`,
      source: alertSource(alert),
      severity: severityFromAlert(alert.severity),
      score: Math.min(120, alert.score + (alert.escalation === "IMMEDIATE" ? 20 : alert.escalation === "TODAY" ? 10 : 0)),
      title: alert.title,
      subject: alert.ownerName || alert.title,
      detail: alert.reason || alert.detail,
      recommendedAction: alert.recommendedAction,
      href: alert.href,
      contactId: alert.contactId,
      ownerEmail: alert.ownerEmail,
      dueAt: alert.dueAt,
      amountEur: alert.amountEur,
    });
  }

  for (const action of visibleCommandActions.slice(0, 12)) {
    decisions.push({
      id: `command:${action.id}`,
      source: commandSource(action),
      severity: severityFromCommand(action.priority),
      score: action.score,
      title: action.title,
      subject: action.subject,
      detail: action.description,
      recommendedAction: action.description,
      href: action.href,
      contactId: action.contactId,
      ownerEmail: null,
      dueAt: null,
      amountEur: action.value || null,
    });
  }

  if (canSeeExecution) {
    for (const item of input.execution.items.filter((row) => row.urgency === "OVERDUE" || row.urgency === "TODAY").slice(0, 10)) {
      decisions.push({
        id: `execution:${item.id}`,
        source: "EXECUTION",
        severity: executionSeverity(item),
        score: item.score,
        title: item.urgency === "OVERDUE" ? "Forfalt handling" : "Handling i dag",
        subject: item.title,
        detail: item.detail,
        recommendedAction: item.urgency === "OVERDUE" ? "Åpne saken og registrer et konkret neste steg i dag." : "Gjennomfør eller omplanlegg handlingen eksplisitt.",
        href: item.workspaceHref,
        contactId: item.contactId,
        ownerEmail: null,
        dueAt: item.dueDate,
        amountEur: null,
      });
    }
  }

  for (const metric of visibleGoals) {
    const item = goalDecision(metric);
    if (item) decisions.push(item);
  }

  const topDecisions = dedupeAndSort(decisions);
  const state: ExecutiveBriefingState = topDecisions.some((item) => item.severity === "CRITICAL")
    ? "CRITICAL"
    : topDecisions.some((item) => item.severity === "HIGH")
      ? "ATTENTION"
      : "ON_TRACK";

  const financeVisible = permission(input.role, "finance.read");
  const closingVisible = permission(input.role, "closing.read");
  const keyholdingVisible = permission(input.role, "keyholding.read");
  const goalsBehind = visibleGoals.filter((metric) => metric.status === "BEHIND" || metric.status === "AT_RISK").length;
  const overloaded = input.team.members.filter((member) => member.load === "HIGH").length;
  const warnings = [...new Set([
    ...(input.warnings || []),
    ...input.command.warnings,
    ...input.goals.warnings,
    ...input.alerts.warnings,
    ...input.execution.warnings,
    ...input.team.warnings,
    ...(canSeeExecution && input.calendarWarning ? [input.calendarWarning] : []),
  ].filter(Boolean))];

  return {
    generatedAt: now.toISOString(),
    role: input.role,
    roleLabel: ROLE_LABELS[input.role],
    state,
    headline: roleHeadline(input.role, state, topDecisions),
    summary: {
      activeAlerts: visibleAlerts.length,
      criticalAlerts: visibleAlerts.filter((alert) => alert.severity === "CRITICAL").length,
      decisionsToday: topDecisions.length,
      overdueExecution: canSeeExecution ? input.execution.summary.overdue : 0,
      calendarToday: agenda.length,
      highRiskClosings: closingVisible ? input.command.summary.closingHighRisk : null,
      overdueCommission: financeVisible ? input.command.summary.overdueCommission : null,
      keyholdingRenewals: keyholdingVisible ? input.alerts.active.filter((alert) => alert.ruleId === "KEYHOLDING_RENEWAL").length : null,
      goalsBehind,
      unassignedPriorityWork: input.alerts.active.filter((alert) => alert.ruleId === "UNASSIGNED_PRIORITY_WORK").length,
    },
    decisions: topDecisions,
    agenda,
    goals: visibleGoals,
    team: {
      members: input.team.summary.members,
      overloaded,
      unassigned: input.team.summary.unassignedContacts + input.team.summary.unassignedTasks,
      overdue: input.team.summary.overdue,
    },
    dataSources: [
      { id: "crm", label: "CRM og Revenue Command", available: true, generatedAt: input.command.generatedAt, warning: null },
      { id: "alerts", label: "Interne varsler", available: true, generatedAt: input.alerts.generatedAt, warning: null },
      { id: "goals", label: "Mål og ukeplan", available: true, generatedAt: input.goals.generatedAt, warning: null },
      { id: "execution", label: "Execution og oppgaver", available: true, generatedAt: input.execution.generatedAt, warning: null },
      { id: "team", label: "Team og arbeidsfordeling", available: true, generatedAt: input.team.generatedAt, warning: null },
      { id: "calendar", label: "Google Calendar", available: Boolean(input.calendarConfigured), generatedAt: input.calendarConfigured ? now.toISOString() : null, warning: canSeeExecution ? input.calendarWarning || null : null },
    ],
    warnings,
    safety: {
      readOnly: true,
      automaticSending: false,
      automaticTaskCreation: false,
      automaticCalendarChanges: false,
      automaticPipelineChanges: false,
    },
  };
}
