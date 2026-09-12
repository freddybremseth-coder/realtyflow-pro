import type { CommandAction, RevenueCommandCenter } from "@/lib/revenue/command";
import {
  policyForRevenueAction,
  type NexusActionPolicyClass,
  type NexusActionType,
} from "@/lib/nexus/action-policy-registry";

export type RevenueBrainPolicyClass = NexusActionPolicyClass;

export interface RevenueBrainAction {
  id: string;
  rank: number;
  opportunityScore: number;
  priority: CommandAction["priority"];
  source: CommandAction["source"];
  title: string;
  subject: string;
  recommendedAction: string;
  href: string;
  contactId: string | null;
  expectedValueEur: number;
  policyClass: RevenueBrainPolicyClass;
  policyActionType: NexusActionType;
  policyReason: string;
  rationale: string[];
  automaticExecutionAllowed: false;
}

export interface RevenueBrainSnapshot {
  generatedAt: string;
  mode: "READ_ONLY_V1";
  actions: RevenueBrainAction[];
  summary: {
    considered: number;
    ranked: number;
    critical: number;
    humanRequired: number;
    draftOnly: number;
    autoSafe: number;
    wait: number;
    forbidden: number;
    representedValueEur: number;
  };
  safety: {
    readOnly: true;
    automaticExecution: false;
    automaticSending: false;
    automaticApproval: false;
    automaticCriteriaChanges: false;
    explicitPolicyRequiredForFutureAutonomy: true;
    policyRegistryEnforced: true;
  };
}

const SOURCE_WEIGHT: Record<CommandAction["source"], number> = {
  today: 9,
  closing: 14,
  approvals: 5,
  commissions: 11,
  recovery: 7,
  "service-revenue": 6,
  "after-sales": 4,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function valueSignal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp(Math.log10(value + 1) * 6, 0, 28);
}

function prioritySignal(priority: CommandAction["priority"]) {
  if (priority === "CRITICAL") return 24;
  if (priority === "HIGH") return 15;
  return 7;
}

function rationaleFor(
  action: CommandAction,
  opportunityScore: number,
  policyClass: RevenueBrainPolicyClass,
  policyReason: string,
) {
  const rationale: string[] = [];
  if (action.priority === "CRITICAL") rationale.push("Kilden har klassifisert saken som kritisk.");
  else if (action.priority === "HIGH") rationale.push("Kilden har klassifisert saken som høyt prioritert.");
  if (action.value > 0) rationale.push(`Registrert kommersiell verdi: ca. €${Math.round(action.value).toLocaleString("nb-NO")}.`);
  if (SOURCE_WEIGHT[action.source] >= 10) rationale.push("Arbeidsstrømmen har høy kommersiell eller tidsmessig konsekvens.");
  rationale.push(`Samlet Revenue Brain-score: ${opportunityScore}/100.`);
  rationale.push(`Policy: ${policyReason}`);
  if (policyClass === "HUMAN_REQUIRED") rationale.push("Handling krever menneskelig beslutning etter gjeldende sikkerhetspolicy.");
  if (policyClass === "DRAFT_ONLY") rationale.push("Nexus kan forberede arbeidet, men utfører ikke kunde- eller kommersiell sideeffekt automatisk.");
  if (policyClass === "FORBIDDEN") rationale.push("Handlingen er eksplisitt forbudt for autonom utførelse.");
  if (policyClass === "WAIT") rationale.push("Nexus skal vente på nytt signal eller planlagt tidspunkt.");
  return rationale;
}

function scoreAction(action: CommandAction) {
  const normalizedExisting = clamp(action.score, 0, 120) / 1.2;
  const score = normalizedExisting * 0.58
    + prioritySignal(action.priority)
    + SOURCE_WEIGHT[action.source]
    + valueSignal(action.value);
  return Math.round(clamp(score));
}

export function buildRevenueBrain(command: RevenueCommandCenter, limit = 10): RevenueBrainSnapshot {
  const source = Array.isArray(command.topActions) ? command.topActions : [];
  const deduped = new Map<string, CommandAction>();

  for (const action of source) {
    const key = action.contactId ? `contact:${action.contactId}` : `${action.source}:${action.id}`;
    const existing = deduped.get(key);
    if (!existing || scoreAction(action) > scoreAction(existing) || (scoreAction(action) === scoreAction(existing) && action.value > existing.value)) {
      deduped.set(key, action);
    }
  }

  const ranked = [...deduped.values()]
    .map((action) => {
      const opportunityScore = scoreAction(action);
      const policy = policyForRevenueAction(action);
      return { action, opportunityScore, policy };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.action.value - a.action.value || a.action.subject.localeCompare(b.action.subject, "nb"))
    .slice(0, Math.max(1, Math.min(25, limit)))
    .map(({ action, opportunityScore, policy }, index): RevenueBrainAction => ({
      id: action.id,
      rank: index + 1,
      opportunityScore,
      priority: action.priority,
      source: action.source,
      title: action.title,
      subject: action.subject,
      recommendedAction: action.description,
      href: action.href,
      contactId: action.contactId,
      expectedValueEur: Number.isFinite(action.value) ? Math.max(0, action.value) : 0,
      policyClass: policy.policyClass,
      policyActionType: policy.actionType,
      policyReason: policy.reason,
      rationale: rationaleFor(action, opportunityScore, policy.policyClass, policy.reason),
      automaticExecutionAllowed: false,
    }));

  return {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_V1",
    actions: ranked,
    summary: {
      considered: source.length,
      ranked: ranked.length,
      critical: ranked.filter((item) => item.priority === "CRITICAL").length,
      humanRequired: ranked.filter((item) => item.policyClass === "HUMAN_REQUIRED").length,
      draftOnly: ranked.filter((item) => item.policyClass === "DRAFT_ONLY").length,
      autoSafe: ranked.filter((item) => item.policyClass === "AUTO_SAFE").length,
      wait: ranked.filter((item) => item.policyClass === "WAIT").length,
      forbidden: ranked.filter((item) => item.policyClass === "FORBIDDEN").length,
      representedValueEur: Math.round(ranked.reduce((sum, item) => sum + item.expectedValueEur, 0)),
    },
    safety: {
      readOnly: true,
      automaticExecution: false,
      automaticSending: false,
      automaticApproval: false,
      automaticCriteriaChanges: false,
      explicitPolicyRequiredForFutureAutonomy: true,
      policyRegistryEnforced: true,
    },
  };
}
